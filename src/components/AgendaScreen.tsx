import React, { useEffect, useId, useRef, useState } from 'react';
import type { ActivityDraft } from '../firebase';
import type { ActivityEffort, ActivityKind, DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../types';
import { activityWindow, addDays, formatDuration, formatMinutes, freeGaps, overlappingActivity, parseTime, resolveSchedule } from '../utils/activities';
import { formatDateStr, formatFriendlyDate } from '../utils/cycle';

export type AgendaSeed = { token: number; title: string; date: string };

const REMINDERS = [
  { value: '', label: 'Sin recordatorio' },
  { value: '10', label: '10 minutos antes' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 día antes' },
];

const KINDS: { id: ActivityKind; label: string; color: string }[] = [
  { id: 'trabajo', label: 'Trabajo', color: '#3A44C4' },
  { id: 'movimiento', label: 'Movimiento', color: '#2F8F6B' },
  { id: 'cuidado', label: 'Cuidado', color: '#D46A9A' },
  { id: 'descanso', label: 'Descanso', color: '#7C6BC4' },
  { id: 'social', label: 'Social', color: '#C48A2A' },
  { id: 'tramite', label: 'Trámite', color: '#3D7EA6' },
];

const EFFORTS: { id: ActivityEffort; label: string }[] = [
  { id: 'bajo', label: 'Bajo' },
  { id: 'medio', label: 'Medio' },
  { id: 'alto', label: 'Alto' },
];

const QUICK_DURATIONS = [
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 90, label: '1 h 30 min' },
];

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const fieldClass = 'h-12 w-full min-w-0 rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 text-base font-semibold text-[#1B1F5E] outline-none';

function todayString(): string {
  return formatDateStr(new Date());
}

function weekStart(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  const delta = date.getDay() === 0 ? -6 : 1 - date.getDay();
  return addDays(dateStr, delta);
}

function weekTitle(start: string): string {
  const end = addDays(start, 6);
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  const month = new Intl.DateTimeFormat('es-CL', { month: 'long' });
  const firstMonth = month.format(first);
  const lastMonth = month.format(last);
  const firstYear = first.getFullYear();
  const lastYear = last.getFullYear();
  const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
  if (firstMonth === lastMonth && firstYear === lastYear) return `${capital(firstMonth)} ${firstYear}`;
  if (firstYear === lastYear) return `${capital(firstMonth)} – ${lastMonth} ${firstYear}`;
  return `${capital(firstMonth)} ${firstYear} – ${lastMonth} ${lastYear}`;
}

function endAnnouncement(date: string, startTime: string, duration: number): string {
  const start = parseTime(startTime);
  if (start == null || duration <= 0) return 'La hora de término aparece al indicar inicio y duración.';
  const total = start + duration;
  const clock = formatMinutes(total % (24 * 60));
  if (total < 24 * 60) return `Termina a las ${clock}`;
  return `Termina el ${formatFriendlyDate(addDays(date, Math.floor(total / (24 * 60))))} a las ${clock}`;
}

function clockLabel(activity: ScheduledActivity): { start: string; end: string; duration: number | null; missing: string } {
  const window = activityWindow(activity);
  if (!window) {
    return {
      start: activity.startTime || '—',
      end: activity.endTime || '—',
      duration: null,
      missing: activity.startTime ? 'Falta la hora de término para calcular la duración.' : 'Esta actividad no tiene horario.',
    };
  }
  const end = window.end > 24 * 60
    ? `${formatMinutes(window.end % (24 * 60))} del día siguiente`
    : formatMinutes(window.end);
  return { start: formatMinutes(window.start), end, duration: window.end - window.start, missing: '' };
}

function toDraft(activity: ScheduledActivity, patch: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    id: activity.id,
    title: activity.title,
    date: activity.date,
    startTime: activity.startTime,
    endTime: activity.endTime,
    reminderMinutes: activity.reminderMinutes,
    notes: activity.notes,
    timeZone: activity.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    deadline: activity.deadline,
    estimateMinutes: activity.estimateMinutes,
    importance: activity.importance,
    kind: activity.kind,
    effort: activity.effort,
    dependsOn: activity.dependsOn,
    planStatus: activity.planStatus,
    sortOrder: activity.sortOrder,
    steps: activity.steps,
    ...patch,
  };
}

function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"     className="shrink-0 text-[#7C6BC4]">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"     className="shrink-0 text-[#7C6BC4]">
      <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3v4M16 3v4M4 10h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-[#8E86B5]">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBriefcase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-[#7C6BC4]">
      <rect x="3" y="7" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 7V5h8v2M3 12h18" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconHourglass() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-[#7C6BC4]">
      <path d="M7 4h10M7 20h10M8 4c0 4 4 4 4 8s-4 4-4 8M16 4c0 4-4 4-4 8s4 4 4 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-[#7C6BC4]">
      <path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function IconEffort() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-[#7C6BC4]">
      <path d="M5 18V11M10 18V7M15 18v-5M20 18V5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-[#7C6BC4]">
      <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function FlowerMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="text-[#F49A9E]">
      <circle cx="12" cy="12" r="2.2" fill="#F6C56B" />
      <circle cx="12" cy="6.5" r="2.4" fill="currentColor" />
      <circle cx="16.8" cy="9.4" r="2.4" fill="currentColor" />
      <circle cx="15" cy="15.2" r="2.4" fill="currentColor" />
      <circle cx="9" cy="15.2" r="2.4" fill="currentColor" />
      <circle cx="7.2" cy="9.4" r="2.4" fill="currentColor" />
    </svg>
  );
}

function FlowerCluster() {
  return (
    <svg width="92" height="72" viewBox="0 0 92 72" aria-hidden="true" className="shrink-0">
      <path d="M8 58c18-6 28-22 34-40" fill="none" stroke="#C7B7E8" strokeWidth="2" />
      <path d="M28 50c10-2 18-12 22-24" fill="none" stroke="#C7B7E8" strokeWidth="2" />
      <ellipse cx="24" cy="34" rx="8" ry="4" transform="rotate(-30 24 34)" fill="#D9CEF2" />
      <ellipse cx="40" cy="24" rx="9" ry="4" transform="rotate(-18 40 24)" fill="#CDBFEA" />
      <circle cx="62" cy="28" r="3" fill="#F6C56B" />
      <ellipse cx="62" cy="16" rx="7" ry="10" fill="#F4A3A6" />
      <ellipse cx="74" cy="26" rx="10" ry="7" fill="#F7B7B4" />
      <ellipse cx="64" cy="38" rx="8" ry="10" fill="#F08A90" />
      <ellipse cx="50" cy="30" rx="10" ry="7" fill="#F7C1BE" />
    </svg>
  );
}

function shortDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  const month = date.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

const shellClass = 'flex h-12 w-full min-w-0 items-center gap-2 rounded-full border border-[#E6E0F5] bg-white px-3 text-base font-semibold text-[#1B1F5E]';

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
  const today = todayString();
  const [selectedDate, setSelectedDate] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [activityId, setActivityId] = useState('');
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(30);
  const [customDuration, setCustomDuration] = useState(false);
  const [kind, setKind] = useState<ActivityKind | ''>('');
  const [effort, setEffort] = useState<ActivityEffort | ''>('');
  const [reminder, setReminder] = useState('');
  const [notes, setNotes] = useState('');
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [clash, setClash] = useState<ScheduledActivity | null>(null);
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ScheduledActivity | null>(null);
  const onSeedAppliedRef = useRef(onSeedApplied);
  const seenSeed = useRef<number | null>(null);
  onSeedAppliedRef.current = onSeedApplied;

  const chooseDate = (date: string) => {
    setSelectedDate(date);
    setWeekAnchor(date);
    setClash(null);
    setFormError('');
  };

  const resetForm = () => {
    setActivityId('');
    setTitle('');
    setStartTime('09:00');
    setHours(0);
    setMinutes(30);
    setCustomDuration(false);
    setKind('');
    setEffort('');
    setReminder('');
    setNotes('');
    setExtrasOpen(false);
    setClash(null);
  };

  useEffect(() => {
    if (!seed || seenSeed.current === seed.token) return;
    seenSeed.current = seed.token;
    setTitle(seed.title);
    chooseDate(seed.date);
    setActivityId('');
    setFormError('');
    setFormMessage('');
    onSeedAppliedRef.current();
    window.setTimeout(() => {
      document.getElementById('agenda-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [seed]);

  const duration = hours * 60 + minutes;
  const announcement = endAnnouncement(selectedDate, startTime, duration);
  const week = weekStart(weekAnchor);
  const dayActivities = activities
    .filter((item) => item.date === selectedDate)
    .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.title.localeCompare(b.title));
  const gaps = freeGaps(activities, selectedDate);
  const plannedMinutes = dayActivities.reduce((sum, item) => sum + (clockLabel(item).duration || 0), 0);
  const summary = `${dayActivities.length} ${dayActivities.length === 1 ? 'actividad' : 'actividades'} · ${plannedMinutes > 0 ? formatDuration(plannedMinutes) : '0 h'}`;

  const editActivity = (activity: ScheduledActivity) => {
    const span = clockLabel(activity);
    setActivityId(activity.id);
    setTitle(activity.title);
    chooseDate(activity.date);
    setStartTime(activity.startTime || '09:00');
    const total = span.duration || 0;
    setHours(Math.floor(total / 60));
    setMinutes(total % 60);
    setCustomDuration(total > 0 && !QUICK_DURATIONS.some((option) => option.minutes === total));
    setKind(activity.kind || '');
    setEffort(activity.effort || '');
    setReminder(activity.reminderMinutes == null ? '' : String(activity.reminderMinutes));
    setNotes(activity.notes);
    setExtrasOpen(Boolean(activity.reminderMinutes || activity.notes));
    setFormError('');
    setFormMessage('');
    setPendingDelete(null);
    document.getElementById('agenda-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submit = async (event: React.FormEvent | null, allowOverlap = false) => {
    event?.preventDefault();
    if (saving) return;
    const resolved = resolveSchedule({
      title,
      date: selectedDate,
      startTime,
      endTime: '',
      duration: String(duration),
    });
    if (resolved.error || !resolved.end || !resolved.durationMinutes) {
      setFormError(resolved.error || 'Revisa los datos de la actividad.');
      setFormMessage('');
      return;
    }
    if (!kind) {
      setFormError('Elige el tipo de actividad.');
      setFormMessage('');
      return;
    }
    if (!effort) {
      setFormError('Elige el esfuerzo.');
      setFormMessage('');
      return;
    }
    const conflict = overlappingActivity(activities, {
      id: activityId || undefined,
      date: selectedDate,
      startTime,
      endTime: resolved.end,
      durationMinutes: resolved.durationMinutes,
    });
    if (conflict && !allowOverlap) {
      setClash(conflict);
      setFormError(`Este horario se cruza con ${conflict.title}.`);
      setFormMessage('');
      return;
    }
    const current = activities.find((item) => item.id === activityId);
    setSaving(true);
    setFormError('');
    try {
      const saved = await onSave({
        id: activityId || undefined,
        title: title.trim(),
        date: selectedDate,
        startTime,
        endTime: resolved.end,
        estimateMinutes: resolved.durationMinutes,
        reminderMinutes: reminder ? Number(reminder) : null,
        notes: notes.trim(),
        timeZone: current?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        kind,
        effort,
        importance: current?.importance,
        planStatus: current?.planStatus || 'pendiente',
        deadline: current?.deadline,
        dependsOn: current?.dependsOn,
        sortOrder: current?.sortOrder,
        steps: current?.steps,
      });
      if (!saved) throw new Error('Entra con tu cuenta para guardar la actividad.');
      resetForm();
      setFormMessage(current ? 'Cambios guardados.' : 'Actividad guardada.');
      void onRefresh().catch(() => undefined);
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la actividad.');
    } finally {
      setSaving(false);
    }
  };

  const setCompleted = async (activity: ScheduledActivity, done: boolean) => {
    if (busyId) return;
    setBusyId(activity.id);
    setFormError('');
    try {
      const saved = await onSave(toDraft(activity, { planStatus: done ? 'hecha' : 'pendiente' }));
      if (!saved) throw new Error('Entra con tu cuenta para guardar la actividad.');
      setFormMessage(done ? 'Actividad completada.' : 'Actividad marcada como pendiente.');
      void onRefresh().catch(() => undefined);
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo actualizar la actividad.');
    } finally {
      setBusyId('');
    }
  };

  const removeActivity = async (activity: ScheduledActivity) => {
    if (busyId) return;
    setBusyId(activity.id);
    setFormError('');
    try {
      await onDelete(activity);
      if (activityId === activity.id) resetForm();
      setPendingDelete(null);
      setFormMessage('Actividad eliminada.');
      void onRefresh().catch(() => undefined);
    } catch (error) {
      setFormMessage('');
      setFormError(error instanceof Error ? error.message : 'No se pudo eliminar la actividad.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden pb-4">
      <header className="flex items-start justify-between gap-2 px-1 pt-2">
        <div className="min-w-0">
          <span className="flex items-center gap-2 font-serif text-[15px] tracking-[0.18em] text-[#3A44C4]"><FlowerMark /> CYCLIA</span>
          <h1 className="m-0 text-[28px] font-extrabold leading-tight text-[#1B1F5E]">Organiza tu día</h1>
          <p className="m-0 text-base text-[#6E6896]">Un espacio para cada actividad</p>
        </div>
        <FlowerCluster />
      </header>

      <section aria-label="Selector de fecha">
        <div className="flex items-center justify-center gap-5">
          <button type="button" onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} className="flex h-10 w-10 cursor-pointer items-center justify-center text-xl font-bold text-[#8E86B5]" aria-label="Semana anterior">‹</button>
          <h2 className="m-0 text-center text-lg font-extrabold text-[#1B1F5E]">{weekTitle(week)}</h2>
          <button type="button" onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} className="flex h-10 w-10 cursor-pointer items-center justify-center text-xl font-bold text-[#8E86B5]" aria-label="Semana siguiente">›</button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {WEEKDAYS.map((label, index) => {
            const date = addDays(week, index);
            const selected = date === selectedDate;
            const number = Number(date.slice(8));
            return (
              <button
                key={date}
                type="button"
                aria-pressed={selected}
                aria-label={`${label} ${number}${date === today ? ', hoy' : ''}`}
                onClick={() => chooseDate(date)}
                className={`flex min-h-14 min-w-0 cursor-pointer flex-col items-center justify-center rounded-2xl px-0.5 font-extrabold shadow-[0_4px_12px_rgba(27,31,94,0.06)] ${selected ? 'bg-[#F27C80] text-white' : 'bg-white text-[#1B1F5E]'}`}
              >
                <span className="text-sm leading-tight">{label}</span>
                <span className="text-base leading-tight">{number}</span>
              </button>
            );
          })}
        </div>
      </section>

      <form id="agenda-form" className="flex flex-col gap-4 rounded-[24px] bg-white p-4 shadow-[0_8px_24px_rgba(27,31,94,0.08)]" onSubmit={(event) => { void submit(event); }} noValidate>
        <div className="flex items-start justify-between gap-3">
          <h2 className="m-0 text-xl font-extrabold text-[#1B1F5E]">Planifica tu actividad</h2>
          {activityId && (
            <button type="button" onClick={() => { resetForm(); setFormMessage(''); }} className="h-11 cursor-pointer rounded-full px-3 text-base font-extrabold text-[#3A44C4]">Cancelar</button>
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-[#6E6896]" htmlFor={titleId}>
          Actividad
          <span className={shellClass}>
            <IconBriefcase />
            <input id={titleId} value={title} required aria-invalid={Boolean(formError)} aria-describedby={formError ? formErrorId : undefined} onChange={(event) => setTitle(event.target.value)} placeholder="Preparar presentación" className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#1B1F5E] outline-none placeholder:font-semibold placeholder:text-[#B7B1CE]" />
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-bold text-[#6E6896]" htmlFor="agenda-date">
          Fecha
          <span className={`relative ${shellClass}`}>
            <IconCalendar />
            <span className="min-w-0 flex-1" aria-hidden="true">{shortDate(selectedDate)}</span>
            <input id="agenda-date" type="date" required value={selectedDate} aria-label="Fecha" onChange={(event) => { if (event.target.value) chooseDate(event.target.value); }} className="absolute inset-0 cursor-pointer opacity-0" />
          </span>
        </label>

        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold text-[#6E6896]" htmlFor="agenda-start">
            Hora de inicio
            <span className={shellClass}>
              <IconClock />
              <input id="agenda-start" type="time" required value={startTime} onChange={(event) => { setStartTime(event.target.value); setClash(null); setFormError(''); }} className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#1B1F5E] outline-none" />
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold text-[#6E6896]" htmlFor="agenda-duration">
            Duración
            <span className={shellClass}>
              <IconHourglass />
              <select
                id="agenda-duration"
                value={customDuration || !QUICK_DURATIONS.some((option) => option.minutes === duration) ? 'custom' : String(duration)}
                onChange={(event) => {
                  setClash(null);
                  setFormError('');
                  if (event.target.value === 'custom') {
                    setCustomDuration(true);
                    return;
                  }
                  const total = Number(event.target.value);
                  setCustomDuration(false);
                  setHours(Math.floor(total / 60));
                  setMinutes(total % 60);
                }}
                className="min-w-0 flex-1 appearance-none bg-transparent text-base font-semibold text-[#1B1F5E] outline-none"
              >
                {QUICK_DURATIONS.map((option) => <option key={option.minutes} value={option.minutes}>{option.label}</option>)}
                <option value="custom">Otra duración</option>
              </select>
              <IconChevron />
            </span>
          </label>
        </div>
        {customDuration && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1 text-sm font-bold text-[#6E6896]" htmlFor="agenda-hours">
              Horas
              <input id="agenda-hours" type="number" inputMode="numeric" min={0} max={18} value={hours} onChange={(event) => { setHours(Math.min(18, Math.max(0, Number(event.target.value) || 0))); setClash(null); setFormError(''); }} className={fieldClass} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm font-bold text-[#6E6896]" htmlFor="agenda-minutes">
              Minutos
              <input id="agenda-minutes" type="number" inputMode="numeric" min={0} max={59} value={minutes} onChange={(event) => { setMinutes(Math.min(59, Math.max(0, Number(event.target.value) || 0))); setClash(null); setFormError(''); }} className={fieldClass} />
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2" role="group" aria-label="Duraciones frecuentes">
          {QUICK_DURATIONS.map((option) => {
            const selected = !customDuration && duration === option.minutes;
            return (
              <button key={option.minutes} type="button" aria-pressed={selected} onClick={() => { setHours(Math.floor(option.minutes / 60)); setMinutes(option.minutes % 60); setCustomDuration(false); setClash(null); setFormError(''); }} className={`h-10 cursor-pointer rounded-full px-4 text-sm font-extrabold ${selected ? 'bg-[#E4D9FB] text-[#5B4D93]' : 'bg-[#F4F1FA] text-[#6E6896]'}`}>
                {selected ? '✓ ' : ''}{option.label}
              </button>
            );
          })}
        </div>

        <p className="m-0 flex items-center gap-2 rounded-full bg-[#EFE7FB] px-4 py-3 text-base font-extrabold text-[#5B4D93]" role="status"><IconClock /> {announcement}</p>

        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold text-[#6E6896]" htmlFor="agenda-kind">
            Tipo
            <span className={shellClass}>
              <IconLayers />
              <select id="agenda-kind" value={kind} onChange={(event) => setKind(event.target.value as ActivityKind | '')} className="min-w-0 flex-1 appearance-none bg-transparent text-base font-semibold text-[#1B1F5E] outline-none">
                <option value="">Elegir</option>
                {KINDS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <IconChevron />
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold text-[#6E6896]" htmlFor="agenda-effort">
            Esfuerzo
            <span className={shellClass}>
              <IconEffort />
              <select id="agenda-effort" value={effort} onChange={(event) => setEffort(event.target.value as ActivityEffort | '')} className="min-w-0 flex-1 appearance-none bg-transparent text-base font-semibold text-[#1B1F5E] outline-none">
                <option value="">Elegir</option>
                {EFFORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <IconChevron />
            </span>
          </label>
        </div>

        <details className="rounded-full border border-[#E6E0F5] bg-white px-3 py-3 open:rounded-[24px]" open={extrasOpen} onToggle={(event) => setExtrasOpen(event.currentTarget.open)}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-[#1B1F5E] [&::-webkit-details-marker]:hidden">
            <IconPencil />
            <span className="min-w-0 flex-1">Recordatorio y notas</span>
            <IconChevron />
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-base font-extrabold" htmlFor="agenda-reminder">
              Recordatorio <span className="font-semibold text-[#3B4070]">opcional. Queda guardado en la actividad.</span>
              <select id="agenda-reminder" value={reminder} onChange={(event) => setReminder(event.target.value)} className={fieldClass}>
                {REMINDERS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-base font-extrabold" htmlFor="agenda-notes">
              Notas <span className="font-semibold text-[#3B4070]">opcionales</span>
              <textarea id="agenda-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 w-full resize-none rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white p-3 text-base font-semibold text-[#1B1F5E] outline-none" />
            </label>
          </div>
        </details>

        {formError && (
          <div id={formErrorId} className="rounded-2xl bg-[#FDECEE] px-4 py-3 text-base font-bold text-[#9C3B45]" role="alert">
            <p className="m-0">{formError}</p>
            {clash && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => document.getElementById('agenda-start')?.focus()} className="h-11 cursor-pointer rounded-full bg-white px-4 font-extrabold text-[#1B1F5E]">Ajustar horario</button>
                <button type="button" disabled={saving} onClick={() => { void submit(null, true); }} className="h-11 cursor-pointer rounded-full bg-[#1B1F5E] px-4 font-extrabold text-white disabled:opacity-60">Guardar de todos modos</button>
              </div>
            )}
          </div>
        )}
        {formMessage && <p className="m-0 text-base font-extrabold text-[#1B1F5E]" role="status">{formMessage}</p>}
        <button type="submit" disabled={saving} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F27C80] text-base font-extrabold text-white disabled:opacity-60">
          {saving ? 'Guardando…' : activityId ? 'Guardar cambios' : 'Guardar actividad'}
        </button>
      </form>

      <section className="rounded-[24px] bg-white p-4 shadow-[0_8px_24px_rgba(27,31,94,0.08)]" aria-labelledby="agenda-list-heading">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="agenda-list-heading" className="m-0 text-xl font-extrabold text-[#1B1F5E]">Tu agenda</h2>
            <p className="m-0 text-sm text-[#6E6896]">{formatFriendlyDate(selectedDate)}</p>
          </div>
          <p className="m-0 shrink-0 rounded-full bg-[#F3EEFF] px-3 py-2 text-sm font-extrabold text-[#6B5CA5]">{summary}</p>
        </div>
        {loadError && <p className="m-0 mt-3 text-base text-[#9C3B45]" role="alert">{loadError}</p>}
        {storageNote && <p className="m-0 mt-3 rounded-2xl bg-[#FFF6CF] p-3 text-base text-[#1B1F5E]" role="status">{storageNote}</p>}
        {!dayActivities.length && !loadError && (
          <p className="m-0 mt-4 text-base text-[#3B4070]">Todavía no tienes actividades para este día. Agrega la primera.</p>
        )}
        <ol className="relative m-0 mt-4 list-none p-0">
          {dayActivities.length > 0 && <span className="absolute top-3 bottom-3 left-[4.35rem] w-px bg-[#E6E0F5]" aria-hidden="true" />}
          {dayActivities.map((activity, index) => {
            const clock = clockLabel(activity);
            const window = activityWindow(activity);
            const previous = index > 0 ? activityWindow(dayActivities[index - 1]) : null;
            const gapPieces = window
              ? gaps.filter((item) => item.end <= window.start && (!previous || item.start >= previous.end))
              : [];
            const kindInfo = KINDS.find((item) => item.id === activity.kind);
            const effortInfo = EFFORTS.find((item) => item.id === activity.effort);
            const done = activity.planStatus === 'hecha';
            return (
              <li key={activity.id}>
                {gapPieces.map((gap) => (
                  <p key={`${activity.id}-${gap.start}`} className="m-0 py-2 pl-[5.2rem] text-sm font-bold text-[#8B84B0]">{formatDuration(gap.end - gap.start)} disponible</p>
                ))}
                <div className="grid grid-cols-[4.2rem_minmax(0,1fr)] gap-2 py-1.5">
                  <div className="pt-3 text-sm font-extrabold leading-5 text-[#1B1F5E]">
                    <span className="block">{clock.start} –</span>
                    <span className="block">{clock.end}</span>
                  </div>
                  <div className="relative min-w-0">
                    <span className="absolute top-5 -left-[0.72rem] h-3 w-3 rounded-full border-2 border-[#C9B8E8] bg-white" aria-hidden="true" />
                    <article className={`relative ml-2 min-w-0 overflow-hidden rounded-2xl border border-[#F0ECF8] bg-white px-3 py-2.5 ${done ? 'opacity-70' : ''}`}>
                      <span className="absolute inset-y-2 left-0 w-1 rounded-full" style={{ background: kindInfo?.color || '#C9D3EF' }} aria-hidden="true" />
                      <div className="flex items-start justify-between gap-2 pl-2">
                        <div className="min-w-0">
                          <h3 className="m-0 break-words text-base font-extrabold text-[#1B1F5E]">{activity.title}</h3>
                          <p className="m-0 text-sm text-[#6E6896]">{kindInfo?.label || 'Sin tipo'} · {effortInfo?.label || 'Sin esfuerzo'}</p>
                          <p className="m-0 text-sm font-bold text-[#1B1F5E]">{clock.duration ? formatDuration(clock.duration) : clock.missing}</p>
                        </div>
                        <button type="button" aria-pressed={done} disabled={busyId === activity.id} onClick={() => { void setCompleted(activity, !done); }} aria-label={done ? `${activity.title} completada` : `Marcar ${activity.title} como completada`} className={`mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded-full border-2 disabled:opacity-60 ${done ? 'border-[#7C6BC4] bg-[#7C6BC4]' : 'border-[#D5CEE8] bg-white'}`} />
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-2 pl-2">
                        <button type="button" onClick={() => editActivity(activity)} className="h-9 cursor-pointer px-1 text-sm font-extrabold text-[#6E6896]">Editar</button>
                        <span className="text-[#E6E0F5]" aria-hidden="true">|</span>
                        <button type="button" onClick={() => setPendingDelete(activity)} className="flex h-9 w-9 cursor-pointer items-center justify-center text-[#6E6896]" aria-label={`Eliminar ${activity.title}`}>
                          <IconTrash />
                        </button>
                      </div>
                      {pendingDelete?.id === activity.id && (
                        <div className="mt-2 rounded-2xl bg-[#FDECEE] p-3" role="alertdialog" aria-label={`Eliminar ${activity.title}`}>
                          <p className="m-0 text-base font-bold text-[#1B1F5E]">¿Eliminar «{activity.title}»?</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => setPendingDelete(null)} className="h-11 cursor-pointer rounded-full bg-white px-4 text-base font-extrabold text-[#1B1F5E]">Cancelar</button>
                            <button type="button" disabled={busyId === activity.id} onClick={() => { void removeActivity(activity); }} className="h-11 cursor-pointer rounded-full bg-[#9C3B45] px-4 text-base font-extrabold text-white disabled:opacity-60">Eliminar</button>
                          </div>
                        </div>
                      )}
                    </article>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
