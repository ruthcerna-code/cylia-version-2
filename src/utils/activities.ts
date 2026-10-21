import type { DailyLog, MenstrualPhase, ScheduledActivity } from '../types';

export type ActivitySuggestion = {
  title: string;
  note: string;
};

const GENERAL: ActivitySuggestion = {
  title: 'Pausa de bienestar',
  note: 'No hay información suficiente para una sugerencia más específica. Esta es una actividad general de bienestar: puedes aceptarla, modificarla o reemplazarla. No es una indicación médica.',
};

export function suggestActivity(phase: MenstrualPhase | null, log?: DailyLog | null): ActivitySuggestion {
  if (!phase || !log) return GENERAL;

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
  const byDate = a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
  return byDate || a.title.localeCompare(b.title);
}

export function pendingSyncCount(items: ScheduledActivity[]): number {
  return items.filter((item) => item.syncStatus !== 'synced').length;
}

function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatMinutes(total: number): string {
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
}): { end?: string; error?: string } {
  if (!input.title.trim()) return { error: 'Escribe el nombre de la actividad.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: 'Elige la fecha de la actividad.' };
  const startMin = parseTime(input.startTime);
  if (startMin == null) return { error: 'Indica la hora de inicio.' };

  let endMin = parseTime(input.endTime);
  if (!input.endTime.trim() && input.duration.trim()) {
    const duration = Number(input.duration);
    if (!Number.isFinite(duration) || duration <= 0) return { error: 'La duración debe ser mayor que cero.' };
    endMin = startMin + duration;
  }

  if (endMin == null) return { error: 'Indica la hora de término o la duración.' };
  if (endMin >= 24 * 60 || endMin <= startMin) {
    return { error: 'La hora de término debe ser posterior a la de inicio.' };
  }
  return { end: formatMinutes(endMin) };
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

export const LOCAL_ACTIVITY_STORE_NOTE = 'Tus actividades están guardadas en este dispositivo para tu cuenta. Para que también sigan disponibles al entrar desde otro equipo, ejecuta supabase/migrations/20261016180000_scheduled_activities.sql en el SQL Editor de Supabase.';

export function explainActivityError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/schema cache|scheduled_activities|does not exist|could not find the table/i.test(message)) {
    return 'Falta crear la tabla de actividades en Supabase. Ejecuta supabase/migrations/20261016180000_scheduled_activities.sql en el SQL Editor.';
  }
  return message || 'No se pudo completar la acción.';
}

export function formatActivityWhen(activity: Pick<ScheduledActivity, 'date' | 'startTime' | 'endTime'>): string {
  const [year, month, day] = activity.date.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const label = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  return `${label} · ${activity.startTime}–${activity.endTime}`;
}
