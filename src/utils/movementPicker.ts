import type { DailyLog } from '../types';
import type { CycleMode } from './cycleModel';
import { readSleep } from './recordCompare';
import {
  MOVEMENT_TYPE_LABELS,
  type MovementActivity,
  type MovementIntensity,
  type MovementPhase,
  type MovementType,
} from '../catalog/movementCatalog';

export const MOVEMENT_PER_DAY = 3;

export const PREGNANCY_MESSAGE = 'Antes de retomar o cambiar tu actividad física, conversa con tu matrona o médico.';
export const CONDITION_MESSAGE = 'Si tienes dudas por tu condición de salud, consúltalo con tu profesional.';

/** Places and equipment she has. Without preferences, nothing is filtered by them. */
export interface MovementPreferences {
  places?: string[];
  equipment?: string[];
}

export interface PickMovementInput {
  catalog: MovementActivity[];
  today: string;
  /** Today's estimated phase, or null. */
  phase: MovementPhase | null;
  mode: CycleMode;
  log?: DailyLog | null;
  /** Hours slept, from readSleep. When missing, it is read from the log. */
  sleepHours?: number | null;
  freeMinutes?: number | null;
  /** Ids suggested in the last 7 days, today not included. */
  recentIds?: number[];
  /** Every id she marked "No me gusta". */
  dislikedIds?: number[];
  preferences?: MovementPreferences | null;
  /** uid + date: the same 3 proposals all day, others the next day. */
  seed: string;
  /** Pregnancy and postpartum stop the catalog even if the mode is not 'paused'. */
  situation?: string | null;
  /** Ids already proposed today: they stay if they are still allowed. */
  keep?: number[];
}

export interface MovementPick {
  activity: MovementActivity;
  reason: string;
}

export interface MovementResult {
  items: MovementPick[];
  /** Message shown instead of the catalog, or null. */
  blocked: string | null;
  /** Energy used to filter, after the sleep adjustment. */
  energy: number;
}

const ENERGY_WORDS: Record<string, number> = { baja: 2, estable: 3, inquieta: 3, radiante: 4, alta: 4 };
const WEEKLY_BASICS: MovementType[] = ['fuerza', 'cardio', 'movilidad'];
const PHASE_NAME: Record<MovementPhase, string> = { menstrual: 'menstrual', folicular: 'folicular', ovulatoria: 'ovulatoria', lutea: 'lútea' };
const INTENSITY_WORD: Record<MovementIntensity, string> = { suave: 'algo suave', moderada: 'algo moderado', alta: 'algo más intenso' };

/** Seeded pseudo-random numbers (xmur3 + mulberry32). Never Math.random: the day must be reproducible. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = (() => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  })();
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function plain(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

type EnergyRead = { energy: number; source: 'numero' | 'palabra' | 'sin_dato'; shortSleep: boolean };

/** Rules a and c: today's energy, one point lower after less than 6 hours of sleep. */
function readEnergy(log: DailyLog | null | undefined, sleepHours: number | null | undefined): EnergyRead {
  let energy = 3;
  let source: EnergyRead['source'] = 'sin_dato';
  if (log && typeof log.energy === 'number' && log.energy >= 1 && log.energy <= 5) {
    energy = Math.round(log.energy);
    source = 'numero';
  } else if (log?.energyFeel && ENERGY_WORDS[log.energyFeel] != null) {
    energy = ENERGY_WORDS[log.energyFeel];
    source = 'palabra';
  }
  const hours = sleepHours !== undefined ? sleepHours : log ? readSleep(log).hours : null;
  const shortSleep = hours != null && hours < 6;
  if (shortSleep) energy = Math.max(1, energy - 1);
  return { energy, source, shortSleep };
}

type Body = { onlySoft: boolean; noHigh: boolean; cramps: 'leve' | 'medio' | null; pain: boolean; headache: boolean };

/** Rule b: medium cramps or pain allow only soft activities; a headache rules out high intensity. */
function readBody(log: DailyLog | null | undefined, energy: EnergyRead): Body {
  const cramps = log?.pelvicCramps === 'medio' ? 'medio' : log?.pelvicCramps === 'leve' || log?.symptoms?.includes('colicos') ? 'leve' : null;
  // Pain goes from 1 (none) to 5 (very high): 3 or more counts as medium.
  const pain = typeof log?.pain === 'number' && log.pain >= 3;
  const headache = log?.headache === 'leve' || log?.headache === 'medio' || Boolean(log?.symptoms?.includes('dolor_cabeza'));
  return {
    onlySoft: cramps === 'medio' || pain,
    // Without an energy record today, nothing of high intensity.
    noHigh: headache || energy.source === 'sin_dato',
    cramps,
    pain,
    headache,
  };
}

function safe(activity: MovementActivity, energy: EnergyRead, body: Body): boolean {
  if (activity.minEnergy > energy.energy) return false;
  if (body.onlySoft && activity.intensity !== 'suave') return false;
  if (body.noHigh && activity.intensity === 'alta') return false;
  return true;
}

function fitsPreferences(activity: MovementActivity, preferences?: MovementPreferences | null): boolean {
  if (!preferences) return true;
  const places = (preferences.places || []).map(plain);
  const equipment = (preferences.equipment || []).map(plain);
  if (places.length && plain(activity.place) !== 'cualquier lugar' && !places.includes(plain(activity.place))) return false;
  if (equipment.length && plain(activity.equipment) !== 'ninguno' && !equipment.includes(plain(activity.equipment))) return false;
  return true;
}

function typeCount(ids: number[], byId: Map<number, MovementActivity>): Map<MovementType, number> {
  const counts = new Map<MovementType, number>();
  ids.forEach((id) => {
    const activity = byId.get(id);
    if (activity) counts.set(activity.type, (counts.get(activity.type) || 0) + 1);
  });
  return counts;
}

/**
 * Types the week still needs, in two tiers:
 * first g) strength (2) and balance (1) in perimenopause and menopause, then e) strength, cardio and mobility.
 */
function neededTypes(week: Map<MovementType, number>, chosen: MovementActivity[], mode: CycleMode): MovementType[][] {
  const count = (type: MovementType) => (week.get(type) || 0) + chosen.filter((item) => item.type === type).length;
  const stage: MovementType[] = [];
  if (mode === 'perimenopause' || mode === 'menopause') {
    if (count('fuerza') < 2) stage.push('fuerza');
    if (count('equilibrio') < 1) stage.push('equilibrio');
  }
  const basics = WEEKLY_BASICS.filter((type) => count(type) < 1);
  return [stage, basics];
}

type Stage = { weekly: boolean; distinct: boolean; time: boolean };
// i) Relax, in this order: weekly variety, different types, free time. Never energy, symptoms or safety.
const STAGES: Stage[] = [
  { weekly: true, distinct: true, time: true },
  { weekly: false, distinct: true, time: true },
  { weekly: false, distinct: false, time: true },
  { weekly: false, distinct: false, time: false },
];

type Chosen = { activity: MovementActivity; priority: boolean };

function draw(input: PickMovementInput, allowed: MovementActivity[], stage: Stage, week: Map<MovementType, number>, usePhase: boolean): Chosen[] {
  const random = seededRandom(input.seed);
  const recent = new Set(input.recentIds || []);
  const pool = allowed
    .filter((item) => !stage.weekly || !recent.has(item.id))
    .filter((item) => !stage.time || input.freeMinutes == null || item.minutes <= input.freeMinutes)
    .sort((a, b) => a.id - b.id);
  const chosen: Chosen[] = [];
  // Proposals already shown today stay, so the day does not change after each tap.
  (input.keep || []).forEach((id) => {
    const kept = pool.find((item) => item.id === id);
    if (!kept || chosen.length >= MOVEMENT_PER_DAY) return;
    if (stage.distinct && chosen.some((item) => item.activity.type === kept.type)) return;
    chosen.push({ activity: kept, priority: false });
  });
  while (chosen.length < MOVEMENT_PER_DAY) {
    const types = new Set(chosen.map((item) => item.activity.type));
    const ids = new Set(chosen.map((item) => item.activity.id));
    const candidates = pool.filter((item) => !ids.has(item.id) && (!stage.distinct || !types.has(item.type)));
    if (!candidates.length) break;
    const tiers = stage.weekly ? neededTypes(week, chosen.map((item) => item.activity), input.mode) : [];
    // The first tier with an available activity wins; if none is available, any candidate can come up.
    const preferred = tiers.map((types) => candidates.filter((item) => types.includes(item.type))).find((list) => list.length) || [];
    const options = preferred.length ? preferred : candidates;
    // f) Activities suggested for today's phase weigh three times as much, but the others can also come up.
    const weight = (item: MovementActivity) => (usePhase && input.phase && item.phases.includes(input.phase) ? 3 : 1);
    const total = options.reduce((sum, item) => sum + weight(item), 0);
    let ticket = random() * total;
    let pick = options[options.length - 1];
    for (const item of options) {
      ticket -= weight(item);
      if (ticket < 0) { pick = item; break; }
    }
    chosen.push({ activity: pick, priority: preferred.length > 0 });
  }
  return chosen;
}

function joinSpanish(parts: string[]): string {
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

function reasonFor(choice: Chosen, energy: EnergyRead, body: Body, usePhase: boolean, phase: MovementPhase | null): string {
  const because: string[] = [];
  if (energy.source === 'sin_dato') because.push('todavía no registras tu energía de hoy');
  else if (energy.energy <= 2) because.push('marcaste energía baja');
  else if (energy.energy === 3) because.push('marcaste una energía media');
  else because.push('marcaste buena energía');
  if (energy.shortSleep) because.push('dormiste menos de 6 horas');
  if (body.cramps) because.push(`cólicos ${body.cramps === 'medio' ? 'medios' : 'leves'}`);
  if (body.pain) because.push('dolor');
  if (body.headache) because.push('dolor de cabeza');
  let reason = `Te propongo ${INTENSITY_WORD[choice.activity.intensity]} porque ${joinSpanish(because)}.`;
  if (choice.priority) reason += ` Esta semana todavía no tienes ${MOVEMENT_TYPE_LABELS[choice.activity.type].toLocaleLowerCase('es')}.`;
  if (usePhase && phase && choice.activity.phases.includes(phase) && choice.activity.phases.length < 4) {
    reason += ` Muchas mujeres reportan que les acomoda en la fase ${PHASE_NAME[phase]}.`;
  }
  return reason;
}

/** Picks today's 3 movement activities and says why each one. Without AI. */
export function pickMovement(input: PickMovementInput): MovementResult {
  const energy = readEnergy(input.log, input.sleepHours);
  // Safety first: pregnancy and postpartum do not get the catalog.
  if (input.mode === 'paused' || input.situation === 'embarazo' || input.situation === 'posparto_lactancia') {
    return { items: [], blocked: PREGNANCY_MESSAGE, energy: energy.energy };
  }
  const body = readBody(input.log, energy);
  const disliked = new Set(input.dislikedIds || []);
  const allowed = input.catalog.filter((item) => safe(item, energy, body) && fitsPreferences(item, input.preferences) && !disliked.has(item.id));
  const byId = new Map(input.catalog.map((item) => [item.id, item]));
  const week = typeCount(input.recentIds || [], byId);
  // The phase only counts when the calendar shows phases.
  const usePhase = input.mode === 'natural' && input.phase != null;

  let best: Chosen[] = [];
  for (const stage of STAGES) {
    const chosen = draw(input, allowed, stage, week, usePhase);
    if (chosen.length > best.length) best = chosen;
    if (chosen.length >= MOVEMENT_PER_DAY) break;
  }
  return {
    items: best.map((choice) => ({ activity: choice.activity, reason: reasonFor(choice, energy, body, usePhase, input.phase) })),
    blocked: null,
    energy: energy.energy,
  };
}
