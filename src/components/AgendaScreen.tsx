import React, { useEffect, useId, useRef, useState } from 'react';
import {
  disconnectCalendar,
  fetchCalendarStatus,
  formatSyncResult,
  selectCalendar,
  startCalendarConnect,
  syncCalendar,
  type CalendarStatus,
} from '../calendarApi';
import type { ActivityDraft } from '../supabase';
import type { ScheduledActivity } from '../types';
import { formatActivityWhen, pendingSyncCount, resolveSchedule, statusLabel } from '../utils/activities';

export type AgendaSeed = { token: number; title: string; date: string };

const REMINDERS = [
  { value: '', label: 'Sin recordatorio' },
  { value: '10', label: '10 minutos antes' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 día antes' },
];

const emptyForm = {
  id: '',
  title: '',
  date: '',
  startTime: '',
  endTime: '',
  duration: '',
  reminder: '',
  notes: '',
};

function formatSyncStamp(value: string | null): string {
  if (!value) return 'Todavía no hay una sincronización exitosa.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Todavía no hay una sincronización exitosa.';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AgendaScreen({
  activities,
  loadError,
  storageNote,
  seed,
  onSeedApplied,
  onSave,
  onDelete,
  onRefresh,
}: {
  activities: ScheduledActivity[];
  loadError: string;
  storageNote: string;
  seed: AgendaSeed | null;
  onSeedApplied: () => void;
  onSave: (draft: ActivityDraft) => Promise<void>;
  onDelete: (activity: ScheduledActivity) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const titleId = useId();
  const formErrorId = useId();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | ''>('');
  const onSeedAppliedRef = useRef(onSeedApplied);
  const seenSeed = useRef<number | null>(null);
  onSeedAppliedRef.current = onSeedApplied;

  useEffect(() => {
    if (!seed || seenSeed.current === seed.token) return;
    seenSeed.current = seed.token;
    setForm({ ...emptyForm, title: seed.title, date: seed.date });
    setFormError('');
    setFormMessage('');
    onSeedAppliedRef.current();
    window.setTimeout(() => {
      document.getElementById('agenda-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [seed]);

  const loadStatus = async () => {
    try {
      const next = await fetchCalendarStatus();
      setStatus(next);
      setStatusError('');
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No se pudo leer Google Calendar.');
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const visible = activities.filter((item) => item.syncStatus !== 'delete_pending');
  const deletions = activities.filter((item) => item.syncStatus === 'delete_pending');
  const pending = pendingSyncCount(activities);

  const editActivity = (activity: ScheduledActivity) => {
    setForm({
      id: activity.id,
      title: activity.title,
      date: activity.date,
      startTime: activity.startTime,
      endTime: activity.endTime,
      duration: '',
      reminder: activity.reminderMinutes == null ? '' : String(activity.reminderMinutes),
      notes: activity.notes,
    });
    setFormError('');
    setFormMessage('');
    document.getElementById('agenda-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const resolved = resolveSchedule(form);
    if (resolved.error || !resolved.end) {
      setFormError(resolved.error || 'Revisa los datos de la actividad.');
      setFormMessage('');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await onSave({
        id: form.id || undefined,
        title: form.title.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: resolved.end,
        reminderMinutes: form.reminder ? Number(form.reminder) : null,
        notes: form.notes.trim(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      setForm(emptyForm);
      setFormMessage('Actividad guardada en Cyclia');
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la actividad.');
    } finally {
      setSaving(false);
    }
  };

  const removeActivity = async (activity: ScheduledActivity) => {
    const synced = Boolean(activity.googleEventId);
    const accepted = window.confirm(synced
      ? 'Esta actividad también se eliminará de Google Calendar en la próxima sincronización. ¿Continuar?'
      : '¿Eliminar esta actividad de Cyclia?');
    if (!accepted) return;
    setFormError('');
    try {
      await onDelete(activity);
      if (form.id === activity.id) setForm(emptyForm);
      setFormMessage(synced
        ? 'La eliminación quedó pendiente. Se confirmará en Google en la próxima sincronización.'
        : 'Actividad eliminada de Cyclia.');
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo eliminar la actividad.');
    }
  };

  const connect = async () => {
    setBusy('connect');
    setSyncMessage('');
    try {
      await startCalendarConnect();
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No se pudo conectar Google Calendar.');
      setBusy('');
    }
  };

  const sync = async () => {
    setBusy('sync');
    setSyncMessage('');
    try {
      const result = await syncCalendar();
      setSyncMessage(formatSyncResult(result));
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'No se pudo sincronizar. Tus actividades siguen guardadas en Cyclia.');
    } finally {
      try {
        await Promise.all([onRefresh(), loadStatus()]);
      } catch {
        // La actividad local se conserva aunque falle la lectura posterior.
      }
      setBusy('');
    }
  };

  const disconnect = async () => {
    const accepted = window.confirm('Se desconectará Google Calendar. Los eventos que ya se crearon permanecerán en Google. ¿Continuar?');
    if (!accepted) return;
    setBusy('disconnect');
    try {
      await disconnectCalendar();
      setSyncMessage('Google Calendar se desconectó. Los eventos que ya se crearon permanecen en Google.');
      await loadStatus();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'No se pudo desconectar.');
    } finally {
      setBusy('');
    }
  };

  const chooseCalendar = async (calendarId: string) => {
    const calendar = status?.calendars.find((item) => item.id === calendarId);
    if (!calendar) return;
    try {
      await selectCalendar(calendar.id, calendar.name);
      setStatus((current) => current ? { ...current, calendarId: calendar.id, calendarName: calendar.name } : current);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'No se pudo elegir el calendario.');
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      <header className="flex flex-col gap-1 px-1 pt-6">
        <span className="font-serif text-[15px] tracking-[0.18em] text-[#3A44C4]">CYCLIA</span>
        <h1 className="m-0 text-[28px] font-extrabold text-[#1B1F5E]">Agendar actividades</h1>
        <p className="m-0 text-sm text-[#4A4F7A]">Las actividades quedan en tu cuenta de Cyclia aunque Google Calendar no esté conectado.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4" aria-labelledby="google-calendar-heading">
        <h2 id="google-calendar-heading" className="m-0 text-base font-extrabold">Google Calendar</h2>
        <p className="m-0 text-sm text-[#3B4070]">La sincronización es manual y solo va de Cyclia hacia Google. Las actividades de esta función se editan en Cyclia: los cambios hechos directo en Google no vuelven a la app. Entrar con Gmail no autoriza el calendario.</p>
        {statusError && <p className="m-0 text-sm font-bold text-[#9C3B45]" role="alert">{statusError}</p>}
        {status?.warning && <p className="m-0 text-sm text-[#9C3B45]" role="status">{status.warning}</p>}
        {!status?.connected ? (
          <>
            <button type="button" onClick={() => { void connect(); }} disabled={busy === 'connect'} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E] disabled:opacity-60">
              {busy === 'connect' ? 'Abriendo Google…' : 'Conectar Google Calendar'}
            </button>
            {status && !status.configured && (
              <p className="m-0 text-sm text-[#3B4070]">Puedes guardar actividades igual. La conexión se habilita cuando el servidor tiene las credenciales de Google Calendar.</p>
            )}
          </>
        ) : (
          <>
            <p className="m-0 text-sm"><strong>Cuenta:</strong> {status.email || 'Cuenta de Google conectada'}</p>
            <label className="flex flex-col gap-1.5 text-sm font-extrabold" htmlFor="agenda-calendar">
              Calendario de destino
              <select
                id="agenda-calendar"
                value={status.calendarId || ''}
                onChange={(event) => { void chooseCalendar(event.target.value); }}
                className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]"
              >
                {!status.calendars.length && status.calendarId && (
                  <option value={status.calendarId}>{status.calendarName || status.calendarId}</option>
                )}
                {status.calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
                ))}
              </select>
            </label>
            <p className="m-0 text-sm"><strong>Última sincronización exitosa:</strong> {formatSyncStamp(status.lastSyncAt)}</p>
            <p className="m-0 text-sm"><strong>Pendientes:</strong> {pending === 0 ? 'No hay actividades ni cambios pendientes.' : `${pending} ${pending === 1 ? 'actividad o cambio pendiente' : 'actividades o cambios pendientes'}`}</p>
            <button type="button" onClick={() => { void sync(); }} disabled={busy === 'sync'} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#3A44C4] text-[15px] font-extrabold text-white disabled:opacity-60">
              {busy === 'sync' ? 'Sincronizando…' : 'Sincronizar con Google Calendar'}
            </button>
            <button type="button" onClick={() => { void disconnect(); }} disabled={busy === 'disconnect'} className="h-11 cursor-pointer rounded-full border border-[#C9D3EF] bg-white text-sm font-extrabold text-[#1B1F5E]">
              Desconectar
            </button>
            <p className="m-0 text-xs text-[#4A4F7A]">Si desconectas la cuenta, los eventos que ya se crearon permanecen en Google.</p>
          </>
        )}
        {syncMessage && <p className="m-0 text-sm font-bold text-[#1B1F5E]" role="status">{syncMessage}</p>}
      </section>

      <form id="agenda-form" className="flex flex-col gap-3 rounded-[20px] bg-white p-4" onSubmit={(event) => { void submit(event); }} noValidate>
        <h2 className="m-0 text-base font-extrabold">{form.id ? 'Editar actividad' : 'Nueva actividad'}</h2>
        {form.id && (
          <button type="button" onClick={() => { setForm(emptyForm); setFormMessage(''); }} className="w-fit cursor-pointer text-sm font-extrabold text-[#3A44C4]">Cancelar edición</button>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-extrabold" htmlFor={titleId}>
          Actividad
          <input
            id={titleId}
            value={form.title}
            required
            aria-invalid={Boolean(formError)}
            aria-describedby={formError ? formErrorId : undefined}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E] outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold" htmlFor="agenda-date">
          Fecha
          <input id="agenda-date" type="date" required value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold" htmlFor="agenda-start">
          Hora de inicio
          <input id="agenda-start" type="time" required value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]" />
        </label>
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="p-0 text-sm font-extrabold">Hora de término o duración</legend>
          <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="agenda-end">
            Hora de término
            <input id="agenda-end" type="time" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="agenda-duration">
            Duración en minutos
            <input id="agenda-duration" type="number" min={1} step={5} inputMode="numeric" value={form.duration} placeholder="Ej.: 45" onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]" />
          </label>
        </fieldset>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold" htmlFor="agenda-reminder">
          Recordatorio <span className="font-semibold text-[#4A4F7A]">opcional</span>
          <select id="agenda-reminder" value={form.reminder} onChange={(event) => setForm((current) => ({ ...current, reminder: event.target.value }))} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]">
            {REMINDERS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold" htmlFor="agenda-notes">
          Notas <span className="font-semibold text-[#4A4F7A]">opcionales</span>
          <textarea id="agenda-notes" rows={3} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="resize-none rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] p-2.5 text-sm font-normal text-[#1B1F5E] outline-none" />
        </label>
        {formError && <p id={formErrorId} className="m-0 text-sm font-bold text-[#9C3B45]" role="alert">{formError}</p>}
        {formMessage && <p className="m-0 text-sm font-extrabold text-[#1B1F5E]" role="status">{formMessage}</p>}
        <button type="submit" disabled={saving} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar actividad'}
        </button>
      </form>

      <section className="flex flex-col gap-3" aria-labelledby="agenda-list-heading">
        <h2 id="agenda-list-heading" className="m-0 px-1 text-base font-extrabold">Actividades en Cyclia</h2>
        {loadError && <p className="m-0 rounded-[20px] bg-white p-4 text-sm text-[#9C3B45]" role="alert">{loadError}</p>}
        {storageNote && <p className="m-0 rounded-[20px] bg-[#FFF6CF] p-4 text-sm text-[#1B1F5E]" role="status">{storageNote}</p>}
        {!visible.length && !loadError && (
          <p className="m-0 rounded-[20px] bg-white p-4 text-sm text-[#3B4070]">Aún no has agendado actividades en Cyclia. Crea tu primera actividad.</p>
        )}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {visible.map((activity) => (
            <li key={activity.id} className="rounded-[20px] bg-white p-4">
              <h3 className="m-0 text-base font-extrabold">{activity.title}</h3>
              <p className="m-0 mt-1 text-sm text-[#3B4070]">{formatActivityWhen(activity)}</p>
              <p className="m-0 mt-2 text-sm font-extrabold text-[#3A44C4]">{statusLabel(activity.syncStatus)}</p>
              {activity.syncStatus === 'error' && activity.syncError && (
                <p className="m-0 mt-1 text-sm text-[#9C3B45]">{activity.syncError}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => editActivity(activity)} className="h-10 cursor-pointer rounded-full bg-[#F6E27F] px-4 text-sm font-extrabold text-[#1B1F5E]">Editar</button>
                <button type="button" onClick={() => { void removeActivity(activity); }} className="h-10 cursor-pointer rounded-full border border-[#C9D3EF] bg-white px-4 text-sm font-extrabold text-[#1B1F5E]">Eliminar</button>
                {activity.syncStatus === 'error' && (
                  <button type="button" onClick={() => { void sync(); }} className="h-10 cursor-pointer rounded-full bg-[#3A44C4] px-4 text-sm font-extrabold text-white">Reintentar</button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {deletions.length > 0 && (
          <div className="rounded-[20px] bg-white p-4 text-sm text-[#3B4070]" role="status">
            <p className="m-0 font-extrabold text-[#1B1F5E]">Eliminaciones por confirmar en Google</p>
            <ul className="m-0 mt-2 list-disc pl-5">
              {deletions.map((activity) => (
                <li key={activity.id}>
                  {activity.title}. {activity.syncError ? `Error de sincronización: ${activity.syncError}` : 'Se eliminará de Google en la próxima sincronización.'}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
