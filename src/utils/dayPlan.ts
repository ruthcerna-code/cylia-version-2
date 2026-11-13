import type { ActivityStep, ScheduledActivity } from '../types';

export const PLAN_BUFFER_MINUTES = 30;

export interface PlannedStep {
  activity: ScheduledActivity;
  step: ActivityStep | null;
}

export interface DayPlan {
  fixed: ScheduledActivity[];
  sequence: ScheduledActivity[];
  packed: ScheduledActivity[];
  waiting: ScheduledActivity[];
  now: PlannedStep | null;
  next: PlannedStep[];
  headline: string;
  reason: string;
  fixedMinutes: number;
  usableMinutes: number;
  plannedMinutes: number;
  leftoverMinutes: number;
  bufferMinutes: number;
}

function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function hasClock(activity: ScheduledActivity): boolean {
  return clockMinutes(activity.startTime) != null && clockMinutes(activity.endTime) != null;
}

export function taskMinutes(activity: ScheduledActivity): number {
  if (hasClock(activity)) {
    const span = (clockMinutes(activity.endTime) || 0) - (clockMinutes(activity.startTime) || 0);
    if (span > 0) return span;
  }
  if (activity.estimateMinutes && activity.estimateMinutes > 0) return activity.estimateMinutes;
  const fromSteps = activity.steps.reduce((sum, step) => sum + step.minutes, 0);
  return fromSteps > 0 ? fromSteps : 30;
}

function importanceRank(activity: ScheduledActivity): number {
  if (activity.importance === 'alta') return 0;
  if (activity.importance === 'media') return 1;
  return 2;
}

function deadlineRank(activity: ScheduledActivity, date: string): number {
  if (!activity.deadline) return 2;
  return activity.deadline <= date ? 0 : 1;
}

function autoSort(items: ScheduledActivity[], date: string): ScheduledActivity[] {
  const remaining = [...items];
  const placed: ScheduledActivity[] = [];
  while (remaining.length) {
    const ready = remaining.filter((item) => !item.dependsOn || !remaining.some((other) => other.id === item.dependsOn));
    const pool = ready.length ? ready : remaining;
    pool.sort((a, b) => deadlineRank(a, date) - deadlineRank(b, date)
      || importanceRank(a) - importanceRank(b)
      || a.title.localeCompare(b.title));
    const pick = pool[0];
    placed.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }
  return placed;
}

function orderFlexible(items: ScheduledActivity[], date: string): ScheduledActivity[] {
  const manual = items.filter((item) => item.sortOrder != null).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const rest = autoSort(items.filter((item) => item.sortOrder == null), date);
  return [...manual, ...rest];
}

function currentStep(activity: ScheduledActivity, lowEnergy: boolean): ActivityStep | null {
  if (!activity.steps.length) return null;
  if (!lowEnergy) return activity.steps[0];
  return [...activity.steps].sort((a, b) => a.minutes - b.minutes)[0];
}

function reasonFor(activity: ScheduledActivity, pool: ScheduledActivity[], date: string, lowEnergy: boolean, step: ActivityStep | null): string {
  const unblocks = pool.some((item) => item.dependsOn === activity.id);
  const due = Boolean(activity.deadline && activity.deadline <= date);
  if (lowEnergy && step) {
    return due
      ? 'Este paso es el más corto, porque marcaste la energía baja. La actividad vence hoy.'
      : 'Este paso es el más corto, porque marcaste la energía baja.';
  }
  if (due && unblocks) return 'Primero esta actividad porque vence hoy y permite avanzar con la siguiente.';
  if (due) return 'Primero esta actividad porque vence hoy.';
  if (unblocks) return 'Primero esta actividad porque permite avanzar con la siguiente.';
  return 'Primero esta actividad porque es la más importante que cabe en el tiempo.';
}

export function buildDayPlan(activities: ScheduledActivity[], date: string, availableMinutes: number, energy: number | null): DayPlan {
  const open = activities.filter((item) => item.planStatus !== 'hecha');
  const fixed = open
    .filter((item) => item.planStatus !== 'pospuesta' && item.date === date && hasClock(item))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const flexible = open.filter((item) => !hasClock(item) && item.planStatus !== 'pospuesta' && (item.date === date || (item.deadline != null && item.deadline <= date)));
  const postponed = open.filter((item) => item.planStatus === 'pospuesta' && (item.date === date || (item.deadline != null && item.deadline <= date)));
  const sequence = orderFlexible(flexible, date);
  const fixedMinutes = fixed.reduce((sum, item) => sum + taskMinutes(item), 0);
  const buffer = Math.min(PLAN_BUFFER_MINUTES, Math.max(0, availableMinutes - fixedMinutes));
  const usableMinutes = Math.max(0, availableMinutes - fixedMinutes - buffer);
  const packed: ScheduledActivity[] = [];
  const waiting: ScheduledActivity[] = [];
  let room = usableMinutes;
  let stopped = false;
  sequence.forEach((item) => {
    const minutes = taskMinutes(item);
    if (!stopped && packed.length < 3 && minutes <= room) {
      packed.push(item);
      room -= minutes;
      return;
    }
    stopped = true;
    waiting.push(item);
  });
  postponed.forEach((item) => {
    if (!waiting.some((other) => other.id === item.id)) waiting.push(item);
  });
  const lowEnergy = energy != null && energy <= 2;
  const nowActivity = packed[0] || null;
  const now = nowActivity ? { activity: nowActivity, step: currentStep(nowActivity, lowEnergy) } : null;
  const next: PlannedStep[] = [];
  if (nowActivity) {
    const shown = now?.step;
    nowActivity.steps.filter((step) => step !== shown).forEach((step) => next.push({ activity: nowActivity, step }));
    packed.slice(1).forEach((activity) => {
      const step = activity.steps[0] || null;
      next.push({ activity, step });
      activity.steps.slice(step ? 1 : 0).forEach((later) => next.push({ activity, step: later }));
    });
  }
  const plannedMinutes = packed.reduce((sum, item) => sum + taskMinutes(item), 0);
  let headline = 'Agrega una actividad para armar el plan.';
  if (fixed.length && !sequence.length) headline = 'Hoy están los compromisos con hora. No agregué tareas de más.';
  else if (sequence.length && !packed.length && fixedMinutes >= availableMinutes) headline = 'Los compromisos con hora ocupan el tiempo que marcaste. El resto puede esperar.';
  else if (sequence.length && !packed.length) headline = 'Estas actividades no caben en el tiempo que queda. Pueden esperar.';
  else if (packed.length) headline = room > 0
    ? `Quedan ${room} minutos libres. No los llené con otra actividad.`
    : 'El tiempo que queda quedó en la actividad principal y, como máximo, dos que siguen.';
  return {
    fixed,
    sequence,
    packed,
    waiting,
    now,
    next,
    headline,
    reason: nowActivity ? reasonFor(nowActivity, sequence, date, lowEnergy, now?.step || null) : '',
    fixedMinutes,
    usableMinutes,
    plannedMinutes,
    leftoverMinutes: room,
    bufferMinutes: buffer,
  };
}

export function moveInSequence(sequence: ScheduledActivity[], id: string, direction: -1 | 1, date: string): { next: ScheduledActivity[]; warning: string | null } {
  const index = sequence.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sequence.length) return { next: sequence, warning: null };
  const moved = [...sequence];
  const [item] = moved.splice(index, 1);
  moved.splice(target, 0, item);
  const next = moved.map((activity, order) => ({ ...activity, sortOrder: (order + 1) * 10 }));
  const task = next[target];
  const dependency = task.dependsOn ? next.find((other) => other.id === task.dependsOn) : undefined;
  if (dependency && next.findIndex((other) => other.id === dependency.id) > target) {
    return { next, warning: `Esta actividad espera a ${dependency.title}. Si la adelantas, ese paso sigue pendiente.` };
  }
  const child = next.find((other) => other.dependsOn === task.id);
  if (child && next.findIndex((other) => other.id === child.id) < target) {
    return { next, warning: `${child.title} espera a esta actividad. Si la bajas, esa queda antes.` };
  }
  if (direction > 0 && task.deadline && task.deadline <= date) {
    return { next, warning: 'Vence hoy. Si la bajas, puede quedar fuera del tiempo de hoy.' };
  }
  return { next, warning: null };
}

export function suggestSteps(title: string, minutes: number): ActivityStep[] {
  const total = Math.max(minutes, 15);
  const first = Math.min(15, Math.max(5, Math.round(total / 3)));
  const second = Math.max(5, Math.round((total - first) / 2));
  const third = Math.max(5, total - first - second);
  return [
    { action: `Abrir el material de «${title}» y anotar el resultado que quieres dejar hoy.`, minutes: first, doneWhen: 'Hay una frase con el resultado de hoy.' },
    { action: `Dejar escrita o marcada la primera parte visible de «${title}».`, minutes: second, doneWhen: 'Esa parte se puede leer o revisar.' },
    { action: `Guardar «${title}» y anotar qué queda pendiente.`, minutes: third, doneWhen: 'Está guardado y la nota dice qué falta.' },
  ];
}

export function overrunMessage(packed: ScheduledActivity[], usableMinutes: number, extraMinutes: number): { message: string; postponeId: string | null } {
  const used = packed.reduce((sum, item) => sum + taskMinutes(item), 0);
  const remaining = usableMinutes - extraMinutes;
  if (used <= remaining) {
    return { message: `Quedaron ${remaining - used} minutos. El plan sigue igual.`, postponeId: null };
  }
  const last = packed[packed.length - 1];
  if (!last || packed.length === 1) {
    return { message: 'Lo hecho queda hecho. El resto puede esperar si ya no te alcanza.', postponeId: null };
  }
  const left = Math.max(0, remaining - (used - taskMinutes(last)));
  return {
    message: `Quedaron ${left} minutos. «${last.title}» ya no cabe. Puedes dejarla para después.`,
    postponeId: last.id,
  };
}
