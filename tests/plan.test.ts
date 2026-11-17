import { describe, expect, it } from 'vitest';
import { alignProposal, draftProposal, extractJson, isPastSlot, mondayOf, roundDuration, type PlanRequest } from '../src/plan/proposal';
import { aiKeyLooksUsable, alignAssist, assistConversation, assistUserText, draftAssist } from '../src/plan/assist';
import { overlappingActivity, resolveSchedule, suggestOpenSlot, validateAssistSchedule } from '../src/utils/activities';
import { findOwnPattern } from '../src/utils/ownPattern';
import { draftsFor, regroup, replanDifficultDay } from '../src/plan/difficultDay';
import { dailyLogs, makeActivity, makeProfile } from './helpers';

const planInput = (patch: Partial<PlanRequest> = {}): PlanRequest => ({
  nombre: 'Prueba',
  actividad: 'Escribir informe',
  notas: null,
  fecha_inicio: '2026-11-18',
  hora_inicio: '10:00',
  dia_ciclo: 18,
  duracion_ciclo: 28,
  fase: null,
  energia: 'con_energia',
  ...patch,
});

describe('Propuesta de duración (src/plan/proposal.ts)', () => {
  it('lee el JSON de la IA aunque venga entre bloques de código', () => {
    expect(extractJson('```json\n{"duracion_min": 30}\n```')).toEqual({ duracion_min: 30 });
    expect(() => extractJson('no hay json')).toThrow();
  });

  it('redondea la duración a 5 minutos, entre 10 y 240', () => {
    expect(roundDuration(47)).toBe(45);
    expect(roundDuration(3)).toBe(10);
    expect(roundDuration(500)).toBe(240);
  });

  it('ajusta la respuesta de la IA: hora de término, máximo 3 pasos', () => {
    const proposal = alignProposal({ duracion_min: 47, motivo: 'Con energía alcanza.', pasos: ['a', 'b', 'c', 'd'], aviso: '', dividir_en_bloques: 1 }, '10:00', null);
    expect(proposal).toMatchObject({ duracion_min: 45, hora_termino: '10:45', pasos: ['a', 'b', 'c'], aviso: null, dividir_en_bloques: true });
  });

  it('rechaza un motivo que habla del ciclo cuando no hay fase', () => {
    expect(alignProposal({ duracion_min: 30, motivo: 'En tu fase lútea conviene menos.' }, '10:00', null)).toBeNull();
    expect(alignProposal({ duracion_min: 30, motivo: 'Muchas mujeres reportan menos energía en la fase lútea.' }, '10:00', 'lutea')).not.toBeNull();
  });

  it('sin IA, acorta la actividad cuando no hay energía y la amplía cuando sí', () => {
    expect(draftProposal(planInput({ energia: 'sin_energia' })).duracion_min).toBe(50);
    expect(draftProposal(planInput({ energia: 'con_energia' })).duracion_min).toBe(90);
    expect(draftProposal(planInput({ actividad: 'Leer 30 min', energia: 'con_energia' })).duracion_min).toBe(30);
  });

  it('si rechazó la propuesta anterior, ofrece otra distinta', () => {
    const first = draftProposal(planInput({ energia: 'sin_energia' })).duracion_min;
    const second = draftProposal(planInput({ energia: 'sin_energia', propuesta_anterior_min: first })).duracion_min;
    expect(second).not.toBe(first);
  });

  it('sin IA, menciona la fase solo como algo que reportan muchas mujeres', () => {
    const proposal = draftProposal(planInput({ fase: 'lutea' }));
    expect(proposal.motivo).toMatch(/Muchas mujeres reportan/);
    expect(draftProposal(planInput()).motivo).not.toMatch(/fase|ciclo|lútea/i);
  });

  it('reconoce horarios pasados y el lunes de cada semana', () => {
    const now = new Date('2026-11-17T10:00:00');
    expect(isPastSlot('2026-11-17', '09:00', now)).toBe(true);
    expect(isPastSlot('2026-11-17', '11:00', now)).toBe(false);
    expect(isPastSlot('2026-11-16', '23:00', now)).toBe(true);
    expect(mondayOf('2026-11-17')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
  });
});

describe('Cyclia te asiste (src/plan/assist.ts)', () => {
  const valid = {
    necesita_datos: false, pregunta: null, nombre: 'Preparar presentación', descripcion: 'Ordenar el contenido.',
    pasos: ['Definir objetivo', 'Armar diapositivas'], esfuerzo: 'alto', esfuerzo_motivo: 'Es orientativa.', duracion_min: 118,
  };

  it('acepta una respuesta válida y redondea la duración', () => {
    expect(alignAssist(valid)).toMatchObject({ esfuerzo: 'alto', duracion_min: 120, pasos: ['Definir objetivo', 'Armar diapositivas'] });
  });

  it('exige de 2 a 5 pasos, un esfuerzo conocido y una duración de 10 a 480 min', () => {
    expect(alignAssist({ ...valid, pasos: ['Solo uno'] })).toBeNull();
    expect(alignAssist({ ...valid, pasos: ['1', '2', '3', '4', '5', '6', '7'] })?.pasos).toHaveLength(5);
    expect(alignAssist({ ...valid, esfuerzo: 'extremo' })).toBeNull();
    expect(alignAssist({ ...valid, duracion_min: 2000 })?.duracion_min).toBe(480);
    expect(alignAssist({ ...valid, duracion_min: 'mucho' })).toBeNull();
  });

  it('cuando falta información, pide un solo dato', () => {
    expect(alignAssist({ necesita_datos: true, pregunta: '¿Para cuándo es?' })).toMatchObject({ necesita_datos: true, pregunta: '¿Para cuándo es?' });
    expect(alignAssist({ necesita_datos: true, pregunta: '' })).toBeNull();
  });

  it('sin IA: pide más datos si el texto es muy vago', () => {
    expect(draftAssist('hola').necesita_datos).toBe(true);
  });

  it('sin IA: usa el esfuerzo y las horas que escribió', () => {
    const result = draftAssist('Quiero preparar la presentación del cliente, 2 horas, esfuerzo alto');
    expect(result.necesita_datos).toBe(false);
    expect(result.nombre).toMatch(/presentación del cliente/);
    expect(result.esfuerzo).toBe('alto');
    expect(result.duracion_min).toBe(120);
    expect(result.pasos).toHaveLength(3);
  });

  it('toma el día y la hora que mencionó, y descarta un día pasado o un formato inválido', () => {
    expect(alignAssist({ ...valid, fecha: '2026-11-20', hora: '10:00' }, '2026-11-17')).toMatchObject({ fecha: '2026-11-20', hora: '10:00' });
    expect(alignAssist({ ...valid, fecha: '2026-11-10', hora: '25:00' }, '2026-11-17')).toMatchObject({ fecha: null, hora: null });
    expect(alignAssist({ ...valid, fecha: 'el viernes', hora: null }, '2026-11-17')).toMatchObject({ fecha: null, hora: null });
    expect(alignAssist(valid)).toMatchObject({ fecha: null, hora: null });
  });

  it('arma la conversación empezando por ella y con la fecha de hoy', () => {
    const conversation = assistConversation({
      hoy: '2026-11-17',
      mensajes: [
        { role: 'assistant', texto: 'Hola, cuéntame.' },
        { role: 'user', texto: 'Preparar la presentación' },
        { role: 'assistant', texto: '¿Para quién es?' },
        { role: 'user', texto: 'Para el cliente, el viernes a las 10' },
      ],
    });
    expect(conversation.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user']);
    expect(conversation[0].content).toMatch(/^Hoy es martes 2026-11-17\./);
    expect(conversation.at(-1)?.content).toBe('Para el cliente, el viernes a las 10');
  });

  it('acepta el texto suelto de versiones anteriores y junta lo que ella escribió', () => {
    expect(assistConversation({ texto: 'Ordenar facturas' })).toEqual([{ role: 'user', content: 'Ordenar facturas' }]);
    expect(assistUserText({ mensajes: [
      { role: 'user', texto: 'Preparar presentación' },
      { role: 'assistant', texto: '¿Cuánto tiempo?' },
      { role: 'user', texto: '2 horas' },
    ] })).toBe('Preparar presentación. 2 horas');
  });

  it('reconoce cuándo la clave de la IA es un valor de ejemplo', () => {
    expect(aiKeyLooksUsable(undefined)).toBe(false);
    expect(aiKeyLooksUsable('YOUR_ANTHROPIC_API_KEY')).toBe(false);
    expect(aiKeyLooksUsable('MY_GEMINI_API_KEY')).toBe(false);
    expect(aiKeyLooksUsable(`sk-ant-api03-${'a'.repeat(40)}`)).toBe(true);
  });
});

describe('Horarios de actividades (src/utils/activities.ts)', () => {
  it('calcula la hora de término desde la duración, incluso pasada la medianoche', () => {
    expect(resolveSchedule({ title: 'Turno', date: '2026-11-17', startTime: '23:00', endTime: '', duration: '90' }))
      .toEqual({ end: '00:30', durationMinutes: 90, endsNextDay: true });
    expect(resolveSchedule({ title: 'X', date: '2026-11-17', startTime: '10:00', endTime: '09:00', duration: '' }).error)
      .toMatch(/posterior/);
    expect(resolveSchedule({ title: '', date: '2026-11-17', startTime: '10:00', endTime: '11:00', duration: '' }).error)
      .toMatch(/nombre/);
  });

  it('detecta choques de horario, sin contar la misma actividad', () => {
    const items = [makeActivity({ id: 'a', title: 'Reunión', date: '2026-11-17', startTime: '10:00', endTime: '11:00' })];
    expect(overlappingActivity(items, { date: '2026-11-17', startTime: '10:30', endTime: '11:30' })?.id).toBe('a');
    expect(overlappingActivity(items, { date: '2026-11-17', startTime: '11:00', endTime: '12:00' })).toBeNull();
    expect(overlappingActivity(items, { id: 'a', date: '2026-11-17', startTime: '10:30', endTime: '11:30' })).toBeNull();
  });

  it('no deja agendar en el pasado ni más de 18 horas', () => {
    const now = new Date('2026-11-17T10:00:00');
    expect(validateAssistSchedule({ title: 'X', date: '2026-11-16', startTime: '12:00', durationMinutes: 30, now })).toMatch(/no pasó/);
    expect(validateAssistSchedule({ title: 'X', date: '2026-11-17', startTime: '09:00', durationMinutes: 30, now })).toMatch(/hora que todavía no pasó/);
    expect(validateAssistSchedule({ title: 'X', date: '2026-11-17', startTime: '12:00', durationMinutes: 19 * 60, now })).toMatch(/18 horas/);
    expect(validateAssistSchedule({ title: 'X', date: '2026-11-17', startTime: '12:00', durationMinutes: 30, now })).toBeNull();
  });

  it('busca el primer hueco libre del día', () => {
    const now = new Date('2026-11-17T09:02:00');
    const items = [makeActivity({ id: 'a', title: 'Ocupado', date: '2026-11-17', startTime: '09:05', endTime: '10:00' })];
    expect(suggestOpenSlot(items, 30, { now, availabilityKnown: true })).toEqual({ date: '2026-11-17', startTime: '10:00', needsReview: false });
    expect(suggestOpenSlot(items, 30, { now, availabilityKnown: false })).toEqual({ date: '2026-11-17', startTime: '09:05', needsReview: true });
  });
});

describe('Tu patrón propio (src/utils/ownPattern.ts)', () => {
  const today = '2026-11-17';
  const profile = makeProfile();

  it('antes de 2 semanas dice cuánto falta', () => {
    const logs = dailyLogs(today, 5, () => ({ energy: 3 }));
    const pattern = findOwnPattern(profile, [], logs, today);
    expect(pattern.ready).toBe(false);
    expect(pattern.message).toMatch(/Faltan 8 días más y 5 registros más/);
  });

  it('encuentra la relación entre sueño y energía y dice cuántos registros la respaldan', () => {
    const logs = dailyLogs(today, 20, (i) => (i % 2 === 0 ? { energy: 2, sleepDetails: 'dormí 5 horas' } : { energy: 4, sleepDetails: 'dormí 8 horas' }));
    const pattern = findOwnPattern(profile, [], logs, today);
    expect(pattern.ready).toBe(true);
    const sleep = pattern.findings.find((f) => f.id === 'sueno');
    expect(sleep?.title).toBe('Cuando duermes bien, tu energía sube');
    expect(sleep?.records).toBe(20);
  });

  it('si no hay diferencia, dice que no hay patrón en vez de inventarlo', () => {
    const logs = dailyLogs(today, 20, (i) => ({ energy: 3, sleepDetails: i % 2 ? 'dormí 5 horas' : 'dormí 8 horas' }));
    const pattern = findOwnPattern(profile, [], logs, today);
    expect(pattern.ready).toBe(true);
    expect(pattern.findings).toEqual([]);
    expect(pattern.message).toMatch(/todavía no aparece un patrón claro/);
  });

  it('con anticoncepción hormonal no compara por fase', () => {
    const logs = dailyLogs(today, 20, () => ({ energy: 3 }));
    const pattern = findOwnPattern(makeProfile({ hormonalMethod: 'pastilla' }), [], logs, today);
    expect(pattern.findings.find((f) => f.id === 'ciclo')).toBeUndefined();
    expect(pattern.note).toMatch(/no usa fases/);
  });

  it('compara la energía entre fases cuando la diferencia es clara', () => {
    // Ciclo del 1 de noviembre: días 1–5 menstrual, 6–12 folicular, 16–28 lútea.
    const logs = dailyLogs(today, 40, (_i, date) => {
      const day = Number(date.slice(8)) + (date.startsWith('2026-10') ? 0 : 100);
      return { energy: day >= 106 && day <= 112 ? 5 : 2 };
    });
    const pattern = findOwnPattern(profile, [], logs, today);
    expect(pattern.findings.find((f) => f.id === 'ciclo')?.title).toMatch(/más alta en la fase Folicular/);
  });
});

describe('Hoy es un día difícil (src/plan/difficultDay.ts)', () => {
  const date = '2026-11-17';
  const activities = [
    makeActivity({ id: 'a', title: 'Informe', date, startTime: '09:00', endTime: '11:00', importance: 'media' }),
    makeActivity({ id: 'b', title: 'Entrega', date, startTime: '11:00', endTime: '12:00', deadline: date }),
    makeActivity({ id: 'c', title: 'Ordenar closet', date, startTime: '15:00', endTime: '17:00', importance: 'baja' }),
    makeActivity({ id: 'd', title: 'Subir fotos', date, startTime: '17:00', endTime: '17:45', dependsOn: 'c' }),
    makeActivity({ id: 'e', title: 'Caminar', date, startTime: '18:00', endTime: '18:30', kind: 'cuidado' }),
    makeActivity({ id: 'f', title: 'Ya hecha', date, startTime: '08:00', endTime: '08:30', planStatus: 'hecha' }),
    makeActivity({ id: 'g', title: 'Mañana', date: '2026-11-18', startTime: '15:00', endTime: '16:00' }),
  ];
  const plan = replanDifficultDay(activities, date);
  const group = (id: string) => plan.items.find((item) => item.activity.id === id);

  it('no toca lo que ya está hecho', () => {
    expect(group('f')).toBeUndefined();
  });

  it('mantiene lo que vence hoy y lo de cuidado', () => {
    expect(group('b')?.group).toBe('mantener');
    expect(group('e')?.group).toBe('mantener');
  });

  it('acorta al 60 % con su nueva hora de término', () => {
    expect(group('a')).toMatchObject({ group: 'acortar', newMinutes: 70, newEndTime: '10:10' });
  });

  it('mueve lo poco importante a un día sin choque, nunca después de su vencimiento', () => {
    const closet = group('c');
    expect(closet?.group).toBe('esperar');
    expect(closet?.proposedDate).toBe('2026-11-19');
  });

  it('lo que depende de una tarea movida se mueve con ella', () => {
    expect(group('d')?.group).toBe('esperar');
    expect(group('d')?.proposedDate).toBe(group('c')?.proposedDate);
  });

  it('respeta la fecha límite al proponer otro día', () => {
    const withDeadline = [makeActivity({ id: 'x', title: 'Trámite', date, startTime: '10:00', endTime: '11:00', importance: 'baja', deadline: '2026-11-18' })];
    expect(replanDifficultDay(withDeadline, date).items[0].proposedDate).toBe('2026-11-18');
  });

  it('solo genera cambios para lo que se acorta o se mueve', () => {
    const drafts = draftsFor(plan);
    expect(drafts.map((d) => d.id).sort()).toEqual(['a', 'c', 'd']);
    expect(drafts.find((d) => d.id === 'a')).toMatchObject({ endTime: '10:10', estimateMinutes: 70, durationSource: 'cyclia' });
    expect(drafts.find((d) => d.id === 'c')).toMatchObject({ date: '2026-11-19', planStatus: 'pendiente' });
  });

  it('ella puede cambiar cualquier tarea de grupo antes de aprobar', () => {
    const kept = regroup(plan, 'a', 'mantener', activities);
    expect(draftsFor(kept).map((d) => d.id)).not.toContain('a');
    const deferred = regroup(plan, 'b', 'esperar', activities);
    expect(deferred.items.find((i) => i.activity.id === 'b')?.proposedDate).toMatch(/^2026-11-/);
  });

  it('sin actividades pendientes no propone nada', () => {
    expect(replanDifficultDay([], date).items).toEqual([]);
  });
});
