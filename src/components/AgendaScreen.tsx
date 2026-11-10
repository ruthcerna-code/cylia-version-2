import React, { useEffect, useId, useRef, useState } from 'react';
import type { ActivityDraft } from '../firebase';
import type { DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../types';
import { compareActivities, overlappingActivity, resolveSchedule } from '../utils/activities';
import { formatFriendlyDate } from '../utils/cycle';
import { agendaCycleReminder, compareRecords, dayRecordNote } from '../utils/recordCompare';

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

export default function AgendaScreen({
  activities,
  loadError,
  storageNote,
  seed,
  profile,
  periods,
  logs,
  onSeedApplied,
  onSave,
  onDelete,
  onRefresh,
}: {
  activities: ScheduledActivity[];
  loadError: string;
  storageNote: string;
  seed: AgendaSeed | null;
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  onSeedApplied: () => void;
  onSave: (draft: ActivityDraft) => Promise<void | { id: string }>;
  onDelete: (activity: ScheduledActivity) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const titleId = useId();
  const formErrorId = useId();
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);
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

  const visible = activities.filter((item) => item.startTime && item.endTime).sort(compareActivities);
  const untimed = activities.length - visible.length;
  const days = visible.reduce<Array<{ date: string; items: ScheduledActivity[] }>>((groups, activity) => {
    const last = groups[groups.length - 1];
    if (last?.date === activity.date) last.items.push(activity);
    else groups.push({ date: activity.date, items: [activity] });
    return groups;
  }, []);
  const reminder = agendaCycleReminder(profile, periods, form.date);
  const dayNote = dayRecordNote(logs[form.date]);
  const reading = compareRecords(profile, periods, logs);

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
    const clash = overlappingActivity(activities, { id: form.id || undefined, date: form.date, startTime: form.startTime, endTime: resolved.end });
    if (clash) {
      setFormError(`Este horario se cruza con ${clash.title}.`);
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
      void onRefresh().catch(() => undefined);
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la actividad.');
    } finally {
      setSaving(false);
    }
  };

  const removeActivity = async (activity: ScheduledActivity) => {
    const accepted = window.confirm('¿Eliminar esta actividad de Cyclia?');
    if (!accepted) return;
    setFormError('');
    try {
      await onDelete(activity);
      if (form.id === activity.id) setForm(emptyForm);
      setFormMessage('Actividad eliminada de Cyclia.');
      void onRefresh().catch(() => undefined);
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo eliminar la actividad.');
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      <header className="flex flex-col gap-1 px-1 pt-6">
        <span className="font-serif text-[15px] tracking-[0.18em] text-[#3A44C4]">CYCLIA</span>
        <h1 className="m-0 text-[28px] font-extrabold text-[#1B1F5E]">Agendar actividades</h1>
        <p className="m-0 text-sm text-[#4A4F7A]">Las actividades se guardan en tu cuenta, dentro de la base de Cyclia.</p>
      </header>

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
        <p className="m-0 rounded-2xl bg-[#E7EAF8] px-3 py-3 text-sm text-[#1B1F5E]" role="status">
          <strong className="block">{reminder.title}</strong>
          {reminder.detail}
          {dayNote ? ` ${dayNote}` : ''}
        </p>
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
        <section className="rounded-2xl bg-[#F8F9FE] px-3 py-3">
          <h3 className="m-0 text-sm font-extrabold">Tus registros y la proyección</h3>
          {reading.map((line) => <p key={line} className="m-0 mt-2 text-sm leading-relaxed text-[#3B4070]">{line}</p>)}
          <p className="m-0 mt-2 text-xs text-[#4A4F7A]">Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
        </section>
        <button type="submit" disabled={saving} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E] disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar actividad'}
        </button>
      </form>

      <section className="flex flex-col gap-3" aria-labelledby="agenda-list-heading">
        <h2 id="agenda-list-heading" className="m-0 px-1 text-base font-extrabold">Actividades en Cyclia</h2>
        {loadError && <p className="m-0 rounded-[20px] bg-white p-4 text-sm text-[#9C3B45]" role="alert">{loadError}</p>}
        {storageNote && <p className="m-0 rounded-[20px] bg-[#FFF6CF] p-4 text-sm text-[#1B1F5E]" role="status">{storageNote}</p>}
        {!visible.length && !loadError && (
          <p className="m-0 rounded-[20px] bg-white p-4 text-sm text-[#3B4070]">Aún no hay actividades con hora. Las tareas sin hora se ordenan en Organiza tu día.</p>
        )}
        {untimed > 0 && (
          <p className="m-0 rounded-[20px] bg-[#E7EAF8] p-4 text-sm text-[#1B1F5E]">Hay {untimed} {untimed === 1 ? 'tarea sin hora' : 'tareas sin hora'}. El orden del día está en Organiza tu día.</p>
        )}
        <div className="flex flex-col gap-3">
          {days.map((day) => (
            <section key={day.date} className="rounded-[20px] bg-white p-4">
              <h3 className="m-0 text-base font-extrabold capitalize">{formatFriendlyDate(day.date)}</h3>
              <p className="m-0 mt-1 text-sm text-[#3B4070]">{agendaCycleReminder(profile, periods, day.date).title}</p>
              <ul className="m-0 mt-3 list-none p-0">
                {day.items.map((activity) => (
                  <li key={activity.id} className="grid grid-cols-[4.5rem_1fr] gap-3 border-t border-[#E7EAF8] py-3 first:border-t-0 first:pt-0">
                    <div className="text-sm font-extrabold leading-5 text-[#1B1F5E]">
                      <span className="block">{activity.startTime}</span>
                      <span className="block font-bold text-[#4A4F7A]">{activity.endTime}</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="m-0 text-[15px] font-extrabold leading-5">{activity.title}</h4>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => editActivity(activity)} className="h-10 cursor-pointer rounded-full bg-[#F6E27F] px-4 text-sm font-extrabold text-[#1B1F5E]">Editar</button>
                        <button type="button" onClick={() => { void removeActivity(activity); }} className="h-10 cursor-pointer rounded-full border border-[#C9D3EF] bg-white px-4 text-sm font-extrabold text-[#1B1F5E]">Eliminar</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
