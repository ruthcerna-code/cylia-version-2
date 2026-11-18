import type { ScheduledActivity } from '../types';
import { clockMinutes, type EnergyBand } from './proposal';

/** The day ends here for the free-time count. The profile has no schedule yet. */
export const DAY_END = '21:00';
/** Free time Cyclia keeps unplanned so the day has room for the unexpected. */
export const FOCUS_BUFFER_MINUTES = 30;
/** At most this many activities go into the focus. */
export const FOCUS_MAX = 3;
/** With low energy, an activity this short counts as light when it has no effort set. */
export const LIGHT_MINUTES = 30;

export interface FocusItem {
  activity: ScheduledActivity;
  minutes: number;
  reason: string;
}

export interface DayFocus {
  date: string;
  /** Up to FOCUS_MAX activities, best first. */
  focus: FocusItem[];
  /** Pending activities that come after the focus and still fit. */
  later: FocusItem[];
  /** Activities that do not fit today, or whose time already passed. */
  waiting: FocusItem[];
  /** Minutes from now to DAY_END. */
  availableMinutes: number;
  /** Minutes the pending activities still need. */
  plannedMinutes: number;
  /** Free minutes left after the plan and the buffer. Never negative. */
  freeMinutes: number;
  /** Buffer actually kept: smaller when the day is almost over. */
  bufferMinutes: number;
}

/** Minutes the activity takes: its clock span, else its estimate, else its steps, else 30. */
export function activityMinutes(activity: ScheduledActivity): number {
  const start = clockMinutes(activity.startTime);
  const end = clockMinutes(activity.endTime);
  if (start != null && end != null && end > start) return end - start;
  if (activity.estimateMinutes && activity.estimateMinutes > 0) return activity.estimateMinutes;
  const fromSteps = activity.steps.reduce((sum, step) => sum + step.minutes, 0);
  return fromSteps > 0 ? fromSteps : 30;
}

function importanceRank(activity: ScheduledActivity): number {
  if (activity.importance === 'alta') return 0;
  if (activity.importance === 'baja') return 2;
  return 1;
}

function deadlineRank(activity: ScheduledActivity, date: string): number {
  if (!activity.deadline) return 2;
  return activity.deadline <= date ? 0 : 1;
}

function isLight(activity: ScheduledActivity, minutes: number): boolean {
  if (activity.effort) return activity.effort === 'bajo';
  return minutes <= LIGHT_MINUTES;
}

function lightRank(activity: ScheduledActivity, minutes: number, energy: EnergyBand | null): number {
  if (energy !== 'sin_energia') return 0;
  return isLight(activity, minutes) ? 0 : 1;
}

function focusReason(activity: ScheduledActivity, minutes: number, date: string, energy: EnergyBand | null): string {
  if (activity.deadline && activity.deadline < date) return 'Su fecha límite ya pasó.';
  if (activity.deadline === date) return 'Vence hoy.';
  if (activity.importance === 'alta') return 'La marcaste como muy importante.';
  if (energy === 'sin_energia' && isLight(activity, minutes)) return 'Es liviana y hoy marcaste poca energía.';
  if (activity.planStatus === 'en_curso') return 'Ya la empezaste.';
  return 'Es lo siguiente en tu día.';
}

/**
 * «Tu foco de hoy»: orders the pending activities of one day by deadline, importance and,
 * with low energy, lightness. It keeps a buffer until DAY_END and sends what does not fit to
 * «Puede esperar». It only reads: nothing is saved or moved.
 */
export function buildDayFocus(
  activities: ScheduledActivity[],
  date: string,
  energy: EnergyBand | null,
  nowMinutes: number,
): DayFocus {
  const dayEnd = clockMinutes(DAY_END) ?? 21 * 60;
  const open = activities.filter((item) => item.date === date && item.planStatus !== 'hecha');

  const waiting: FocusItem[] = [];
  const candidates: FocusItem[] = [];
  open.forEach((activity) => {
    const minutes = activityMinutes(activity);
    const start = clockMinutes(activity.startTime);
    const end = start != null ? start + minutes : null;
    if (activity.planStatus === 'pospuesta') {
      waiting.push({ activity, minutes, reason: 'La dejaste para después.' });
      return;
    }
    if (end != null && end <= nowMinutes && activity.planStatus !== 'en_curso') {
      waiting.push({ activity, minutes, reason: `Su hora ya pasó (${activity.startTime}). Puedes moverla a otro día.` });
      return;
    }
    // What is still ahead: an activity in progress only needs the rest of its time.
    const remaining = start != null && start < nowMinutes ? Math.max(0, minutes - (nowMinutes - start)) : minutes;
    candidates.push({ activity, minutes: remaining, reason: '' });
  });

  candidates.sort((a, b) => deadlineRank(a.activity, date) - deadlineRank(b.activity, date)
    || importanceRank(a.activity) - importanceRank(b.activity)
    || lightRank(a.activity, a.minutes, energy) - lightRank(b.activity, b.minutes, energy)
    || (clockMinutes(a.activity.startTime) ?? 24 * 60) - (clockMinutes(b.activity.startTime) ?? 24 * 60)
    || a.activity.title.localeCompare(b.activity.title));

  const availableMinutes = Math.max(0, dayEnd - nowMinutes);
  const bufferMinutes = Math.min(FOCUS_BUFFER_MINUTES, availableMinutes);
  let room = availableMinutes - bufferMinutes;

  const kept: FocusItem[] = [];
  candidates.forEach((item) => {
    const { activity } = item;
    if (energy === 'sin_energia' && activity.importance === 'baja' && deadlineRank(activity, date) !== 0) {
      waiting.push({ ...item, reason: 'Puede esperar: la marcaste como poco importante y hoy tienes poca energía.' });
      return;
    }
    const mustStay = deadlineRank(activity, date) === 0;
    if (item.minutes > room && !mustStay) {
      waiting.push({ ...item, reason: `No cabe hoy dejando ${FOCUS_BUFFER_MINUTES} minutos libres antes de las ${DAY_END}.` });
      return;
    }
    room -= item.minutes;
    kept.push({ ...item, reason: focusReason(activity, item.minutes, date, energy) });
  });

  const plannedMinutes = kept.reduce((sum, item) => sum + item.minutes, 0);
  return {
    date,
    focus: kept.slice(0, FOCUS_MAX),
    later: kept.slice(FOCUS_MAX),
    waiting,
    availableMinutes,
    plannedMinutes,
    freeMinutes: Math.max(0, availableMinutes - bufferMinutes - plannedMinutes),
    bufferMinutes,
  };
}

/** One line about the free time left today. */
export function freeTimeLine(focus: DayFocus): string {
  if (focus.availableMinutes === 0) return `Tu día ya pasó de las ${DAY_END}.`;
  if (focus.freeMinutes === 0) return `Tu día está lleno hasta las ${DAY_END}.`;
  const hours = Math.floor(focus.freeMinutes / 60);
  const minutes = focus.freeMinutes % 60;
  const amount = hours && minutes ? `${hours} h ${minutes} min` : hours ? `${hours} h` : `${minutes} min`;
  return `Te quedan ${amount} libres hasta las ${DAY_END}, con ${focus.bufferMinutes} min de margen.`;
}
