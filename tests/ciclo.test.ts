import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCalendarDays,
  dayWithinCycle,
  getCycleDay,
  getDaysDifference,
  getPhaseForDay,
  nextPeriodStart,
  ovulationDay,
  projectNextCycles,
} from '../src/utils/cycle';
import { analyzeCycle } from '../src/utils/cycleModel';
import { makeLog, makePeriod, makeProfile } from './helpers';

describe('Cálculo del ciclo (src/utils/cycle.ts)', () => {
  it('cuenta los días entre fechas sin correrse por la hora', () => {
    expect(getDaysDifference('2026-11-17', '2026-11-01')).toBe(16);
    expect(getDaysDifference('2026-11-01', '2026-11-17')).toBe(-16);
  });

  it('el día de inicio de la regla es el día 1 y sigue contando si hay retraso', () => {
    expect(getCycleDay('2026-11-01', '2026-11-01', 28)).toBe(1);
    expect(getCycleDay('2026-11-17', '2026-11-01', 28)).toBe(17);
    expect(getCycleDay('2026-12-05', '2026-11-01', 28)).toBe(35);
  });

  it('una fecha anterior a la regla queda dentro del ciclo previo estimado', () => {
    expect(getCycleDay('2026-10-31', '2026-11-01', 28)).toBe(28);
    expect(getCycleDay('2026-10-05', '2026-11-01', 28)).toBe(2);
    // Exactamente un ciclo antes es el día 1 de ese ciclo, en fase menstrual.
    expect(getCycleDay('2026-10-04', '2026-11-01', 28)).toBe(1);
    expect(getPhaseForDay(getCycleDay('2026-10-04', '2026-11-01', 28), 5, 28)).toBe('Menstrual');
  });

  it('dayWithinCycle repite el patrón cada ciclo', () => {
    expect(dayWithinCycle(29, 28)).toBe(1);
    expect(dayWithinCycle(0, 28)).toBe(28);
    expect(dayWithinCycle(56, 28)).toBe(28);
  });

  it('la ovulación estimada es 14 días antes de la próxima regla', () => {
    expect(ovulationDay(28)).toBe(14);
    expect(ovulationDay(21)).toBe(7);
    expect(ovulationDay(35)).toBe(21);
    // Un largo fuera de rango (21–45) usa 28 días.
    expect(ovulationDay(60)).toBe(14);
  });

  it('asigna las fases de un ciclo de 28 días con regla de 5', () => {
    const phases = Array.from({ length: 28 }, (_, i) => getPhaseForDay(i + 1, 5, 28));
    expect(phases.slice(0, 5)).toEqual(Array(5).fill('Menstrual'));
    expect(phases.slice(5, 12)).toEqual(Array(7).fill('Folicular'));
    expect(phases.slice(12, 15)).toEqual(Array(3).fill('Ovulacion'));
    expect(phases.slice(15)).toEqual(Array(13).fill('Lutea'));
    expect(getPhaseForDay(29, 5, 28)).toBe('Menstrual');
  });

  it('suma días de calendario cruzando meses, años y el cambio de hora', () => {
    expect(addCalendarDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addCalendarDays('2026-09-05', 2)).toBe('2026-09-07');
  });

  it('proyecta la próxima regla y los tres ciclos siguientes', () => {
    expect(nextPeriodStart('2026-11-01', 28, '2026-11-17')).toBe('2026-11-29');
    const cycles = projectNextCycles('2026-11-01', 28, 5, 3, '2026-11-17');
    expect(cycles.map((c) => [c.periodStart, c.periodEnd])).toEqual([
      ['2026-11-29', '2026-12-03'],
      ['2026-12-27', '2026-12-31'],
      ['2027-01-24', '2027-01-28'],
    ]);
    expect(cycles.every((c) => c.estimated)).toBe(true);
  });
});

describe('Modos de etapa y alertas (src/utils/cycleModel.ts)', () => {
  const today = '2026-11-17';

  it('ciclo natural: muestra la fase, el día del ciclo y la próxima regla', () => {
    const view = analyzeCycle(makeProfile(), [], today);
    expect(view.mode).toBe('natural');
    expect(view.showPhases).toBe(true);
    expect(view.cycleDay).toBe(17);
    expect(view.phase).toBe('Lutea');
    expect(view.nextPeriod).toBe('2026-11-29');
    expect(view.alerts).toEqual([]);
  });

  it('con anticoncepción hormonal no calcula fases ni ovulación', () => {
    const view = analyzeCycle(makeProfile({ hormonalMethod: 'pastilla' }), [], today);
    expect(view.mode).toBe('hormonal');
    expect(view.showPhases).toBe(false);
    expect(view.phase).toBeNull();
    expect(view.ovulationDay).toBeNull();
  });

  it('embarazo o lactancia ponen las predicciones en pausa', () => {
    for (const situation of ['embarazo', 'posparto_lactancia'] as const) {
      const view = analyzeCycle(makeProfile({ specialSituation: situation }), [], today);
      expect(view.mode).toBe('paused');
      expect(view.predictionsPaused).toBe(true);
      expect(view.nextPeriod).toBeNull();
    }
  });

  it('perimenopausia activada: sin fases y con la nota de la etapa', () => {
    const view = analyzeCycle(makeProfile({ age: 46, perimenopauseMode: 'on' }), [], today);
    expect(view.mode).toBe('perimenopause');
    expect(view.showPhases).toBe(false);
    expect(view.note).toMatch(/variación del ciclo/);
  });

  it('desde los 40 años, 60 días sin regla se tratan como transición', () => {
    const view = analyzeCycle(makeProfile({ age: 44, lastPeriodDate: '2026-09-01' }), [], today);
    expect(view.mode).toBe('perimenopause');
    expect(view.predictionsPaused).toBe(true);
  });

  it('menopausia: deja de predecir y alerta si hay sangrado', () => {
    const profile = makeProfile({ age: 55, specialSituation: 'sin_regla', lastPeriodDate: '2025-06-01' });
    const quiet = analyzeCycle(profile, [], today);
    expect(quiet.mode).toBe('menopause');
    expect(quiet.nextPeriod).toBeNull();
    expect(quiet.alerts.map((a) => a.id)).not.toContain('sangrado-menopausia');

    const withSpotting = analyzeCycle(profile, [], today, { [today]: makeLog(today, { spotting: true }) });
    expect(withSpotting.alerts.map((a) => a.id)).toContain('sangrado-menopausia');
    expect(withSpotting.alerts.find((a) => a.id === 'sangrado-menopausia')?.priority).toBe('alta');
  });

  it('alerta por sangrado muy abundante o de más de 8 días', () => {
    const heavy = analyzeCycle(makeProfile(), [makePeriod('2026-11-01', { volume: 'muy_abundante' })], today);
    expect(heavy.alerts.map((a) => a.id)).toContain('sangrado-abundante');
    const long = analyzeCycle(makeProfile(), [makePeriod('2026-11-01', { endDate: '2026-11-10' })], today);
    expect(long.alerts.map((a) => a.id)).toContain('sangrado-abundante');
  });

  it('alerta por tres ciclos seguidos de menos de 24 días', () => {
    const periods = ['2026-09-15', '2026-10-07', '2026-10-29', '2026-11-15'].map((d) => makePeriod(d));
    const view = analyzeCycle(makeProfile({ lastPeriodDate: '2026-11-15' }), periods, today);
    expect(view.alerts.map((a) => a.id)).toContain('ciclos-cortos');
  });

  it('alerta por 90 días sin regla antes de los 45 años', () => {
    const view = analyzeCycle(makeProfile({ lastPeriodDate: '2026-08-14' }), [], today);
    expect(view.alerts.map((a) => a.id)).toContain('sin-regla-90');
  });

  it('alerta por dolor fuerte en las tres últimas reglas', () => {
    const periods = ['2026-09-06', '2026-10-04', '2026-11-01'].map((d) => makePeriod(d, { pain: 3 }));
    const view = analyzeCycle(makeProfile(), periods, today);
    expect(view.alerts.map((a) => a.id)).toContain('dolor-repetido');
  });

  it('alerta de retraso solo con ciclos regulares', () => {
    const periods = ['2026-09-06', '2026-10-04', '2026-11-01'].map((d) => makePeriod(d));
    const view = analyzeCycle(makeProfile(), periods, '2026-12-08');
    expect(view.regular).toBe(true);
    expect(view.delayDays).toBe(9);
    expect(view.alerts.map((a) => a.id)).toContain('retraso');
  });

  it('alerta por sangrado entre reglas en dos ciclos distintos', () => {
    const periods = ['2026-10-04', '2026-11-01'].map((d) => makePeriod(d));
    const logs = {
      '2026-10-15': makeLog('2026-10-15', { spotting: true }),
      '2026-11-12': makeLog('2026-11-12', { spotting: true }),
    };
    const view = analyzeCycle(makeProfile(), periods, today, logs);
    expect(view.alerts.map((a) => a.id)).toContain('sangrado-entre-reglas');
  });

  it('con tres ciclos o más usa el promedio registrado en vez del largo declarado', () => {
    const periods = ['2026-07-04', '2026-08-03', '2026-09-02', '2026-10-02'].map((d) => makePeriod(d));
    const view = analyzeCycle(makeProfile({ lastPeriodDate: '2026-10-02' }), periods, '2026-10-20');
    expect(view.averageLength).toBe(30);
  });
});

describe('Validación del perfil (src/utils/profileFields.ts)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T12:00:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('valida nombre, fecha de nacimiento y edad mínima de 18 años', async () => {
    const f = await import('../src/utils/profileFields');
    expect(f.validateName('Ana María')).toBeNull();
    expect(f.validateName('A')).toMatch(/al menos 2/);
    expect(f.validateName('Ana2')).toMatch(/solo acepta letras/);
    expect(f.validateBirthDate('2030-01-01')).toMatch(/no puede ser futura/);
    expect(f.validateBirthDate('2010-01-01')).toBe('Cyclia es para mayores de 18 años.');
    expect(f.validateBirthDate('2008-11-17')).toBeNull();
    expect(f.validateBirthDate('2008-11-18')).toBe('Cyclia es para mayores de 18 años.');
    expect(f.validateBirthDate('2026-02-30')).toMatch(/no es válida/);
  });

  it('calcula la edad sin cumplir años antes de tiempo', async () => {
    const { ageFromBirthDate } = await import('../src/utils/profileFields');
    expect(ageFromBirthDate('1990-11-18', new Date(2026, 10, 17))).toBe(35);
    expect(ageFromBirthDate('1990-11-17', new Date(2026, 10, 17))).toBe(36);
  });

  it('usa 28 y 5 días cuando el dato no se sabe o está fuera de rango', async () => {
    const f = await import('../src/utils/profileFields');
    expect(f.habitualCycleDays(30)).toBe(30);
    expect(f.habitualCycleDays(30, false)).toBe(28);
    expect(f.habitualCycleDays(50)).toBe(28);
    expect(f.habitualPeriodDays(12)).toBe(5);
  });

  it('reconoce el método anticonceptivo escrito libremente', async () => {
    const { inferHormonalMethod } = await import('../src/utils/profileFields');
    expect(inferHormonalMethod('Píldora')).toBe('pastilla');
    expect(inferHormonalMethod('DIU hormonal Mirena')).toBe('diu_hormonal');
    expect(inferHormonalMethod('DIU de cobre')).toBe('ninguna');
    expect(inferHormonalMethod('Implante')).toBe('implante');
  });

  it('acepta un perfil completo y rechaza una edad que no calza con la fecha', async () => {
    const { validateProfile } = await import('../src/utils/profileFields');
    const profile = makeProfile({ birthDate: '1996-05-10', age: 30, lastPeriodDate: '2026-11-01' });
    expect(validateProfile(profile)).toBeNull();
    expect(validateProfile({ ...profile, age: 25 })).toMatch(/edad debe ser/);
    expect(validateProfile({ ...profile, lastPeriodDate: '2026-12-01' })).toMatch(/no puede ser una fecha futura/);
    expect(validateProfile({ ...profile, cycleLength: 50 })).toMatch(/entre 21 y 45/);
  });
});
