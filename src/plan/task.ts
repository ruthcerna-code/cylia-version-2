import type { ActivityColor, AlertKey, ScheduledActivity, Subtask } from '../types';
import { clockMinutes, formatClock } from './proposal';

/** Colors she can give an activity. They are soft so the cards stay mostly white. */
export const ACTIVITY_COLORS: Record<ActivityColor, { label: string; hex: string }> = {
  coral: { label: 'Rosa coral', hex: '#FF8243' },
  naranjo: { label: 'Naranja suave', hex: '#F7B27A' },
  amarillo: { label: 'Amarillo', hex: '#FCE883' },
  verde: { label: 'Verde pastel', hex: '#9FD3B0' },
  azulgris: { label: 'Azul grisáceo', hex: '#8FA3BF' },
  lavanda: { label: 'Lavanda', hex: '#B9A9E8' },
  burdeo: { label: 'Burdeos', hex: '#9E3B5B' },
  azul: { label: 'Azul oscuro', hex: '#069494' },
};

export const ACTIVITY_COLOR_KEYS = Object.keys(ACTIVITY_COLORS) as ActivityColor[];

/** Default stripe when she did not choose a color: Cyclia's lavender blue. */
export const DEFAULT_STRIPE = '#FFD3BC';

export const ALERT_OPTIONS: Record<AlertKey, string> = {
  inicio: 'Al inicio de la tarea',
  fin: 'Al finalizar la tarea',
  '5': '5 minutos antes',
  '15': '15 minutos antes',
  '30': '30 minutos antes',
  '60': '1 hora antes',
};

// Explicit list: Object.keys would put the numeric keys ('5', '15'...) before 'inicio'.
export const ALERT_KEYS: AlertKey[] = ['inicio', 'fin', '5', '15', '30', '60'];

export const DURATION_OPTIONS = [15, 30, 45, 60, 90];

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!rest) return hours === 1 ? '1 h' : `${hours} h`;
  return `${hours} h ${rest} min`;
}

/** Start times every 15 minutes around a given time, for the quick picker. */
export function quarterSlots(around: string, count = 8): string[] {
  const base = clockMinutes(around) ?? 9 * 60;
  // Stay inside the same day: near midnight the window slides back instead of wrapping to 00:00.
  const first = Math.min(Math.max(0, Math.floor(base / 15) * 15 - 30), 24 * 60 - count * 15);
  return Array.from({ length: count }, (_, index) => formatClock(first + index * 15));
}

/** Minutes after midnight when the activity ends; it can pass 1440 if it ends the next day. */
export function endMinutes(start: string, duration: number): number | null {
  const begin = clockMinutes(start);
  return begin == null ? null : begin + duration;
}

export function endsNextDay(start: string, duration: number): boolean {
  const end = endMinutes(start, duration);
  return end != null && end >= 24 * 60;
}

export type TaskStatus = 'pendiente' | 'en_curso' | 'vencida' | 'hecha' | 'no_realizada';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  vencida: 'Vencida',
  hecha: 'Completada',
  no_realizada: 'No realizada',
};

/** Status shown on the card. An activity is never marked done just because its time passed. */
export function taskStatus(activity: Pick<ScheduledActivity, 'date' | 'startTime' | 'endTime' | 'planStatus'>, now: Date): TaskStatus {
  if (activity.planStatus === 'hecha') return 'hecha';
  if (activity.planStatus === 'pospuesta') return 'no_realizada';
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (activity.date < today) return 'vencida';
  if (activity.date > today) return 'pendiente';
  const minute = now.getHours() * 60 + now.getMinutes();
  const start = clockMinutes(activity.startTime);
  let end = clockMinutes(activity.endTime);
  if (start == null) return 'pendiente';
  if (end != null && end <= start) end += 24 * 60;
  if (end == null) end = start;
  if (minute >= end) return 'vencida';
  if (minute >= start || activity.planStatus === 'en_curso') return 'en_curso';
  return 'pendiente';
}

/** The activity's checklist: its subtasks, or its Cyclia steps as unchecked subtasks. */
export function subtasksOf(activity: Pick<ScheduledActivity, 'subtasks' | 'steps'>): Subtask[] {
  if (activity.subtasks) return activity.subtasks;
  return activity.steps.map((step, index) => ({ id: `paso-${index}`, title: step.action, done: false }));
}

export function subtaskProgress(activity: Pick<ScheduledActivity, 'subtasks' | 'steps'>): { done: number; total: number } {
  const list = subtasksOf(activity);
  return { done: list.filter((item) => item.done).length, total: list.length };
}

/** Moves a subtask one position up or down. */
export function moveSubtask(list: Subtask[], id: string, direction: -1 | 1): Subtask[] {
  const index = list.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/** Adds an alert once; the list keeps the order of ALERT_KEYS. */
export function addAlert(list: AlertKey[], key: AlertKey): AlertKey[] {
  return ALERT_KEYS.filter((item) => item === key || list.includes(item));
}
