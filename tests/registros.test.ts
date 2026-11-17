import { describe, expect, it } from 'vitest';
import { compareRecords, dayRecordNote, indicatorNote, readSleep, sleepHours } from '../src/utils/recordCompare';
import { buildAnalysisContext } from '../src/utils/analysisContext';
import { energyBandFromLog } from '../src/plan/dayContext';
import { summarizeConsent, decisionsFromBody, sourceFromBody, ConsentError } from '../consentHttp';
import { CONSENT_STATEMENTS, CONSENT_VERSION, OPTIONAL_PURPOSES, REQUIRED_PURPOSES } from '../src/consentCopy';
import { makeLog, makeProfile } from './helpers';

describe('Lectura del registro diario (src/utils/recordCompare.ts)', () => {
  it('saca las horas de sueño del texto libre', () => {
    expect(sleepHours('dormí 7 horas')).toBe(7);
    expect(sleepHours('unas 6,5 hrs')).toBe(6.5);
    expect(sleepHours('dormí 5h')).toBe(5);
    expect(sleepHours('dormí bien')).toBeNull();
    expect(sleepHours('dormí 20 horas')).toBeNull();
  });

  it('clasifica el sueño: corto, suficiente o largo', () => {
    expect(readSleep(makeLog('2026-11-17', { sleepDetails: '5 horas' })).kind).toBe('corto');
    expect(readSleep(makeLog('2026-11-17', { sleepDetails: '8 horas' })).kind).toBe('suficiente');
    expect(readSleep(makeLog('2026-11-17', { sleepDetails: '10 horas' })).kind).toBe('largo');
    // Sin horas: usa la calidad (1 es excelente, 5 es muy mala).
    expect(readSleep(makeLog('2026-11-17', { sleepQuality: 1 })).kind).toBe('suficiente');
    expect(readSleep(makeLog('2026-11-17', { sleepQuality: 5 })).kind).toBe('corto');
    expect(readSleep(makeLog('2026-11-17', { sleepQuality: 3 })).kind).toBe('sin_dato');
  });

  it('explica la energía baja con el sueño del mismo día', () => {
    const short = dayRecordNote(makeLog('2026-11-17', { energy: 2, sleepDetails: 'dormí 5 horas' }));
    expect(short).toMatch(/unas 5 horas de sueño/);
    const enough = dayRecordNote(makeLog('2026-11-17', { energy: 1, sleepDetails: 'dormí 8 horas' }));
    expect(enough).toMatch(/descartar que la causa sea dormir poco/);
    expect(dayRecordNote(undefined)).toBeNull();
  });

  it('no presenta el fluido clara de huevo como fertilidad', () => {
    const note = indicatorNote(makeLog('2026-11-17', { cervicalFluid: 'clara_de_huevo' }));
    expect(note).toMatch(/no calcula fertilidad/);
    expect(indicatorNote(makeLog('2026-11-17', { energyFeel: 'inquieta' }))).toMatch(/no es energía baja ni alta/);
  });

  it('sin registros, lo dice en vez de inventar una comparación', () => {
    expect(compareRecords(makeProfile(), [], {})).toEqual([
      'Todavía no hay registros de energía, cansancio o sueño para compararlos con la proyección del ciclo.',
    ]);
  });
});

describe('Datos que se envían a la IA (src/utils/analysisContext.ts)', () => {
  const profile = makeProfile({ name: 'Nombre Privado', email: 'privado@ejemplo.cl', weight: 70, isCeliac: true });
  const logs = {
    '2026-11-10': makeLog('2026-11-10', { energy: 3 }),
    '2026-11-15': makeLog('2026-11-15', { energy: 2, sleepDetails: 'dormí 5 horas' }),
    '2026-11-16': makeLog('2026-11-16', { energy: 4 }),
    '2026-11-17': makeLog('2026-11-17', { energy: 2, additionalNotes: 'día pesado' }),
    '2026-11-18': makeLog('2026-11-18', { energy: 5 }),
  };

  it('no envía nombre, correo, peso ni fecha de nacimiento', () => {
    const context = buildAnalysisContext(profile, [], logs, '2026-11-17');
    const sent = JSON.stringify(context);
    expect(sent).not.toContain('Nombre Privado');
    expect(sent).not.toContain('privado@ejemplo.cl');
    expect(sent).not.toContain('birthDate');
    expect(sent).not.toContain('weight');
    expect(context.conditions.celiac).toBe(true);
  });

  it('envía el registro del día pedido, con las horas de sueño leídas', () => {
    const context = buildAnalysisContext(profile, [], logs, '2026-11-15');
    expect(context.log?.date).toBe('2026-11-15');
    expect(context.log?.sleepHours).toBe(5);
    expect(context.phase).toBe('Ovulación');
    expect(context.cycleDay).toBe(15);
  });

  it('los "días recientes" son anteriores al día analizado, como máximo 4', () => {
    const context = buildAnalysisContext(profile, [], logs, '2026-11-17');
    expect(context.recent.map((log) => log.date)).toEqual(['2026-11-10', '2026-11-15', '2026-11-16']);
  });

  it('con anticoncepción hormonal no envía fase ni día del ciclo', () => {
    const context = buildAnalysisContext(makeProfile({ hormonalMethod: 'implante' }), [], logs, '2026-11-17');
    expect(context.phase).toBeNull();
    expect(context.cycleDay).toBeNull();
    expect(context.hormonalMethod).toBe('implante');
  });
});

describe('Energía para el plan del día (src/plan/dayContext.ts)', () => {
  it('traduce el registro a con energía o sin energía', () => {
    expect(energyBandFromLog(null)).toBeNull();
    expect(energyBandFromLog(makeLog('2026-11-17', { energyBand: 'sin_energia', energy: 5 }))).toBe('sin_energia');
    expect(energyBandFromLog(makeLog('2026-11-17', { energy: 2 }))).toBe('sin_energia');
    expect(energyBandFromLog(makeLog('2026-11-17', { energy: 3 }))).toBe('con_energia');
    expect(energyBandFromLog(makeLog('2026-11-17', { energyFeel: 'radiante' }))).toBe('con_energia');
    expect(energyBandFromLog(makeLog('2026-11-17', {}))).toBeNull();
  });
});

describe('Consentimiento (consentHttp.ts y src/consentCopy.ts)', () => {
  const row = (purpose: string, action: string, created_at: string, id: string, policy_version = CONSENT_VERSION) => ({
    id, purpose, action, policy_version, statement_text: '', source: 'privacy_settings', created_at,
  }) as Parameters<typeof summarizeConsent>[0][number];

  it('las autorizaciones obligatorias son términos, privacidad y datos de salud; la IA es opcional', () => {
    expect([...REQUIRED_PURPOSES]).toEqual(['terms', 'privacy_notice', 'health_cycle']);
    expect([...OPTIONAL_PURPOSES]).toEqual(['gemini_assistant']);
  });

  it('el texto de la IA nombra al proveedor actual y no autoriza entrenar modelos', () => {
    expect(CONSENT_STATEMENTS.gemini_assistant).toMatch(/Anthropic \(Claude\)/);
    expect(CONSENT_STATEMENTS.gemini_assistant).not.toMatch(/Gemini/);
    expect(CONSENT_STATEMENTS.gemini_assistant).toMatch(/no autoriza entrenar/);
  });

  it('el registro está completo solo con las tres obligatorias aceptadas', () => {
    const accepted = REQUIRED_PURPOSES.map((p, i) => row(p, 'accept', `2026-11-17T10:0${i}:00Z`, `a${i}`));
    expect(summarizeConsent(accepted).requiredComplete).toBe(true);
    expect(summarizeConsent(accepted.slice(0, 2)).requiredComplete).toBe(false);
  });

  it('las decisiones de una versión anterior del texto no cuentan', () => {
    const old = REQUIRED_PURPOSES.map((p, i) => row(p, 'accept', `2026-11-01T10:0${i}:00Z`, `o${i}`, '2026-11-borrador-1'));
    expect(summarizeConsent(old).requiredComplete).toBe(false);
    expect(summarizeConsent(old).purposes).toEqual({});
  });

  it('manda la decisión más reciente, aunque Firestore entregue las filas en otro orden', () => {
    // Firestore lista los documentos por su id aleatorio, no por fecha.
    const rows = [
      row('gemini_assistant', 'withdraw', '2026-11-17T12:00:00Z', 'aaa'),
      row('gemini_assistant', 'accept', '2026-11-17T09:00:00Z', 'zzz'),
    ];
    expect(summarizeConsent(rows).purposes.gemini_assistant).toBe('withdraw');
    expect(summarizeConsent([...rows].reverse()).purposes.gemini_assistant).toBe('withdraw');
  });

  it('valida las decisiones y el origen que llegan al servidor', () => {
    expect(decisionsFromBody({ decisions: [{ purpose: 'gemini_assistant', action: 'accept' }] }))
      .toEqual([{ purpose: 'gemini_assistant', action: 'accept' }]);
    expect(() => decisionsFromBody({ decisions: [{ purpose: 'otra_cosa', action: 'accept' }] })).toThrow(ConsentError);
    expect(() => decisionsFromBody({ decisions: [] })).toThrow(ConsentError);
    expect(sourceFromBody({ source: 'new_user' })).toBe('new_user');
    expect(() => sourceFromBody({ source: 'hacker' })).toThrow(ConsentError);
  });
});
