import type { ActivityDraft } from '../firebase';
import type { ActivityStep, ScheduledActivity } from '../types';
import { clockMinutes, endClock, shiftDate } from './proposal';

/** Share of the time a shortened activity keeps. */
export const SHORTEN_SHARE = 0.6;
/** Shortest block after shortening. */
export const SHORTEN_MIN_MINUTES = 15;
/** Activities this short stay as they are. */
export const KEEP_UP_TO_MINUTES = 20;
/** How far ahead Cyclia looks for a new date when there is no deadline. */
export const DEFER_LOOKAHEAD_DAYS = 7;

export type ReplanGroup = 'mantener' | 'acortar' | 'esperar';

export interface ReplanItem {
  activity: ScheduledActivity;
  group: ReplanGroup;
  reason: string;
  /** Only for acortar. */
  newMinutes: number | null;
  newEndTime: string | null;
  newSteps: ActivityStep[] | null;
  /** Only for esperar. */
  proposedDate: string | null;
}

export interface DifficultDayPlan {
  date: string;
  items: ReplanItem[];
  savedMinutes: number;
}

export function toDraft(activity: ScheduledActivity, patch: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    id: activity.id,
    title: activity.title,
    date: activity.date,
    startTime: activity.startTime,
    endTime: activity.endTime,
    reminderMinutes: activity.reminderMinutes,
    notes: activity.notes,
    timeZone: activity.timeZone,
    deadline: activity.deadline,
    estimateMinutes: activity.estimateMinutes,
    importance: activity.importance,
    kind: activity.kind,
    effort: activity.effort,
    dependsOn: activity.dependsOn,
    planStatus: activity.planStatus,
    sortOrder: activity.sortOrder,
    steps: activity.steps,
    completedAt: activity.completedAt,
    durationSource: activity.durationSource,
    ...patch,
  };
}

export function activityMinutes(activity: ScheduledActivity): number {
  const start = clockMinutes(activity.startTime);
  const end = clockMinutes(activity.endTime);
  if (start != null && end != null && end > start) return end - start;
  if (activity.estimateMinutes && activity.estimateMinutes > 0) return activity.estimateMinutes;
  const fromSteps = activity.steps.reduce((sum, step) => sum + step.minutes, 0);
  return fromSteps > 0 ? fromSteps : 30;
}

function roundTo5(value: number): number {
  return Math.round(value / 5) * 5;
}

function overlaps(a: ScheduledActivity, b: ScheduledActivity): boolean {
  const aStart = clockMinutes(a.startTime);
  const bStart = clockMinutes(b.startTime);
  if (aStart == null || bStart == null) return false;
  const aEnd = aStart + activityMinutes(a);
  const bEnd = bStart + activityMinutes(b);
  return aStart < bEnd && bStart < aEnd;
}

function keepReason(activity: ScheduledActivity, date: string, minutes: number): string | null {
  if (activity.deadline && activity.deadline <= date) return 'Se mantiene porque vence hoy.';
  if (activity.importance === 'alta') return 'Se mantiene porque la marcaste como muy importante.';
  if (activity.kind === 'cuidado' || activity.kind === 'descanso') return 'Se mantiene porque es para cuidarte.';
  if (minutes <= KEEP_UP_TO_MINUTES) return `Se mantiene porque dura ${minutes} min.`;
  return null;
}

function shouldWait(activity: ScheduledActivity): string | null {
  if (activity.importance === 'baja') return 'Puede esperar porque la marcaste como poco importante.';
  if (activity.effort === 'alto') return 'Puede esperar porque pide mucho esfuerzo y hoy es un día difícil.';
  if (activity.planStatus === 'pospuesta') return 'Puede esperar porque hoy ya quedó sin hacer.';
  return null;
}

function trimSteps(steps: ActivityStep[], minutes: number): ActivityStep[] {
  if (!steps.length) return steps;
  const kept: ActivityStep[] = [];
  let used = 0;
  for (const step of steps) {
    if (kept.length && used + step.minutes > minutes) break;
    kept.push(step);
    used += step.minutes;
  }
  return kept;
}

function loadOn(day: string, activities: ScheduledActivity[], moved: ReplanItem[]): number {
  const existing = activities
    .filter((item) => item.date === day && item.planStatus !== 'hecha')
    .reduce((sum, item) => sum + activityMinutes(item), 0);
  const incoming = moved
    .filter((item) => item.proposedDate === day)
    .reduce((sum, item) => sum + activityMinutes(item.activity), 0);
  return existing + incoming;
}

function proposeDate(
  activity: ScheduledActivity,
  date: string,
  activities: ScheduledActivity[],
  moved: ReplanItem[],
  notBefore: string | null,
): string {
  const first = notBefore && notBefore > date ? notBefore : shiftDate(date, 1);
  const lastByLookahead = shiftDate(date, DEFER_LOOKAHEAD_DAYS);
  const last = activity.deadline && activity.deadline > date && activity.deadline < lastByLookahead
    ? activity.deadline
    : lastByLookahead;
  const clashOn = (day: string) => activities
    .filter((item) => item.date === day && item.planStatus !== 'hecha' && item.id !== activity.id)
    .some((item) => overlaps(item, activity))
    || moved.some((item) => item.proposedDate === day && overlaps(item.activity, activity));
  // An activity that depends on another stays with it when it fits that day.
  if (notBefore && notBefore > date && !clashOn(notBefore)) return notBefore;
  let best: { day: string; load: number; clash: boolean } | null = null;
  for (let day = first; day <= last; day = shiftDate(day, 1)) {
    const clash = clashOn(day);
    const load = loadOn(day, activities, moved);
    if (!best
      || (best.clash && !clash)
      || (best.clash === clash && load < best.load)) {
      best = { day, load, clash };
    }
  }
  return best ? best.day : first;
}

/**
 * Splits the open activities of one day into three groups: keep, shorten and wait.
 * Pure function: it only proposes. Nothing is saved until she approves.
 */
export function replanDifficultDay(activities: ScheduledActivity[], date: string): DifficultDayPlan {
  const open = activities
    .filter((item) => item.date === date && item.planStatus !== 'hecha')
    .sort((a, b) => (clockMinutes(a.startTime) ?? 0) - (clockMinutes(b.startTime) ?? 0));

  const groups = new Map<string, { group: ReplanGroup; reason: string }>();
  open.forEach((activity) => {
    const minutes = activityMinutes(activity);
    const keep = keepReason(activity, date, minutes);
    if (keep) {
      groups.set(activity.id, { group: 'mantener', reason: keep });
      return;
    }
    const wait = shouldWait(activity);
    if (wait) {
      groups.set(activity.id, { group: 'esperar', reason: wait });
      return;
    }
    groups.set(activity.id, { group: 'acortar', reason: 'Se acorta para que quede una parte hecha sin agotarte.' });
  });

  // An activity that waits for one that moved to another day moves too.
  let changed = true;
  while (changed) {
    changed = false;
    open.forEach((activity) => {
      const current = groups.get(activity.id);
      if (!current || current.group === 'esperar' || !activity.dependsOn) return;
      const parent = groups.get(activity.dependsOn);
      if (parent?.group === 'esperar') {
        groups.set(activity.id, { group: 'esperar', reason: 'Puede esperar porque depende de una actividad que también se mueve.' });
        changed = true;
      }
    });
  }

  const items: ReplanItem[] = [];
  const moved: ReplanItem[] = [];
  let savedMinutes = 0;
  open.forEach((activity) => {
    const decision = groups.get(activity.id);
    if (!decision) return;
    const minutes = activityMinutes(activity);
    if (decision.group === 'acortar') {
      const newMinutes = Math.max(SHORTEN_MIN_MINUTES, roundTo5(minutes * SHORTEN_SHARE));
      if (newMinutes >= minutes) {
        items.push({ activity, group: 'mantener', reason: 'Se mantiene porque ya es corta.', newMinutes: null, newEndTime: null, newSteps: null, proposedDate: null });
        return;
      }
      savedMinutes += minutes - newMinutes;
      items.push({
        activity,
        group: 'acortar',
        reason: `${decision.reason} Pasa de ${minutes} a ${newMinutes} min.`,
        newMinutes,
        newEndTime: clockMinutes(activity.startTime) != null ? endClock(activity.startTime, newMinutes) : null,
        newSteps: trimSteps(activity.steps, newMinutes),
        proposedDate: null,
      });
      return;
    }
    if (decision.group === 'esperar') {
      const parent = activity.dependsOn ? moved.find((item) => item.activity.id === activity.dependsOn) : undefined;
      const proposedDate = proposeDate(activity, date, activities, moved, parent?.proposedDate ?? null);
      savedMinutes += minutes;
      const item: ReplanItem = { activity, group: 'esperar', reason: decision.reason, newMinutes: null, newEndTime: null, newSteps: null, proposedDate };
      moved.push(item);
      items.push(item);
      return;
    }
    items.push({ activity, group: 'mantener', reason: decision.reason, newMinutes: null, newEndTime: null, newSteps: null, proposedDate: null });
  });

  return { date, items, savedMinutes };
}

/** Moves one item to another group, for when she does not agree with the proposal. */
export function regroup(plan: DifficultDayPlan, id: string, group: ReplanGroup, activities: ScheduledActivity[]): DifficultDayPlan {
  const items = plan.items.map((item) => {
    if (item.activity.id !== id) return item;
    const activity = item.activity;
    const minutes = activityMinutes(activity);
    if (group === 'mantener') {
      return { activity, group, reason: 'La dejaste como estaba.', newMinutes: null, newEndTime: null, newSteps: null, proposedDate: null };
    }
    if (group === 'acortar') {
      const newMinutes = Math.max(SHORTEN_MIN_MINUTES, Math.min(minutes - 5, roundTo5(minutes * SHORTEN_SHARE)));
      return {
        activity,
        group,
        reason: `La elegiste para acortar. Pasa de ${minutes} a ${newMinutes} min.`,
        newMinutes,
        newEndTime: clockMinutes(activity.startTime) != null ? endClock(activity.startTime, newMinutes) : null,
        newSteps: trimSteps(activity.steps, newMinutes),
        proposedDate: null,
      };
    }
    const others = plan.items.filter((other) => other.activity.id !== id && other.group === 'esperar');
    return {
      activity,
      group,
      reason: 'La elegiste para otro día.',
      newMinutes: null,
      newEndTime: null,
      newSteps: null,
      proposedDate: proposeDate(activity, plan.date, activities, others, null),
    };
  });
  const savedMinutes = items.reduce((sum, item) => {
    if (item.group === 'esperar') return sum + activityMinutes(item.activity);
    if (item.group === 'acortar' && item.newMinutes != null) return sum + activityMinutes(item.activity) - item.newMinutes;
    return sum;
  }, 0);
  return { ...plan, items, savedMinutes };
}

/** The drafts to save when she approves. Activities that keep their place are not touched. */
export function draftsFor(plan: DifficultDayPlan): ActivityDraft[] {
  return plan.items.flatMap((item) => {
    if (item.group === 'acortar' && item.newMinutes != null) {
      return [toDraft(item.activity, {
        endTime: item.newEndTime ?? item.activity.endTime,
        estimateMinutes: item.newMinutes,
        steps: item.newSteps ?? item.activity.steps,
        durationSource: 'cyclia',
      })];
    }
    if (item.group === 'esperar' && item.proposedDate) {
      return [toDraft(item.activity, {
        date: item.proposedDate,
        planStatus: 'pendiente',
        completedAt: null,
      })];
    }
    return [];
  });
}

export const REPLAN_UNDO_KEY = 'cyclia_replan_undo';

export interface ReplanUndo {
  date: string;
  appliedAt: string;
  before: ActivityDraft[];
}

export function readReplanUndo(today: string): ReplanUndo | null {
  try {
    const raw = localStorage.getItem(REPLAN_UNDO_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReplanUndo;
    if (!parsed || parsed.date !== today || !Array.isArray(parsed.before)) {
      localStorage.removeItem(REPLAN_UNDO_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeReplanUndo(value: ReplanUndo | null): void {
  try {
    if (value) localStorage.setItem(REPLAN_UNDO_KEY, JSON.stringify(value));
    else localStorage.removeItem(REPLAN_UNDO_KEY);
  } catch {
    // The browser can block storage. Undo then lasts while the screen stays open.
  }
}
