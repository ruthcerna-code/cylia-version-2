import type { DailyLog, MenstrualPhase, ScheduledActivity } from '../types';

export type ActivitySuggestion = {
  title: string;
  note: string;
};

const GENERAL: ActivitySuggestion = {
  title: 'Pausa de bienestar',
  note: 'No hay información suficiente para una sugerencia más específica. Esta es una actividad general de bienestar: puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
};

export function suggestActivity(phase: MenstrualPhase | null, log?: DailyLog | null, options?: { lowerLoad?: boolean }): ActivitySuggestion {
  const low: ActivitySuggestion = {
    title: 'Tareas de bajo esfuerzo',
    note: 'Según lo que registraste, conviene bajar la carga hoy. Puedes aceptarlo, modificarlo o dejarlo. No es una indicación médica.',
  };
  if (log?.energy != null && log.energy <= 2) return low;
  if (options?.lowerLoad) return low;
  if (!phase || !log) {
    if (log?.energy != null && log.energy >= 4) {
      return {
        title: 'Hay espacio para una tarea más exigente',
        note: 'Según la energía que registraste, puedes elegir una tarea de más esfuerzo. No es una indicación médica.',
      };
    }
    return GENERAL;
  }

  const load = (log.fatigue + log.stress + log.pain) / 3;
  const needsRest = load >= 3.5 || log.mood >= 4 || log.sleepQuality >= 4;
  if (needsRest) {
    return {
      title: 'Descanso suave',
      note: 'Según el bienestar que registraste, una pausa tranquila puede ser una opción. Puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
    };
  }

  const byPhase: Record<MenstrualPhase, ActivitySuggestion> = {
    Menstrual: {
      title: 'Caminata corta',
      note: 'Según la fase estimada y cómo registraste el día, una salida breve puede ser una opción. Puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
    },
    Folicular: {
      title: 'Bloque para empezar algo',
      note: 'Según la fase estimada y cómo registraste el día, un bloque corto para empezar algo puede ser una opción. Puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
    },
    Ovulacion: {
      title: 'Encuentro o tarea que te entusiasme',
      note: 'Según la fase estimada y cómo registraste el día, dejar un espacio para algo que te entusiasme puede ser una opción. Puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
    },
    Lutea: {
      title: 'Cerrar un pendiente',
      note: 'Según la fase estimada y cómo registraste el día, reservar un rato para cerrar un pendiente puede ser una opción. Puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
    },
  };

  return byPhase[phase];
}

export function compareActivities(a: ScheduledActivity, b: ScheduledActivity): number {
  const byDate = a.date.localeCompare(b.date) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99');
  return byDate || a.title.localeCompare(b.title);
}

export type MinuteWindow = { date: string; start: number; end: number };
export type MinuteRange = { start: number; end: number };

export function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayNumber(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(year, (month || 1) - 1, day || 1) / 86400000);
}

export function activityWindow(activity: Pick<ScheduledActivity, 'date' | 'startTime' | 'endTime' | 'estimateMinutes'>): MinuteWindow | null {
  const start = parseTime(activity.startTime);
  const endClock = parseTime(activity.endTime);
  if (!activity.date || start == null) return null;
  if (endClock != null && endClock > start) return { date: activity.date, start, end: endClock };
  if (endClock != null && activity.estimateMinutes && activity.estimateMinutes > 0) {
    const expected = (start + activity.estimateMinutes) % (24 * 60);
    if (expected === endClock && activity.estimateMinutes > endClock - start) {
      return { date: activity.date, start, end: start + activity.estimateMinutes };
    }
  }
  return null;
}

function absoluteRange(window: MinuteWindow): MinuteRange {
  const origin = dayNumber(window.date) * 1440;
  return { start: origin + window.start, end: origin + window.end };
}

function rangesOverlap(left: MinuteRange, right: MinuteRange): boolean {
  return left.start < right.end && right.start < left.end;
}

export function overlappingActivity(
  items: ScheduledActivity[],
  candidate: { id?: string; date: string; startTime: string; endTime: string; durationMinutes?: number },
): ScheduledActivity | null {
  const start = parseTime(candidate.startTime);
  if (start == null) return null;
  const duration = candidate.durationMinutes ?? (() => {
    const end = parseTime(candidate.endTime);
    return end != null && end > start ? end - start : null;
  })();
  if (duration == null || duration <= 0) return null;
  const candidateRange = absoluteRange({ date: candidate.date, start, end: start + duration });
  return items.find((item) => {
    if (item.id === candidate.id) return false;
    const window = activityWindow(item);
    return window ? rangesOverlap(candidateRange, absoluteRange(window)) : false;
  }) || null;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

function clipToDate(window: MinuteWindow, date: string): MinuteRange | null {
  const dayStart = dayNumber(date) * 1440;
  const span = absoluteRange(window);
  const start = Math.max(span.start, dayStart) - dayStart;
  const end = Math.min(span.end, dayStart + 1440) - dayStart;
  return end > start ? { start, end } : null;
}

function mergeRanges(ranges: MinuteRange[]): MinuteRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MinuteRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) merged.push({ ...range });
    else last.end = Math.max(last.end, range.end);
  }
  return merged;
}

export function freeGaps(items: ScheduledActivity[], date: string): MinuteRange[] {
  const occupied = mergeRanges(items.flatMap((item) => {
    const window = activityWindow(item);
    const clipped = window ? clipToDate(window, date) : null;
    return clipped ? [clipped] : [];
  }));
  const visible = items
    .filter((item) => item.date === date)
    .map((item) => activityWindow(item))
    .flatMap((window) => (window ? [window] : []))
    .sort((a, b) => a.start - b.start);
  const gaps: MinuteRange[] = [];
  for (let index = 1; index < visible.length; index += 1) {
    const previous = clipToDate(visible[index - 1], date);
    const next = clipToDate(visible[index], date);
    if (!previous || !next || next.start <= previous.end) continue;
    let cursor = previous.end;
    for (const block of occupied) {
      if (block.end <= cursor || block.start >= next.start) continue;
      if (block.start > cursor) gaps.push({ start: cursor, end: Math.min(block.start, next.start) });
      cursor = Math.max(cursor, block.end);
      if (cursor >= next.start) break;
    }
    if (cursor < next.start) gaps.push({ start: cursor, end: next.start });
  }
  return gaps;
}

export function pendingSyncCount(items: ScheduledActivity[]): number {
  return items.filter((item) => item.syncStatus !== 'synced').length;
}

export function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function resolveSchedule(input: {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: string;
}): { end?: string; durationMinutes?: number; endsNextDay?: boolean; error?: string } {
  if (!input.title.trim()) return { error: 'Escribe el nombre de la actividad.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'Elige la fecha de la actividad.' };
  const startMin = parseTime(input.startTime);
  if (startMin == null) return { error: 'Indica la hora de inicio.' };

  if (!input.endTime.trim() && input.duration.trim()) {
    const duration = Number(input.duration);
    if (!Number.isInteger(duration) || duration <= 0) return { error: 'La duración debe ser mayor que cero.' };
    if (duration > 18 * 60) return { error: 'Elige una duración de hasta 18 horas.' };
    return {
      end: formatMinutes((startMin + duration) % (24 * 60)),
      durationMinutes: duration,
      endsNextDay: startMin + duration >= 24 * 60,
    };
  }

  const endMin = parseTime(input.endTime);
  if (endMin == null) return { error: 'Indica la hora de término o la duración.' };
  if (endMin <= startMin) return { error: 'La hora de término debe ser posterior a la de inicio.' };
  return { end: formatMinutes(endMin), durationMinutes: endMin - startMin, endsNextDay: false };
}

export function statusLabel(status: ScheduledActivity['syncStatus']): string {
  switch (status) {
    case 'pending':
    case 'delete_pending':
      return 'Pendiente de sincronización';
    case 'synced':
      return 'Sincronizada';
    case 'changed':
      return 'Cambios pendientes';
    case 'error':
      return 'Error de sincronización';
  }
}

export const LOCAL_ACTIVITY_STORE_NOTE = 'Tus actividades se guardan en Firebase, en la cuenta con la que entraste.';

export function explainActivityError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/schema cache|scheduled_activities|does not exist|could not find the table/i.test(message)) {
    return 'Firebase no permitió guardar la actividad. Revisa que hayas entrado con tu correo.';
  }
  return message || 'No se pudo completar la acción.';
}

export function formatActivityWhen(activity: Pick<ScheduledActivity, 'date' | 'startTime' | 'endTime'>): string {
  const [year, month, day] = activity.date.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const label = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  if (!activity.startTime || !activity.endTime) return `${label} · sin hora`;
  return `${label} · ${activity.startTime}–${activity.endTime}`;
}
