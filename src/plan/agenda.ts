import type { ScheduledActivity } from '../types';
import { compareActivities } from '../utils/activities';
import { shiftDate } from './proposal';

export type AgendaRange = 'proximas' | 'todas';

export interface AgendaDay {
  date: string;
  /** «Hoy», «Mañana», «Ayer» or the weekday with the date. */
  label: string;
  activities: ScheduledActivity[];
}

const WEEKDAY = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

export function agendaDayLabel(date: string, today: string): string {
  if (date === today) return 'Hoy';
  if (date === shiftDate(today, 1)) return 'Mañana';
  if (date === shiftDate(today, -1)) return 'Ayer';
  const text = WEEKDAY.format(new Date(`${date}T12:00:00`));
  return text.charAt(0).toLocaleUpperCase('es') + text.slice(1);
}

/**
 * Every scheduled activity, ordered by date and start time, grouped by day.
 * 'proximas' shows today and later; 'todas' also shows past days.
 */
export function agendaGroups(activities: ScheduledActivity[], today: string, range: AgendaRange = 'proximas'): AgendaDay[] {
  const visible = activities
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date))
    .filter((item) => range === 'todas' || item.date >= today)
    .sort(compareActivities);
  const days: AgendaDay[] = [];
  visible.forEach((activity) => {
    const last = days[days.length - 1];
    if (last && last.date === activity.date) last.activities.push(activity);
    else days.push({ date: activity.date, label: agendaDayLabel(activity.date, today), activities: [activity] });
  });
  return days;
}

/** How many activities are still pending from today on. */
export function pendingAhead(activities: ScheduledActivity[], today: string): number {
  return activities.filter((item) => item.date >= today && item.planStatus !== 'hecha').length;
}
