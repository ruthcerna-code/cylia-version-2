import { describe, expect, it } from 'vitest';
import { MOVEMENT_CATALOG, type MovementActivity } from '../src/catalog/movementCatalog';
import { CONDITION_MESSAGE, PREGNANCY_MESSAGE, pickMovement, seededRandom, type PickMovementInput } from '../src/utils/movementPicker';
import { addCalendarDays } from '../src/utils/cycle';
import { makeLog } from './helpers';

const today = '2026-11-17';
const byId = new Map(MOVEMENT_CATALOG.map((item) => [item.id, item]));

function pick(patch: Partial<PickMovementInput> = {}) {
  return pickMovement({
    catalog: MOVEMENT_CATALOG,
    today,
    phase: 'folicular',
    mode: 'natural',
    log: makeLog(today, { energy: 4 }),
    seed: `usuaria-1-${today}`,
    ...patch,
  });
}

const ids = (items: { activity: MovementActivity }[]) => items.map((item) => item.activity.id);

describe('Catálogo de salud física (src/catalog/movementCatalog.ts)', () => {
  it('tiene 120 actividades con ids únicos y energía entre 1 y 5', () => {
    expect(MOVEMENT_CATALOG).toHaveLength(120);
    expect(new Set(MOVEMENT_CATALOG.map((item) => item.id)).size).toBe(120);
    expect(MOVEMENT_CATALOG.every((item) => item.minEnergy >= 1 && item.minEnergy <= 5)).toBe(true);
  });

  it('normaliza fases, intensidad y tipo', () => {
    const first = byId.get(1)!;
    expect(first).toMatchObject({ name: 'Caminata suave al aire libre', intensity: 'suave', type: 'cardio', minutes: 20, caution: null });
    // "Todas" equivale a las cuatro fases.
    expect(first.phases).toEqual(['menstrual', 'folicular', 'ovulatoria', 'lutea']);
    // "Menstrual, lútea" queda sin tilde y en minúscula.
    expect(byId.get(2)!.phases).toEqual(['menstrual', 'lutea']);
    expect(MOVEMENT_CATALOG.every((item) => ['suave', 'moderada', 'alta'].includes(item.intensity))).toBe(true);
  });
});

describe('Selección de movimiento (pickMovement)', () => {
  it('devuelve 3 actividades de tipos distintos, cada una con su motivo', () => {
    const result = pick();
    expect(result.items).toHaveLength(3);
    expect(new Set(result.items.map((item) => item.activity.type)).size).toBe(3);
    result.items.forEach((item) => expect(item.reason).toMatch(/^Te propongo algo/));
  });

  it('energía 1 solo devuelve actividades con energía mínima 1', () => {
    const result = pick({ log: makeLog(today, { energy: 1 }) });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((item) => item.activity.minEnergy === 1)).toBe(true);
    expect(result.items[0].reason).toMatch(/marcaste energía baja/);
  });

  it('cólicos medios solo devuelve actividades suaves', () => {
    const result = pick({ log: makeLog(today, { energy: 5, pelvicCramps: 'medio' }) });
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.activity.intensity === 'suave')).toBe(true);
    expect(result.items[0].reason).toMatch(/cólicos medios/);
  });

  it('dolor de 3 o más también deja solo actividades suaves', () => {
    const result = pick({ log: makeLog(today, { energy: 5, pain: 3 }) });
    expect(result.items.every((item) => item.activity.intensity === 'suave')).toBe(true);
  });

  it('el dolor de cabeza excluye la intensidad alta', () => {
    for (let day = 0; day < 10; day += 1) {
      const result = pick({ log: makeLog(today, { energy: 5, headache: 'leve' }), seed: `u-${day}` });
      expect(result.items.some((item) => item.activity.intensity === 'alta')).toBe(false);
    }
  });

  it('convierte la energía en palabras cuando no hay número', () => {
    expect(pick({ log: makeLog(today, { energyFeel: 'baja' }) }).energy).toBe(2);
    expect(pick({ log: makeLog(today, { energyFeel: 'estable' }) }).energy).toBe(3);
    expect(pick({ log: makeLog(today, { energyFeel: 'inquieta' }) }).energy).toBe(3);
    expect(pick({ log: makeLog(today, { energyFeel: 'radiante' }) }).energy).toBe(4);
  });

  it('sin registro de hoy usa energía 3 y no sugiere intensidad alta', () => {
    for (let day = 0; day < 10; day += 1) {
      const result = pick({ log: null, seed: `u-${day}` });
      expect(result.energy).toBe(3);
      expect(result.items.every((item) => item.activity.minEnergy <= 3 && item.activity.intensity !== 'alta')).toBe(true);
    }
  });

  it('dormir menos de 6 horas baja la energía un punto', () => {
    expect(pick({ log: makeLog(today, { energy: 3 }), sleepHours: 5 }).energy).toBe(2);
    expect(pick({ log: makeLog(today, { energy: 3 }), sleepHours: 7 }).energy).toBe(3);
    // Sin sleepHours, se lee del texto del sueño.
    expect(pick({ log: makeLog(today, { energy: 3, sleepDetails: 'dormí 4 horas' }) }).energy).toBe(2);
    expect(pick({ log: makeLog(today, { energy: 1 }), sleepHours: 4 }).energy).toBe(1);
  });

  it('respeta el tiempo libre', () => {
    const result = pick({ freeMinutes: 10 });
    expect(result.items.every((item) => item.activity.minutes <= 10)).toBe(true);
  });

  it('filtra por lugar y equipo solo si hay preferencias', () => {
    const result = pick({ preferences: { places: ['Casa'], equipment: ['Mat'] } });
    result.items.forEach(({ activity }) => {
      expect(['Casa', 'Cualquier lugar']).toContain(activity.place);
      expect(['Mat', 'Ninguno']).toContain(activity.equipment);
    });
  });

  it('misma semilla y mismo día devuelven las mismas 3', () => {
    expect(ids(pick().items)).toEqual(ids(pick().items));
  });

  it('días distintos devuelven propuestas distintas', () => {
    const monday = ids(pick({ seed: 'usuaria-1-2026-11-16' }).items);
    const tuesday = ids(pick({ seed: 'usuaria-1-2026-11-17' }).items);
    expect(monday).not.toEqual(tuesday);
  });

  it('ninguna se repite dentro de 7 días', () => {
    const history: { date: string; ids: number[] }[] = [];
    for (let day = 0; day < 14; day += 1) {
      const date = addCalendarDays(today, day);
      const weekStart = addCalendarDays(date, -7);
      const recentIds = history.filter((item) => item.date >= weekStart).flatMap((item) => item.ids);
      const chosen = ids(pick({ today: date, seed: `usuaria-1-${date}`, recentIds, log: makeLog(date, { energy: 3 }) }).items);
      expect(chosen).toHaveLength(3);
      expect(chosen.filter((id) => recentIds.includes(id))).toEqual([]);
      history.push({ date, ids: chosen });
    }
  });

  it('no vuelve a sugerir lo que marcó «No me gusta»', () => {
    const first = ids(pick().items);
    const again = ids(pick({ dislikedIds: first }).items);
    expect(again.filter((id) => first.includes(id))).toEqual([]);
  });

  it('da prioridad al tipo que falta en la semana', () => {
    const noStrength = MOVEMENT_CATALOG.filter((item) => item.type === 'cardio' || item.type === 'movilidad').slice(0, 2).map((item) => item.id);
    const result = pick({ recentIds: noStrength });
    expect(result.items.some((item) => item.activity.type === 'fuerza')).toBe(true);
  });

  it('en perimenopausia asegura fuerza y equilibrio en la semana', () => {
    const result = pick({ mode: 'perimenopause', phase: null });
    const types = result.items.map((item) => item.activity.type);
    expect(types).toContain('fuerza');
    expect(types).toContain('equilibrio');
  });

  it('modo hormonal ignora la fase', () => {
    const lutea = pick({ mode: 'hormonal', phase: 'lutea' });
    const folicular = pick({ mode: 'hormonal', phase: 'folicular' });
    expect(ids(lutea.items)).toEqual(ids(folicular.items));
    lutea.items.forEach((item) => expect(item.reason).not.toMatch(/fase/));
  });

  it('en modo natural la fase solo se menciona con «muchas mujeres reportan»', () => {
    const reasons = Array.from({ length: 15 }, (_, day) => pick({ seed: `u-${day}`, phase: 'menstrual' }).items.map((item) => item.reason)).flat();
    const withPhase = reasons.filter((reason) => /fase/.test(reason));
    expect(withPhase.length).toBeGreaterThan(0);
    withPhase.forEach((reason) => expect(reason).toMatch(/Muchas mujeres reportan que les acomoda en la fase menstrual\./));
  });

  it('embarazo no devuelve actividades y muestra el aviso', () => {
    const pregnancy = pick({ mode: 'paused', situation: 'embarazo' });
    expect(pregnancy.items).toEqual([]);
    expect(pregnancy.blocked).toBe(PREGNANCY_MESSAGE);
    expect(pick({ mode: 'natural', situation: 'posparto_lactancia' }).items).toEqual([]);
    expect(CONDITION_MESSAGE).toMatch(/consúltalo con tu profesional/);
  });

  it('mantiene durante el día las propuestas ya mostradas que siguen permitidas', () => {
    const shown = ids(pick().items);
    const afterDislike = ids(pick({ keep: shown, dislikedIds: [shown[1]] }).items);
    expect(afterDislike).toContain(shown[0]);
    expect(afterDislike).toContain(shown[2]);
    expect(afterDislike).not.toContain(shown[1]);
  });

  it('nunca relaja energía ni síntomas aunque queden menos de 3', () => {
    const veryLow = pick({ log: makeLog(today, { energy: 1, pelvicCramps: 'medio' }), freeMinutes: 3 });
    veryLow.items.forEach((item) => {
      expect(item.activity.minEnergy).toBe(1);
      expect(item.activity.intensity).toBe('suave');
    });
  });
});

describe('Azar reproducible (seededRandom)', () => {
  it('la misma semilla da la misma secuencia y otra semilla, otra', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    const c = seededRandom('y');
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect([c(), c(), c()]).not.toEqual(first);
    first.forEach((value) => expect(value >= 0 && value < 1).toBe(true));
  });
});
