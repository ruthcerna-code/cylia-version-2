import { supabase } from './supabase';

export type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  calendarName: string | null;
  lastSyncAt: string | null;
  calendars: { id: string; name: string }[];
  warning: string | null;
};

export type SyncResult = {
  created: number;
  updated: number;
  deleted: number;
  failed: { title: string; error: string }[];
};

async function authHeaders(): Promise<HeadersInit> {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Inicia sesión para continuar.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la acción.');
  return body as T;
}

export function fetchCalendarStatus(): Promise<CalendarStatus> {
  return request<CalendarStatus>('/api/calendar/status');
}

export async function startCalendarConnect(): Promise<void> {
  const body = await request<{ url: string }>('/api/calendar/connect', { method: 'POST' });
  window.location.assign(body.url);
}

export function selectCalendar(calendarId: string, calendarName: string): Promise<{ ok: boolean }> {
  return request('/api/calendar/select', {
    method: 'POST',
    body: JSON.stringify({ calendarId, calendarName }),
  });
}

export function disconnectCalendar(): Promise<{ ok: boolean }> {
  return request('/api/calendar/disconnect', { method: 'POST' });
}

export function syncCalendar(): Promise<SyncResult> {
  return request<SyncResult>('/api/calendar/sync', { method: 'POST' });
}

export function formatSyncResult(result: SyncResult): string {
  const failed = result.failed.length;
  const summary = `Se crearon ${result.created}, se actualizaron ${result.updated}, se eliminaron ${result.deleted} y no se pudieron sincronizar ${failed}.`;
  if (!failed) return summary;
  const names = result.failed.map((item) => item.title).join(', ');
  return `${summary} No se pudieron sincronizar: ${names}.`;
}
