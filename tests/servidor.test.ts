import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// La IA y el consentimiento se simulan: estas pruebas no llaman a Claude ni a Firebase.
const create = vi.fn();
const assertConsent = vi.fn();

vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class FakeAnthropic {
    static AuthenticationError = actual.default.AuthenticationError;
    messages = { create };
  }
  return { ...actual, default: FakeAnthropic };
});

vi.mock('../consentHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../consentHttp')>();
  return { ...actual, assertConsentFromRequest: assertConsent };
});

const VALID_KEY = `sk-ant-api03-${'a'.repeat(40)}`;

async function loadApp(key: string = VALID_KEY): Promise<Express> {
  vi.resetModules();
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('ANTHROPIC_API_KEY', key);
  return (await import('../server')).default as Express;
}

function reply(text: string, stop_reason = 'end_turn') {
  return { content: [{ type: 'text', text }], stop_reason, usage: { input_tokens: 10, output_tokens: 10 } };
}

async function authError() {
  const { AuthenticationError } = (await vi.importActual<typeof import('@anthropic-ai/sdk')>('@anthropic-ai/sdk')).default;
  return new AuthenticationError(401, undefined, 'invalid x-api-key', new Headers());
}

const context = {
  showPhases: true, phase: 'Lútea', approximate: false, cycleDay: 24, cycleLength: 28, periodLength: 5,
  hormonalMethod: 'ninguna', specialSituation: 'ninguna', conditions: {},
  log: { date: '2026-11-17', energy: 2, sleepHours: 5 }, recent: [],
};

const planBody = {
  nombre: 'Prueba', actividad: 'Ordenar facturas', notas: null, fecha_inicio: '2026-11-18', hora_inicio: '10:00',
  dia_ciclo: 24, duracion_ciclo: 28, fase: 'lutea', energia: 'sin_energia',
};

const assistJson = JSON.stringify({
  necesita_datos: false, pregunta: null, nombre: 'Preparar presentación', descripcion: 'Ordenar el contenido.',
  pasos: ['Definir objetivo', 'Armar diapositivas'], esfuerzo: 'alto', esfuerzo_motivo: 'Es orientativa.', duracion_min: 120,
});

beforeEach(() => {
  create.mockReset();
  assertConsent.mockReset();
  assertConsent.mockResolvedValue(undefined);
});

describe('Todas las rutas de IA piden la autorización del asistente', () => {
  it.each([
    ['/api/analyze', { context }],
    ['/api/chat', { message: 'hola', context }],
    ['/api/plan-activity', planBody],
    ['/api/assist-activity', { texto: 'preparar presentación' }],
  ])('%s responde el error de consentimiento y no llama a la IA', async (path, body) => {
    const app = await loadApp();
    const { ConsentError } = await import('../consentHttp');
    assertConsent.mockRejectedValueOnce(new ConsentError(403, 'Falta una autorización vigente para esta función.'));
    const res = await request(app).post(path).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/autorización vigente/);
    expect(assertConsent).toHaveBeenCalledWith(expect.anything(), 'gemini_assistant');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('POST /api/analyze', () => {
  it('pide el contexto del ciclo', async () => {
    const res = await request(await loadApp()).post('/api/analyze').send({});
    expect(res.status).toBe(400);
  });

  it('usa Claude Haiku 5.5 con esfuerzo bajo y las reglas de Cyclia', async () => {
    create.mockResolvedValueOnce(reply('🌸 Resumen del día\nEnergía baja.'));
    const res = await request(await loadApp()).post('/api/analyze').send({ context });
    expect(res.status).toBe(200);
    expect(res.body.analysis).toBe('🌸 Resumen del día\nEnergía baja.');
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.system).toMatch(/Cyclia no diagnostica ni receta/);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].content).toMatch(/Fase estimada: Lútea/);
  });

  it('sin fase en el contexto, le dice a la IA que no la invente', async () => {
    create.mockResolvedValueOnce(reply('ok'));
    await request(await loadApp()).post('/api/analyze').send({ context: { ...context, showPhases: false, phase: null } });
    expect(create.mock.calls[0][0].messages[0].content).toMatch(/Sin fase en el calendario/);
  });

  it('si la IA se niega a responder, devuelve un mensaje amable', async () => {
    create.mockResolvedValueOnce(reply('', 'refusal'));
    const res = await request(await loadApp()).post('/api/analyze').send({ context });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/no pudo analizar/);
  });

  it('con la clave inválida responde 503 con un mensaje claro', async () => {
    create.mockRejectedValueOnce(await authError());
    const res = await request(await loadApp()).post('/api/analyze').send({ context });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/falta configurar la clave/);
  });

  it('sin clave configurada responde 503 sin llamar a la IA', async () => {
    const res = await request(await loadApp('')).post('/api/analyze').send({ context });
    expect(res.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('POST /api/chat', () => {
  it('pide un mensaje', async () => {
    const res = await request(await loadApp()).post('/api/chat').send({ message: '   ' });
    expect(res.status).toBe(400);
  });

  it('envía el historial empezando por un mensaje de ella y termina con la pregunta nueva', async () => {
    create.mockResolvedValueOnce(reply('Respuesta de Cyclia'));
    const chatHistory = [
      { role: 'assistant', content: '¡Hola! Soy Cyclia.' },
      { role: 'user', content: '¿Qué fase es?' },
      { role: 'assistant', content: 'Lútea, estimada.' },
      { role: 'user', content: '' },
    ];
    const res = await request(await loadApp()).post('/api/chat').send({ message: '¿Y mañana?', chatHistory, context });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Respuesta de Cyclia');
    const { messages, system } = create.mock.calls[0][0];
    expect(messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages.at(-1).content).toBe('¿Y mañana?');
    expect(system).toMatch(/DATOS QUE SÍ LLEGARON/);
  });

  it('envía como máximo los últimos 20 mensajes del historial', async () => {
    create.mockResolvedValueOnce(reply('ok'));
    const chatHistory = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    await request(await loadApp()).post('/api/chat').send({ message: 'nueva', chatHistory });
    expect(create.mock.calls[0][0].messages.length).toBeLessThanOrEqual(21);
  });
});

describe('POST /api/plan-activity', () => {
  it('rechaza datos incompletos', async () => {
    const res = await request(await loadApp()).post('/api/plan-activity').send({ actividad: 'x' });
    expect(res.status).toBe(400);
  });

  it('sin clave usa el cálculo local, sin llamar a la IA', async () => {
    const res = await request(await loadApp('')).post('/api/plan-activity').send(planBody);
    expect(res.status).toBe(200);
    expect(res.body.proposal.duracion_min).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('con IA devuelve la propuesta ajustada', async () => {
    create.mockResolvedValueOnce(reply('{"duracion_min": 32, "motivo": "Muchas mujeres reportan menos energía en la fase lútea.", "pasos": ["Reunir"], "aviso": null, "dividir_en_bloques": false}'));
    const res = await request(await loadApp()).post('/api/plan-activity').send(planBody);
    expect(res.status).toBe(200);
    expect(res.body.proposal).toMatchObject({ duracion_min: 30, hora_termino: '10:30' });
  });

  it('si la IA no responde en formato, reintenta una vez y luego responde 422', async () => {
    create.mockResolvedValue(reply('no es json'));
    const res = await request(await loadApp()).post('/api/plan-activity').send(planBody);
    expect(res.status).toBe(422);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('con la clave inválida vuelve al cálculo local', async () => {
    create.mockRejectedValueOnce(await authError());
    const res = await request(await loadApp()).post('/api/plan-activity').send(planBody);
    expect(res.status).toBe(200);
    expect(res.body.proposal.duracion_min).toBeGreaterThan(0);
  });
});

describe('POST /api/assist-activity', () => {
  it('pide la descripción de la actividad', async () => {
    const res = await request(await loadApp()).post('/api/assist-activity').send({ texto: '' });
    expect(res.status).toBe(400);
  });

  it('sin clave responde con la estimación local y lo indica', async () => {
    const res = await request(await loadApp('')).post('/api/assist-activity').send({ texto: 'preparar presentación del cliente 2 horas' });
    expect(res.body.fuente).toBe('local');
    expect(create).not.toHaveBeenCalled();
  });

  it('con IA devuelve los pasos y la fuente ia', async () => {
    create.mockResolvedValueOnce(reply(assistJson));
    const res = await request(await loadApp()).post('/api/assist-activity').send({ texto: 'preparar presentación' });
    expect(res.status).toBe(200);
    expect(res.body.fuente).toBe('ia');
    expect(res.body.analysis.pasos).toHaveLength(2);
  });

  it('se recupera si la primera respuesta no viene en formato', async () => {
    create.mockResolvedValueOnce(reply('texto suelto')).mockResolvedValueOnce(reply(assistJson));
    const res = await request(await loadApp()).post('/api/assist-activity').send({ texto: 'preparar presentación' });
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
    const retry = create.mock.calls[1][0].messages;
    expect(retry[0].content).toBe('preparar presentación');
    expect(retry.at(-1).content).toMatch(/no cumplió el formato/);
  });

  it('con la clave inválida vuelve a la estimación local', async () => {
    create.mockRejectedValueOnce(await authError());
    const res = await request(await loadApp()).post('/api/assist-activity').send({ texto: 'preparar presentación del cliente' });
    expect(res.body.fuente).toBe('local');
  });

  it('envía la conversación completa a la IA, para que no olvide lo que ya respondió', async () => {
    create.mockResolvedValueOnce(reply(assistJson.replace('"duracion_min":120', '"duracion_min":120,"fecha":"2026-11-20","hora":"10:00"')));
    const mensajes = [
      { role: 'user', texto: 'Preparar una presentación' },
      { role: 'assistant', texto: '¿Para quién es y cuánto debe durar?' },
      { role: 'user', texto: 'Para el cliente, 20 minutos de exposición, el viernes a las 10' },
    ];
    const res = await request(await loadApp()).post('/api/assist-activity').send({ mensajes, hoy: '2026-11-17' });
    expect(res.status).toBe(200);
    const sent = create.mock.calls[0][0].messages;
    expect(sent.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent[0].content).toMatch(/Hoy es martes 2026-11-17/);
    expect(sent[2].content).toMatch(/el viernes a las 10/);
    expect(res.body.analysis).toMatchObject({ fecha: '2026-11-20', hora: '10:00' });
  });

  it('cuando la IA tiene dudas, devuelve una sola pregunta', async () => {
    create.mockResolvedValueOnce(reply('{"necesita_datos": true, "pregunta": "¿Cuántas diapositivas necesitas?"}'));
    const res = await request(await loadApp()).post('/api/assist-activity').send({ mensajes: [{ role: 'user', texto: 'presentación' }] });
    expect(res.body.analysis).toMatchObject({ necesita_datos: true, pregunta: '¿Cuántas diapositivas necesitas?' });
  });

  it('rechaza una conversación sin mensajes de ella', async () => {
    const res = await request(await loadApp()).post('/api/assist-activity').send({ mensajes: [{ role: 'assistant', texto: 'Hola' }] });
    expect(res.status).toBe(400);
  });
});

describe('Rutas de cuenta sin sesión', () => {
  it.each(['/api/consent/status', '/api/consent/history', '/api/account/export'])('%s exige iniciar sesión', async (path) => {
    const res = await request(await loadApp()).get(path);
    expect(res.status).toBe(401);
  });

  it('rechaza un cuerpo que no es JSON válido', async () => {
    const res = await request(await loadApp()).post('/api/chat').set('Content-Type', 'application/json').send('{malo');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/behavior-pattern', () => {
  const actual = { block: 2, recordDays: 26, averages: { energy: 3.1 }, sleep: { shortDays: 9 } };
  const reportJson = JSON.stringify({
    titulo: 'Tu patrón en tu segundo mes',
    resumen: 'Registraste 26 de 30 días y tu energía promedio fue 3,1 de 5.',
    patrones: [{ texto: 'Cuando duermes bien tu energía sube.', respaldo: '9 días con sueño corto' }],
    sugerencia: 'Deja lo exigente para después de una buena noche.',
  });

  it('pide la autorización del asistente', async () => {
    const app = await loadApp();
    const { ConsentError } = await import('../consentHttp');
    assertConsent.mockRejectedValueOnce(new ConsentError(403, 'Falta una autorización vigente para esta función.'));
    const res = await request(app).post('/api/behavior-pattern').send({ actual });
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('envía solo los parámetros del mes y el mes anterior, y devuelve el patrón', async () => {
    create.mockResolvedValueOnce(reply(reportJson));
    const res = await request(await loadApp()).post('/api/behavior-pattern').send({ actual, anterior: { block: 1 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fuente: 'ia', report: { titulo: 'Tu patrón en tu segundo mes' } });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.system).toMatch(/Estudias el comportamiento/);
    expect(JSON.parse(params.messages[0].content)).toEqual({ actual, anterior: { block: 1 } });
  });

  it('sin clave devuelve fuente local para que la app arme el patrón', async () => {
    const res = await request(await loadApp('')).post('/api/behavior-pattern').send({ actual });
    expect(res.body).toEqual({ report: null, fuente: 'local' });
    expect(create).not.toHaveBeenCalled();
  });

  it('rechaza parámetros vacíos o demasiado largos', async () => {
    const app = await loadApp();
    expect((await request(app).post('/api/behavior-pattern').send({})).status).toBe(400);
    expect((await request(app).post('/api/behavior-pattern').send({ actual: { x: 'y'.repeat(13000) } })).status).toBe(400);
  });
});
