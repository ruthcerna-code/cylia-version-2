import { addCalendarDays, formatDateStr, getCycleDay, getPhaseForDay } from '../utils/cycle';
import type { MenstrualPhase, UserProfile } from '../types';

export type TaskKind = 'foco' | 'creativa' | 'social' | 'cierre' | 'rutina';
export type RiskColor = 'green' | 'yellow' | 'red';
export type SleepLevel = 'mal' | 'regular' | 'bien';
export type PostponeReason = 'aburre' | 'no_se' | 'miedo' | 'sin_energia' | 'imprevisto';

export interface FocusCheckin {
  date: string;
  energy: number;
  mood: number;
  sleep: SleepLevel;
  symptoms: string[];
  skipped: boolean;
}

export interface FocusTask {
  id: string;
  title: string;
  kind: TaskKind;
  scheduledDate: string;
  status: 'pending' | 'done' | 'discarded';
  risk: RiskColor;
  firstStep: string;
  postponeCount: number;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  example: boolean;
  activityId?: string;
}

export interface FocusFlags {
  hormonal: boolean;
  irregular: boolean;
  menopause: boolean;
}

export const PHASE_LABEL: Record<MenstrualPhase, string> = {
  Menstrual: 'Menstrual',
  Folicular: 'Folicular',
  Ovulacion: 'Ovulatoria',
  Lutea: 'Lútea',
};

export const PHASE_COLOR: Record<MenstrualPhase, string> = {
  Menstrual: '#E8899A',
  Folicular: '#6FA0E0',
  Ovulacion: '#E6C85A',
  Lutea: '#7DAF8A',
};

export const RISK_COLOR: Record<RiskColor, string> = {
  green: '#7DAF8A',
  yellow: '#E6C85A',
  red: '#E8899A',
};

const KIND_RANGE: Record<TaskKind, [number, number]> = {
  rutina: [1, 5],
  foco: [8, 12],
  creativa: [6, 13],
  social: [14, 16],
  cierre: [17, 23],
};

export function todayStr(): string {
  return formatDateStr(new Date());
}

export function ignorePhases(flags: FocusFlags): boolean {
  return flags.hormonal || flags.irregular || flags.menopause;
}

export function phaseOf(profile: UserProfile, date = todayStr()): { day: number; phase: MenstrualPhase } {
  const day = getCycleDay(date, profile.lastPeriodDate, profile.cycleLength);
  return { day, phase: getPhaseForDay(day, profile.periodLength, profile.cycleLength) };
}

export function showBodyChips(profile: UserProfile, date = todayStr()): boolean {
  const { day, phase } = phaseOf(profile, date);
  return phase === 'Menstrual' || day > profile.cycleLength - 5;
}

export function classifyTask(title: string): TaskKind {
  const text = title.toLowerCase();
  if (/reun|present|llamar|equipo|cliente|compart|charla/.test(text)) return 'social';
  if (/informe|cerrar|revis|entreg|detalle|correo|orden|factura/.test(text)) return 'cierre';
  if (/idea|diseñ|escribir|crear|borrador|propuesta|dibujo/.test(text)) return 'creativa';
  if (/comprar|lavar|rutina|ordenar|pagar|casa|lista/.test(text)) return 'rutina';
  return 'foco';
}

export function energyByDay(checkins: FocusCheckin[], profile: UserProfile): Map<number, number> {
  const buckets = new Map<number, number[]>();
  checkins.filter((item) => !item.skipped).forEach((item) => {
    const day = getCycleDay(item.date, profile.lastPeriodDate, profile.cycleLength);
    const list = buckets.get(day) || [];
    list.push(item.energy);
    buckets.set(day, list);
  });
  const averages = new Map<number, number>();
  buckets.forEach((values, day) => {
    averages.set(day, values.reduce((sum, value) => sum + value, 0) / values.length);
  });
  return averages;
}

export function cyclesWithData(checkins: FocusCheckin[], profile: UserProfile): number {
  const seen = new Set<number>();
  const anchor = new Date(`${profile.lastPeriodDate}T12:00:00`).getTime();
  checkins.filter((item) => !item.skipped).forEach((item) => {
    const current = new Date(`${item.date}T12:00:00`).getTime();
    const diff = Math.round((current - anchor) / 86400000);
    seen.add(Math.floor(diff / Math.max(profile.cycleLength, 1)));
  });
  return seen.size;
}

function postponeRate(tasks: FocusTask[], kind: TaskKind): number {
  const related = tasks.filter((task) => task.kind === kind && !task.example);
  if (!related.length) return 0;
  const postponed = related.filter((task) => task.postponeCount > 0).length;
  return postponed / related.length;
}

export function riskFor(task: Pick<FocusTask, 'kind' | 'postponeCount'>, energy: number | null, tasks: FocusTask[]): RiskColor {
  let score = 0;
  if (task.kind === 'cierre' || task.kind === 'foco') score += 1;
  if (postponeRate(tasks, task.kind) >= 0.4) score += 1;
  if (energy != null && energy <= 2) score += 1;
  if (task.postponeCount > 0) score += 1;
  if (score >= 2) return 'red';
  if (score === 1) return 'yellow';
  return 'green';
}

export function firstStepFor(title: string, kind: TaskKind, reason?: PostponeReason): string {
  if (reason === 'miedo') return 'Haz un borrador imperfecto de 5 minutos.';
  if (reason === 'aburre') return 'Pon música o prepárate algo que te guste, y haz solo el primer minuto.';
  if (kind === 'social') return `Escribe la primera frase de «${title}», sin enviarla.`;
  if (kind === 'cierre') return 'Revisa solo la primera parte y para.';
  if (kind === 'creativa') return 'Anota tres palabras sueltas sobre esto.';
  if (kind === 'rutina') return 'Deja listo lo que necesitas y para ahí.';
  return 'Abre el archivo y escribe solo el título.';
}

function personalReady(checkins: FocusCheckin[], profile: UserProfile): boolean {
  return cyclesWithData(checkins, profile) >= 3;
}

export function suggestDate(
  kind: TaskKind,
  profile: UserProfile,
  flags: FocusFlags,
  checkins: FocusCheckin[],
  from = todayStr(),
): { date: string; cycleDay: number; personal: boolean; note: string } {
  const energy = energyByDay(checkins, profile);
  const personal = !ignorePhases(flags) && personalReady(checkins, profile);
  if (ignorePhases(flags)) {
    const next = nextEnergyDate(from, profile, energy, true);
    const day = getCycleDay(next, profile.lastPeriodDate, profile.cycleLength);
    return { date: next, cycleDay: day, personal: false, note: 'Uso solo la energía que vas registrando, sin apoyarme en las fases.' };
  }
  if (personal) {
    let bestDay = 1;
    let bestScore = -1;
    for (let day = 1; day <= profile.cycleLength; day += 1) {
      const score = energy.get(day) ?? 3;
      const favored = day >= KIND_RANGE[kind][0] && day <= KIND_RANGE[kind][1] ? 0.4 : 0;
      if (score + favored > bestScore) {
        bestScore = score + favored;
        bestDay = day;
      }
    }
    const date = upcomingDateForCycleDay(from, profile, bestDay);
    return {
      date,
      cycleDay: bestDay,
      personal: true,
      note: 'Según tus registros, este tipo de tarea te resulta mejor en días como este.',
    };
  }
  const [start] = KIND_RANGE[kind];
  const date = upcomingDateForCycleDay(from, profile, start);
  const notes: Record<TaskKind, string> = {
    rutina: 'Muchas mujeres reportan que los días de menstruación sirven para cosas livianas. Es un punto de partida, no una regla tuya.',
    foco: 'Muchas mujeres reportan más facilidad para empezar proyectos en la fase folicular. Es un punto de partida.',
    creativa: 'Muchas mujeres reportan más facilidad para crear en la fase folicular. Es un punto de partida.',
    social: 'Muchas mujeres reportan más ganas de conversar cerca de la ovulación. Es un punto de partida.',
    cierre: 'Muchas mujeres reportan que la fase lútea ayuda a cerrar detalles. Es un punto de partida.',
  };
  return { date, cycleDay: getCycleDay(date, profile.lastPeriodDate, profile.cycleLength), personal: false, note: notes[kind] };
}

function upcomingDateForCycleDay(from: string, profile: UserProfile, targetDay: number): string {
  for (let offset = 0; offset < profile.cycleLength; offset += 1) {
    const date = addCalendarDays(from, offset);
    if (getCycleDay(date, profile.lastPeriodDate, profile.cycleLength) === targetDay) return date;
  }
  return from;
}

function nextEnergyDate(from: string, profile: UserProfile, energy: Map<number, number>, ignore: boolean): string {
  let best = addCalendarDays(from, 1);
  let bestScore = -1;
  for (let offset = 1; offset <= Math.max(profile.cycleLength, 7); offset += 1) {
    const date = addCalendarDays(from, offset);
    const day = getCycleDay(date, profile.lastPeriodDate, profile.cycleLength);
    const score = energy.get(day) ?? (ignore ? 3 : day >= 24 ? 2 : 3);
    if (score > bestScore) {
      bestScore = score;
      best = date;
    }
  }
  return best;
}

export function makeTask(title: string, profile: UserProfile, flags: FocusFlags, checkins: FocusCheckin[], tasks: FocusTask[]): FocusTask {
  const kind = classifyTask(title);
  const place = suggestDate(kind, profile, flags, checkins);
  const energy = energyByDay(checkins, profile).get(place.cycleDay) ?? null;
  const draft = { kind, postponeCount: 0 };
  const risk = riskFor(draft, energy, tasks);
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    kind,
    scheduledDate: place.date,
    status: 'pending',
    risk,
    firstStep: risk === 'green' ? '' : firstStepFor(title.trim(), kind),
    postponeCount: 0,
    estimateMinutes: null,
    actualMinutes: null,
    example: false,
  };
}

export function splitGoal(goal: string): string[] {
  const clean = goal.trim().replace(/\.$/, '');
  return [
    `Definir el primer resultado de «${clean}»`,
    `Reunir lo que ya tienes para «${clean}»`,
    `Hacer un borrador corto de «${clean}»`,
    `Revisar el borrador de «${clean}»`,
    `Dejar «${clean}» listo para compartir`,
  ];
}

export function applyPostpone(
  task: FocusTask,
  reason: PostponeReason,
  profile: UserProfile,
  flags: FocusFlags,
  checkins: FocusCheckin[],
): { task: FocusTask; extra: FocusTask[]; message: string } {
  const next = { ...task, postponeCount: task.postponeCount + 1 };
  const energy = energyByDay(checkins, profile);
  if (reason === 'no_se') {
    const parts = [`Abrir «${task.title}»`, `Anotar el siguiente paso de «${task.title}»`, `Hacer solo ese paso`];
    next.title = parts[0];
    next.firstStep = firstStepFor(next.title, next.kind, reason);
    const extra = parts.slice(1).map((title) => makeTask(title, profile, flags, checkins, []));
    extra.forEach((item) => { item.scheduledDate = task.scheduledDate; });
    return { task: refreshRisk(next, energy, [], profile), extra, message: 'Pasa. Retomamos con 5 minutos.' };
  }
  if (reason === 'sin_energia') {
    next.scheduledDate = nextEnergyDate(todayStr(), profile, energy, ignorePhases(flags));
    next.firstStep = firstStepFor(task.title, task.kind, reason);
    return { task: refreshRisk(next, energy, [], profile), extra: [], message: 'Pasa. Retomamos con 5 minutos.' };
  }
  if (reason === 'imprevisto') {
    next.scheduledDate = addCalendarDays(task.scheduledDate, 1);
    return { task: refreshRisk(next, energy, [], profile), extra: [], message: 'Pasa. Retomamos con 5 minutos.' };
  }
  next.firstStep = firstStepFor(task.title, task.kind, reason);
  return { task: refreshRisk(next, energy, [], profile), extra: [], message: 'Pasa. Retomamos con 5 minutos.' };
}

function refreshRisk(task: FocusTask, energy: Map<number, number>, tasks: FocusTask[], profile?: UserProfile): FocusTask {
  const day = profile ? getCycleDay(task.scheduledDate, profile.lastPeriodDate, profile.cycleLength) : 1;
  const dayEnergy = energy.get(day) ?? null;
  const risk = riskFor(task, dayEnergy, tasks);
  return { ...task, risk, firstStep: risk === 'green' ? task.firstStep : (task.firstStep || firstStepFor(task.title, task.kind)) };
}

export interface Discovery {
  title: string;
  detail: string;
  cycles: number;
}

export function discoveries(checkins: FocusCheckin[], tasks: FocusTask[], profile: UserProfile): Discovery[] {
  const cycles = cyclesWithData(checkins, profile);
  if (cycles < 2) return [];
  const energy = energyByDay(checkins, profile);
  let bestStart = 1;
  let best = -1;
  for (let start = 1; start <= profile.cycleLength - 4; start += 1) {
    let sum = 0;
    let count = 0;
    for (let day = start; day < start + 5; day += 1) {
      if (energy.has(day)) {
        sum += energy.get(day) || 0;
        count += 1;
      }
    }
    if (count >= 3 && sum / count > best) {
      best = sum / count;
      bestStart = start;
    }
  }
  const found: Discovery[] = [];
  if (best > 0) {
    found.push({
      title: `Tu mejor ventana de foco: días ${bestStart}–${bestStart + 4}`,
      detail: 'Según tus registros, esos días traen más energía. No es una regla fija.',
      cycles,
    });
  }
  const timed = tasks.filter((task) => task.estimateMinutes && task.actualMinutes);
  if (timed.length >= 3) {
    const ratio = timed.reduce((sum, task) => sum + (task.actualMinutes || 0) / (task.estimateMinutes || 1), 0) / timed.length;
    if (ratio >= 1.2) {
      found.push({
        title: `Tus tareas toman un ${Math.round((ratio - 1) * 100)} % más de lo que estimas`,
        detail: 'Según tus registros, conviene dejar un margen al agendar.',
        cycles,
      });
    }
  }
  return found;
}

export function exampleHistory(profile: UserProfile, from = todayStr()): { checkins: FocusCheckin[]; tasks: FocusTask[]; anchor: string } {
  const length = 28;
  const anchor = addCalendarDays(from, -(length * 3));
  const demoProfile = { ...profile, lastPeriodDate: anchor, cycleLength: length, periodLength: 5 };
  const checkins: FocusCheckin[] = [];
  const tasks: FocusTask[] = [];
  for (let index = 0; index < length * 3; index += 1) {
    const date = addCalendarDays(anchor, index);
    const day = getCycleDay(date, anchor, length);
    const energy = day <= 5 ? 2 : day <= 7 ? 3 : day <= 12 ? 5 : day <= 16 ? 4 : day <= 23 ? 3 : 2;
    checkins.push({ date, energy, mood: energy, sleep: energy <= 2 ? 'regular' : 'bien', symptoms: [], skipped: false });
    if (day === 10) {
      tasks.push({
        id: `ejemplo-${index}`,
        title: 'Avanzar un proyecto',
        kind: 'foco',
        scheduledDate: date,
        status: 'done',
        risk: 'green',
        firstStep: '',
        postponeCount: 0,
        estimateMinutes: 50,
        actualMinutes: 70,
        example: true,
      });
    }
    if (day === 26) {
      tasks.push({
        id: `ejemplo-p-${index}`,
        title: 'Cerrar pendientes',
        kind: 'cierre',
        scheduledDate: date,
        status: 'pending',
        risk: 'yellow',
        firstStep: 'Revisa solo la primera parte y para.',
        postponeCount: 1,
        estimateMinutes: 50,
        actualMinutes: 70,
        example: true,
      });
    }
  }
  return { checkins, tasks, anchor: demoProfile.lastPeriodDate };
}

export interface FocusNote {
  id: string;
  text: string;
  taskId?: string;
  kind: 'window' | 'lighten';
}

export function notesForToday(
  tasks: FocusTask[],
  checkins: FocusCheckin[],
  profile: UserProfile,
  flags: FocusFlags,
  sentToday: number,
  reduced: boolean,
  lastShown: string | null,
): FocusNote[] {
  if (sentToday >= 2) return [];
  if (reduced && lastShown && lastShown > addCalendarDays(todayStr(), -3)) return [];
  const notes: FocusNote[] = [];
  const pending = tasks.find((task) => task.status === 'pending' && task.scheduledDate > todayStr() && !task.example);
  if (pending && !ignorePhases(flags)) {
    const soon = addCalendarDays(todayStr(), 3);
    const day = getCycleDay(soon, profile.lastPeriodDate, profile.cycleLength);
    if (day >= 8 && day <= 12) {
      notes.push({ id: `ventana-${pending.id}`, kind: 'window', taskId: pending.id, text: `En 3 días empieza tu ventana de energía. ¿Agendamos ahí «${pending.title}»?` });
    }
  }
  const tomorrow = addCalendarDays(todayStr(), 1);
  const tomorrowDay = getCycleDay(tomorrow, profile.lastPeriodDate, profile.cycleLength);
  const energy = energyByDay(checkins, profile).get(tomorrowDay);
  const tomorrowTasks = tasks.filter((task) => task.status === 'pending' && task.scheduledDate === tomorrow && !task.example);
  if (((energy != null && energy <= 2) || tomorrowDay >= 24) && tomorrowTasks.length > 1) {
    notes.push({ id: `ligero-${tomorrow}`, kind: 'lighten', text: 'Mañana sueles tener menos energía. Aligeré tu día.' });
  }
  return notes.slice(0, 2 - sentToday);
}
