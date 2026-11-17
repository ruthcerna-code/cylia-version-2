import { describe, expect, it } from 'vitest';
import {
  BEHAVIOR_MIN_RECORDS,
  behaviorMonthLabel,
  behaviorTimeline,
  computeBehaviorParams,
  localBehaviorReport,
} from '../src/utils/behavior';
import { alignBehaviorReport, behaviorRequestSchema } from '../src/plan/behaviorPrompt';
import { decodeDoc } from '../consentHttp';
import { dailyLogs, makeActivity, makeLog, makeProfile } from './helpers';

const today = '2026-12-20';

/** 45 días de registros: días pares con sueño corto y energía baja, impares con buen sueño. */
function twoMonths() {
  return dailyLogs(today, 45, (i) => (i % 2 === 0
    ? { energy: 2, sleepDetails: 'dormí 5 horas', stress: 4, symptoms: ['dolor_cabeza'] }
    : { energy: 4, sleepDetails: 'dormí 8 horas', stress: 2 }));
}

describe('Meses de registro (behaviorTimeline)', () => {
  it('sin registros no hay meses', () => {
    expect(behaviorTimeline({}, today)).toMatchObject({ firstDate: null, completed: [] });
  });

  it('antes de cumplir 30 días dice cuándo estará listo el primer patrón', () => {
    const logs = { '2026-12-01': makeLog('2026-12-01') };
    const timeline = behaviorTimeline(logs, today);
    expect(timeline.daysTracked).toBe(20);
    expect(timeline.completed).toEqual([]);
    expect(timeline.nextReportDate).toBe('2026-12-31');
    expect(timeline.daysToNext).toBe(11);
  });

  it('el primer mes se cierra al pasar 30 días desde el primer registro', () => {
    const logs = { '2026-11-20': makeLog('2026-11-20') };
    expect(behaviorTimeline(logs, '2026-12-19').completed).toEqual([]);
    expect(behaviorTimeline(logs, '2026-12-20').completed).toEqual([{ index: 1, from: '2026-11-20', to: '2026-12-19' }]);
  });

  it('cuenta los meses siguientes de a 30 días', () => {
    const logs = { '2026-10-01': makeLog('2026-10-01') };
    const completed = behaviorTimeline(logs, '2026-12-20').completed;
    expect(completed.map((block) => block.index)).toEqual([1, 2]);
    expect(completed[1]).toEqual({ index: 2, from: '2026-10-31', to: '2026-11-29' });
  });

  it('nombra los meses en español', () => {
    expect(behaviorMonthLabel(1)).toBe('tu primer mes');
    expect(behaviorMonthLabel(2)).toBe('tu segundo mes');
    expect(behaviorMonthLabel(15)).toBe('tu mes 15');
  });
});

describe('Parámetros de comportamiento (computeBehaviorParams)', () => {
  const logs = twoMonths();
  const timeline = behaviorTimeline(logs, today);
  const block = timeline.completed[0];
  const activities = [
    makeActivity({ id: 'a', title: 'Informe', date: block.from, effort: 'alto', planStatus: 'hecha' }),
    makeActivity({ id: 'b', title: 'Trámite', date: block.to, effort: 'bajo', planStatus: 'pospuesta' }),
    makeActivity({ id: 'c', title: 'Fuera del mes', date: today, effort: 'medio' }),
  ];
  const params = computeBehaviorParams(makeProfile(), [], logs, activities, block, today);

  it('solo usa los registros de ese mes', () => {
    expect(params.block).toBe(1);
    expect(params.recordDays).toBe(30);
    expect(params.coverage).toBe(100);
  });

  it('resume energía, estrés y sueño', () => {
    expect(params.averages.energy).toBe(3);
    expect(params.averages.stress).toBe(3);
    expect(params.lowEnergyDays).toBe(15);
    expect(params.sleep).toMatchObject({ shortDays: 15, averageHours: 6.5, energyAfterShortSleep: 2, energyAfterGoodSleep: 4 });
  });

  it('cuenta los síntomas más frecuentes con su nombre', () => {
    expect(params.symptoms).toEqual([{ name: 'dolor de cabeza', days: 15 }]);
  });

  it('resume las actividades del mes y cuántas completó', () => {
    expect(params.activities).toMatchObject({ planned: 2, done: 1, notDone: 1, completionRate: 50 });
    expect(params.activities.byEffort.alto).toEqual({ planned: 1, done: 1 });
    expect(params.activities.byEffort.bajo).toEqual({ planned: 1, done: 0 });
  });

  it('no incluye textos libres ni datos personales', () => {
    const sent = JSON.stringify(params);
    expect(sent).not.toMatch(/Prueba|dormí|Informe|Trámite/);
  });

  it('con anticoncepción hormonal no agrupa por fase', () => {
    const hormonal = computeBehaviorParams(makeProfile({ hormonalMethod: 'pastilla' }), [], logs, [], block, today);
    expect(hormonal.phases).toEqual([]);
    expect(hormonal.cycleMode).toBe('hormonal');
  });
});

describe('Patrón del mes sin IA (localBehaviorReport)', () => {
  const logs = twoMonths();
  const block = behaviorTimeline(logs, today).completed[0];

  it('describe el patrón de sueño y energía con su respaldo', () => {
    const report = localBehaviorReport(computeBehaviorParams(makeProfile(), [], logs, [], block, today));
    expect(report.fuente).toBe('local');
    expect(report.titulo).toBe('Tu patrón en tu primer mes');
    expect(report.patrones[0].texto).toMatch(/Tu energía sube cuando duermes bien/);
    expect(report.patrones[0].respaldo).toMatch(/15 días/);
  });

  it(`con menos de ${BEHAVIOR_MIN_RECORDS} registros no inventa un patrón`, () => {
    const few = { '2026-11-01': makeLog('2026-11-01', { energy: 3 }), '2026-11-02': makeLog('2026-11-02', { energy: 3 }) };
    const params = computeBehaviorParams(makeProfile(), [], few, [], { index: 1, from: '2026-11-01', to: '2026-11-30' }, today);
    const report = localBehaviorReport(params);
    expect(report.patrones).toEqual([]);
    expect(report.resumen).toMatch(/Registraste 2 de 30 días/);
  });

  it('desde el segundo mes compara con el anterior', () => {
    const current = computeBehaviorParams(makeProfile(), [], logs, [], block, today);
    const previous = { ...current, averages: { ...current.averages, energy: 2.4 } };
    expect(localBehaviorReport({ ...current, block: 2 }, previous).resumen).toMatch(/pasó de 2,4|pasó de 2.4/);
  });
});

describe('Respuesta de la IA (behaviorPrompt)', () => {
  it('acepta un informe válido y recorta textos largos', () => {
    const report = alignBehaviorReport({
      titulo: 'Tu patrón en tu primer mes',
      resumen: 'Registraste 28 días.',
      patrones: [{ texto: 'x'.repeat(500), respaldo: '15 días' }, { texto: '' }, 'malo'],
      sugerencia: 'Duerme más.',
    });
    expect(report?.fuente).toBe('ia');
    expect(report?.patrones).toHaveLength(1);
    expect(report?.patrones[0].texto.length).toBe(220);
  });

  it('rechaza un informe sin título o sin resumen', () => {
    expect(alignBehaviorReport({ resumen: 'algo' })).toBeNull();
    expect(alignBehaviorReport(null)).toBeNull();
  });

  it('no deja pasar parámetros demasiado largos', () => {
    expect(behaviorRequestSchema.safeParse({ actual: { block: 1 } }).success).toBe(true);
    expect(behaviorRequestSchema.safeParse({ actual: { texto: 'x'.repeat(13000) } }).success).toBe(false);
  });
});

describe('Exportación de datos (consentHttp.decodeDoc)', () => {
  it('incluye listas y objetos anidados, que antes se perdían', () => {
    const doc = decodeDoc({
      name: 'projects/p/databases/(default)/documents/users/u/daily_logs/2026-11-17',
      fields: {
        date: { stringValue: '2026-11-17' },
        energy: { integerValue: '3' },
        hours: { doubleValue: 6.5 },
        symptoms: { arrayValue: { values: [{ stringValue: 'colicos' }, { stringValue: 'antojos' }] } },
        params: { mapValue: { fields: { averages: { mapValue: { fields: { energy: { doubleValue: 3.2 } } } } } } },
        empty: { nullValue: null },
      },
    });
    expect(doc).toEqual({
      id: '2026-11-17',
      date: '2026-11-17',
      energy: 3,
      hours: 6.5,
      symptoms: ['colicos', 'antojos'],
      params: { averages: { energy: 3.2 } },
      empty: null,
    });
  });
});
