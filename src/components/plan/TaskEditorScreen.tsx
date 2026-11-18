import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bell, Check, ChevronDown, Plus, Repeat, X } from 'lucide-react';
import type { ActivityDraft } from '../../firebase';
import type { ActivityColor, ActivityImportance, AlertKey, DailyLog, PeriodRecord, ScheduledActivity, Subtask, UserProfile } from '../../types';
import { availableStarts, overlappingActivity, validateAssistSchedule } from '../../utils/activities';
import { analyzeCycle } from '../../utils/cycleModel';
import { formatFriendlyDate } from '../../utils/cycle';
import { authBearer } from '../../consentApi';
import { energyBandFromLog, phaseApi } from '../../plan/dayContext';
import { endClock, localDate, type EnergyBand } from '../../plan/proposal';
import { toDraft } from '../../plan/difficultDay';
import {
  ACTIVITY_COLOR_KEYS,
  ACTIVITY_COLORS,
  ALERT_KEYS,
  ALERT_OPTIONS,
  DURATION_OPTIONS,
  addAlert,
  durationLabel,
  moveSubtask,
  subtasksOf,
} from '../../plan/task';
import { AssistConversation } from './CycliaTeAsiste';
import AvailableStarts from './AvailableStarts';

const NAVY = '#153E40';
const FIELD = 'h-12 w-full rounded-2xl border-[1.5px] border-[#E7D3C6] bg-[#FFF8EE] px-3 text-base font-semibold text-[#153E40] outline-none focus:border-[#069494]';
const SECTION = 'flex flex-col gap-2 rounded-[20px] bg-[#FFF8EE] p-4';
const SECTION_TITLE = 'm-0 text-[15px] font-extrabold text-[#153E40]';

type Snapshot = {
  title: string;
  date: string;
  start: string;
  duration: number;
  color: ActivityColor | null;
  alerts: AlertKey[];
  subtasks: Subtask[];
  notes: string;
  importance: ActivityImportance | null;
  deadline: string;
};

const IMPORTANCE_OPTIONS: Array<{ id: ActivityImportance; label: string }> = [
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Media' },
  { id: 'baja', label: 'Baja' },
];

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random()}`;
}

function nowRounded(): string {
  const now = new Date();
  const minutes = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
  return endClock('00:00', Math.min(minutes, 23 * 60 + 45));
}

function Chip({ active, onClick, children, label }: { active: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className="flex h-11 min-w-[56px] cursor-pointer items-center justify-center rounded-full px-3 text-sm font-extrabold transition-colors"
      style={{ background: active ? '#FF8243' : '#F8F9FE', color: NAVY, boxShadow: active ? `inset 0 0 0 2px ${NAVY}` : 'inset 0 0 0 1.5px #E7D3C6' }}
    >
      {children}
    </button>
  );
}

/** «Nueva tarea» and «Editar tarea»: one full-screen form with vertical scroll. */
export default function TaskEditorScreen({
  mode,
  activity,
  initialDate,
  initialTitle = '',
  activities,
  profile,
  periods,
  logs,
  assistantEnabled,
  onClose,
  onSave,
  onDone,
}: {
  mode: 'crear' | 'editar';
  activity?: ScheduledActivity | null;
  initialDate: string;
  initialTitle?: string;
  activities: ScheduledActivity[];
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  assistantEnabled: boolean;
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<ScheduledActivity | undefined>;
  onDone: (date: string) => void;
}) {
  const today = localDate();
  const initial = useMemo<Snapshot>(() => {
    if (mode === 'editar' && activity) {
      const minutes = activity.estimateMinutes || 30;
      return {
        title: activity.title,
        date: activity.date,
        start: activity.startTime || nowRounded(),
        duration: minutes,
        color: activity.color ?? null,
        alerts: activity.alerts ?? [],
        subtasks: subtasksOf(activity),
        notes: activity.notes,
        importance: activity.importance,
        deadline: activity.deadline ?? '',
      };
    }
    return { title: initialTitle, date: initialDate < today ? today : initialDate, start: nowRounded(), duration: 30, color: null, alerts: [], subtasks: [], notes: '', importance: null, deadline: '' };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [form, setForm] = useState<Snapshot>(initial);
  const [customDuration, setCustomDuration] = useState(!DURATION_OPTIONS.includes(initial.duration));
  const [moreOpen, setMoreOpen] = useState(mode === 'editar');
  const [addingAlert, setAddingAlert] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [clash, setClash] = useState<ScheduledActivity | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestNote, setSuggestNote] = useState('');
  const [band, setBand] = useState<EnergyBand | null>(null);
  const [fromCyclia, setFromCyclia] = useState(mode === 'editar' && activity?.durationSource === 'cyclia');
  const savingRef = useRef(false);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'crear') titleRef.current?.focus();
  }, [mode]);

  const patch = (next: Partial<Snapshot>) => {
    setForm((current) => ({ ...current, ...next }));
    setClash(null);
    setError('');
  };
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const end = endClock(form.start, form.duration);
  // Chips stay put while she taps them; the time field covers any other hour.
  const slots = useMemo(
    () => availableStarts(activities, form.date, form.duration, { ignoreId: activity?.id }),
    [activities, form.date, form.duration, activity?.id],
  );
  const storedBand = energyBandFromLog(logs[form.date]);
  const energy = storedBand || band;

  const close = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return;
    onClose();
  };

  const validation = (): string | null => {
    if (!form.title.trim()) return 'Escribe el nombre de la actividad.';
    if (mode === 'crear') {
      const problem = validateAssistSchedule({ title: form.title, date: form.date, startTime: form.start, durationMinutes: form.duration });
      if (problem) return problem;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return 'Elige la fecha de la actividad.';
      if (!/^\d{2}:\d{2}$/.test(form.start)) return 'Indica la hora de inicio.';
      if (!(form.duration > 0) || form.duration > 18 * 60) return 'La duración debe estar entre 5 minutos y 18 horas.';
    }
    if (form.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(form.deadline)) return 'Elige una fecha límite válida o déjala vacía.';
    const scheduleChanged = mode === 'crear' || form.date !== initial.date || form.start !== initial.start || form.duration !== initial.duration;
    if (scheduleChanged && !slots.includes(form.start)) return 'Elige una hora de inicio disponible. El término se calcula con la duración y no puede cruzar otra actividad.';
    return null;
  };

  const suggest = async () => {
    if (!energy || !form.title.trim()) return;
    setSuggestBusy(true);
    setSuggestNote('');
    try {
      const view = analyzeCycle(profile, periods, form.date, logs);
      const phase = view.showPhases ? view.phase : null;
      const token = await authBearer();
      const response = await fetch('/api/plan-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: profile.name,
          actividad: form.title.trim(),
          notas: form.notes.trim() || null,
          fecha_inicio: form.date,
          hora_inicio: form.start,
          dia_ciclo: phase ? view.cycleDay : null,
          duracion_ciclo: phase ? view.averageLength : null,
          fase: phaseApi(phase),
          energia: energy,
          propuesta_anterior_min: fromCyclia ? form.duration : null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.proposal) throw new Error(typeof data.error === 'string' ? data.error : 'Cyclia no pudo sugerir una duración esta vez.');
      const minutes = Number(data.proposal.duracion_min);
      setForm((current) => {
        const nextStarts = availableStarts(activities, current.date, minutes, { ignoreId: activity?.id });
        return { ...current, duration: minutes, start: nextStarts.includes(current.start) ? current.start : '' };
      });
      setCustomDuration(!DURATION_OPTIONS.includes(minutes));
      setFromCyclia(true);
      setSuggestNote(String(data.proposal.motivo || ''));
    } catch (reason) {
      setSuggestNote(reason instanceof Error ? reason.message : 'Cyclia no pudo sugerir una duración esta vez.');
    } finally {
      setSuggestBusy(false);
    }
  };

  const save = async () => {
    if (savingRef.current) return;
    const problem = validation();
    if (problem) {
      setError(problem);
      return;
    }
    const scheduleChanged = mode === 'crear' || form.date !== initial.date || form.start !== initial.start || form.duration !== initial.duration;
    const hit = overlappingActivity(activities, { id: activity?.id, date: form.date, startTime: form.start, endTime: end, durationMinutes: form.duration });
    if (scheduleChanged && (hit || !slots.includes(form.start))) {
      setClash(hit);
      setError(hit ? `Ese horario se cruza con «${hit.title}». Elige otra hora disponible.` : 'Elige una hora de inicio disponible.');
      return;
    }
    const subtasks = form.subtasks.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => item.title);
    const fields: Partial<ActivityDraft> = {
      title: form.title.trim(),
      date: form.date,
      startTime: form.start,
      endTime: end,
      estimateMinutes: form.duration,
      notes: form.notes.trim(),
      color: form.color,
      alerts: form.alerts,
      subtasks,
      importance: form.importance,
      deadline: form.deadline || null,
      durationSource: fromCyclia ? 'cyclia' : 'manual',
    };
    const draft: ActivityDraft = mode === 'editar' && activity
      ? toDraft(activity, fields)
      : {
        title: fields.title as string,
        date: form.date,
        startTime: form.start,
        endTime: end,
        reminderMinutes: null,
        notes: fields.notes as string,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        estimateMinutes: form.duration,
        planStatus: 'pendiente',
        completedAt: null,
        steps: [],
        color: form.color,
        alerts: form.alerts,
        subtasks,
        importance: form.importance,
        deadline: form.deadline || null,
        durationSource: fromCyclia ? 'cyclia' : 'manual',
      };
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const stored = await onSave(draft);
      if (!stored) throw new Error('No se pudo guardar la actividad.');
      onDone(form.date);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad. Tus datos siguen aquí.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const addSubtask = () => {
    const title = newSubtask.trim();
    if (!title || form.subtasks.length >= 30) return;
    patch({ subtasks: [...form.subtasks, { id: newId(), title: title.slice(0, 120), done: false }] });
    setNewSubtask('');
  };
  const doneCount = form.subtasks.filter((item) => item.done).length;
  const missingAlerts = ALERT_KEYS.filter((key) => !form.alerts.includes(key));
  const heading = mode === 'crear' ? 'Nueva tarea' : 'Editar tarea';

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-[#FFE4E9]" role="dialog" aria-modal="true" aria-labelledby="editor-titulo">
      <div className="reading-column flex h-[100dvh] flex-col">
        <header className="flex items-center gap-2 bg-[#FFE4E9] px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
          <button type="button" onClick={close} aria-label="Cerrar" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#153E40]">
            <X size={24} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <h1 id="editor-titulo" className="m-0 text-[22px] font-extrabold text-[#153E40]">{heading}</h1>
        </header>

        <form
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6"
          onSubmit={(event) => { event.preventDefault(); void save(); }}
          noValidate
        >
          <label className="sr-only" htmlFor="tarea-nombre">Nombre de la actividad</label>
          <input
            id="tarea-nombre"
            ref={titleRef}
            value={form.title}
            maxLength={200}
            placeholder="Responder correo"
            onChange={(event) => patch({ title: event.target.value })}
            className="h-14 w-full rounded-[20px] border-0 bg-[#FFF8EE] px-4 text-lg font-extrabold text-[#153E40] shadow-[0_8px_24px_rgba(27,31,94,0.06)] outline-none placeholder:text-[#6E8C8E] focus:ring-2 focus:ring-[#069494]"
          />

          <section className={SECTION} aria-labelledby="cuando-titulo">
            <h2 id="cuando-titulo" className={SECTION_TITLE}>¿Cuándo?</h2>
            <input
              type="date"
              aria-label="Fecha"
              min={mode === 'crear' ? today : undefined}
              value={form.date}
              onChange={(event) => {
                const date = event.target.value;
                const nextStarts = availableStarts(activities, date, form.duration, { ignoreId: activity?.id });
                patch({ date, start: nextStarts.includes(form.start) ? form.start : '' });
              }}
              className={FIELD}
            />
            <p className="m-0 text-xs font-bold text-[#3E6466]">{form.date ? formatFriendlyDate(form.date) : '—'}</p>
          </section>

          <section className={SECTION} aria-labelledby="prioridad-titulo">
            <h2 id="prioridad-titulo" className={SECTION_TITLE}>¿Qué tan importante es?</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Importancia">
              {IMPORTANCE_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  active={form.importance === option.id}
                  onClick={() => patch({ importance: form.importance === option.id ? null : option.id })}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
            <label htmlFor="tarea-limite" className="mt-1 text-sm font-extrabold text-[#153E40]">Fecha límite (opcional)</label>
            <div className="flex items-center gap-2">
              <input
                id="tarea-limite"
                type="date"
                value={form.deadline}
                onChange={(event) => patch({ deadline: event.target.value })}
                className={`${FIELD} flex-1`}
              />
              {form.deadline && (
                <button type="button" onClick={() => patch({ deadline: '' })} className="flex h-11 shrink-0 cursor-pointer items-center px-2 text-sm font-extrabold text-[#069494]">
                  Quitar
                </button>
              )}
            </div>
            <p className="m-0 text-xs text-[#3E6466]">Cyclia usa la importancia y la fecha límite para armar tu foco de hoy.</p>
          </section>

          <section className={SECTION} aria-labelledby="duracion-titulo">
            <h2 id="duracion-titulo" className={SECTION_TITLE}>Duración</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Duración">
              {DURATION_OPTIONS.map((minutes) => (
                <Chip key={minutes} active={!customDuration && form.duration === minutes} onClick={() => {
                  setCustomDuration(false);
                  setFromCyclia(false);
                  const nextStarts = availableStarts(activities, form.date, minutes, { ignoreId: activity?.id });
                  patch({ duration: minutes, start: nextStarts.includes(form.start) ? form.start : '' });
                }}>
                  {minutes === 90 ? '1 h 30' : durationLabel(minutes)}
                </Chip>
              ))}
              <Chip active={customDuration} onClick={() => setCustomDuration(true)}>Más…</Chip>
            </div>
            {customDuration && (
              <label className="flex items-center gap-2 text-sm font-extrabold text-[#153E40]">
                <input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={1080}
                  step={5}
                  value={form.duration}
                  onChange={(event) => {
                    setFromCyclia(false);
                    const duration = Math.max(0, Math.round(Number(event.target.value) || 0));
                    const nextStarts = availableStarts(activities, form.date, duration, { ignoreId: activity?.id });
                    patch({ duration, start: nextStarts.includes(form.start) ? form.start : '' });
                  }}
                  className={`${FIELD} max-w-[120px]`}
                />
                minutos
              </label>
            )}
            <p className="m-0 text-base text-[#153E40]">Tiempo estimado: {durationLabel(form.duration || 0)}.</p>
            <AvailableStarts starts={slots} value={form.start} onChange={(start) => { setClash(null); patch({ start }); }} />
            <p className="m-0 rounded-2xl bg-[#FFF8EE] px-3 py-2 text-sm font-extrabold text-[#153E40]" aria-live="polite">
              {slots.includes(form.start) ? `${form.start}–${end} · ${durationLabel(form.duration || 0)}` : 'Elige una hora de inicio disponible. El término se calcula con el tiempo estimado.'}
            </p>
            {assistantEnabled && (
              <div className="flex flex-col gap-2">
                {!storedBand && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#3E6466]">
                    ¿Cómo está tu energía ese día?
                    {(['con_energia', 'sin_energia'] as const).map((item) => (
                      <Chip key={item} active={band === item} onClick={() => setBand(item)}>{item === 'con_energia' ? 'Con energía' : 'Sin energía'}</Chip>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!energy || !form.title.trim() || suggestBusy}
                  onClick={() => { void suggest(); }}
                  className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-[#FF8243] px-4 text-sm font-semibold text-[#153E40] disabled:opacity-50"
                >
                  {suggestBusy ? 'Cyclia está mirando el día…' : 'Sugerir duración con Cyclia'}
                </button>
                {suggestNote && <p className="m-0 text-sm text-[#245456]" role="status">{suggestNote}</p>}
              </div>
            )}
          </section>

          {clash && (
            <div className="flex flex-col gap-2 rounded-[20px] bg-[#FFF6CF] p-4" role="alert">
              <p className="m-0 text-sm font-extrabold text-[#153E40]">Ya tienes una actividad programada en este horario</p>
              <p className="m-0 text-sm text-[#245456]">«{clash.title}» · {clash.startTime}–{clash.endTime}. No se cambiará nada de esa actividad.</p>
              <button type="button" onClick={() => setClash(null)} className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-[#FFF8EE] text-sm font-extrabold text-[#069494]">Elegir otra hora</button>
            </div>
          )}

          {mode === 'crear' && (
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className="flex h-12 cursor-pointer items-center justify-between rounded-[20px] bg-[#FFF8EE] px-4 text-[15px] font-extrabold text-[#153E40]"
            >
              Más opciones
              <ChevronDown size={20} aria-hidden="true" style={{ transform: moreOpen ? 'rotate(180deg)' : 'none' }} />
            </button>
          )}

          {moreOpen && (
            <>
              <section className={SECTION} aria-labelledby="color-titulo">
                <h2 id="color-titulo" className={SECTION_TITLE}>Elegir color</h2>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1" role="radiogroup" aria-label="Color de la actividad">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.color === null}
                    aria-label="Sin color"
                    onClick={() => patch({ color: null })}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F8F9FE] text-xs font-extrabold text-[#3E6466]"
                    style={{ boxShadow: form.color === null ? `0 0 0 3px #FFFFFF, 0 0 0 5px ${NAVY}` : 'inset 0 0 0 1.5px #E7D3C6' }}
                  >
                    —
                  </button>
                  {ACTIVITY_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={form.color === key}
                      aria-label={ACTIVITY_COLORS[key].label}
                      title={ACTIVITY_COLORS[key].label}
                      onClick={() => patch({ color: key })}
                      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
                      style={{ background: ACTIVITY_COLORS[key].hex, boxShadow: form.color === key ? `0 0 0 3px #FFFFFF, 0 0 0 5px ${NAVY}` : 'none' }}
                    >
                      {form.color === key && <Check size={18} strokeWidth={3} color={key === 'amarillo' || key === 'verde' ? NAVY : '#FFFFFF'} aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </section>

              <section className={SECTION} aria-labelledby="frecuencia-titulo">
                <h2 id="frecuencia-titulo" className={`${SECTION_TITLE} flex items-center gap-2`}>
                  <Repeat size={18} aria-hidden="true" /> Frecuencia
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Chip active onClick={() => undefined}>Única vez</Chip>
                  {['Diario', 'Semanal', 'Mensual'].map((label) => (
                    <button key={label} type="button" disabled className="flex h-11 cursor-not-allowed items-center rounded-full bg-[#F8F9FE] px-3 text-sm font-extrabold text-[#6E8C8E]">
                      {label}
                    </button>
                  ))}
                </div>
                <p className="m-0 text-xs text-[#3E6466]">Repetir a diario, por semana o por mes llegará en la próxima versión.</p>
              </section>

              <section className={SECTION} aria-labelledby="alertas-titulo">
                <h2 id="alertas-titulo" className={SECTION_TITLE}>¿Necesita alertas?</h2>
                {form.alerts.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {form.alerts.map((key) => (
                      <li key={key} className="flex items-center gap-3 rounded-2xl bg-[#F8F9FE] px-3 py-2">
                        <Bell size={20} color={NAVY} aria-hidden="true" />
                        <span className="flex-1 text-sm font-bold text-[#153E40]">{ALERT_OPTIONS[key]}</span>
                        <button type="button" aria-label={`Quitar la alerta «${ALERT_OPTIONS[key]}»`} onClick={() => patch({ alerts: form.alerts.filter((item) => item !== key) })} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#3E6466]">
                          <X size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addingAlert ? (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Elige una alerta">
                    {missingAlerts.map((key) => (
                      <Chip key={key} active={false} onClick={() => { patch({ alerts: addAlert(form.alerts, key) }); setAddingAlert(false); }}>{ALERT_OPTIONS[key]}</Chip>
                    ))}
                    <button type="button" onClick={() => setAddingAlert(false)} className="flex h-11 cursor-pointer items-center px-2 text-sm font-extrabold text-[#069494]">Cancelar</button>
                  </div>
                ) : missingAlerts.length > 0 && (
                  <button type="button" onClick={() => setAddingAlert(true)} className="flex h-11 cursor-pointer items-center gap-2 self-start rounded-full px-1 text-sm font-extrabold text-[#069494]">
                    <Plus size={18} aria-hidden="true" /> Añadir una alerta
                  </button>
                )}
                <p className="m-0 text-xs text-[#3E6466]">Las alertas quedan guardadas en la tarea. Los avisos al teléfono llegarán en una próxima versión.</p>
              </section>

              <section className={SECTION} aria-labelledby="detalle-titulo">
                <h2 id="detalle-titulo" className={SECTION_TITLE}>
                  ¿Algún detalle?
                  {form.subtasks.length > 0 && <span className="ml-2 text-sm font-bold text-[#3E6466]">{doneCount}/{form.subtasks.length}</span>}
                </h2>
                {form.subtasks.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {form.subtasks.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-1 rounded-2xl bg-[#F8F9FE] py-1 pl-1 pr-1">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.done}
                          aria-label={item.done ? `Marcar «${item.title}» como pendiente` : `Completar «${item.title}»`}
                          onClick={() => patch({ subtasks: form.subtasks.map((row) => row.id === item.id ? { ...row, done: !row.done } : row) })}
                          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: item.done ? '#069494' : '#FFFFFF', boxShadow: item.done ? 'none' : 'inset 0 0 0 2px #FFD3BC' }}>
                            {item.done && <Check size={16} strokeWidth={3} color="#FFFFFF" aria-hidden="true" />}
                          </span>
                        </button>
                        <input
                          aria-label={`Subtarea ${index + 1}`}
                          value={item.title}
                          maxLength={120}
                          onChange={(event) => patch({ subtasks: form.subtasks.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row) })}
                          className={`min-w-0 flex-1 bg-transparent text-sm font-bold text-[#153E40] outline-none ${item.done ? 'line-through opacity-60' : ''}`}
                        />
                        <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => patch({ subtasks: moveSubtask(form.subtasks, item.id, -1) })} className="flex h-11 w-9 cursor-pointer items-center justify-center text-[#3E6466] disabled:opacity-30">
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Bajar" disabled={index === form.subtasks.length - 1} onClick={() => patch({ subtasks: moveSubtask(form.subtasks, item.id, 1) })} className="flex h-11 w-9 cursor-pointer items-center justify-center text-[#3E6466] disabled:opacity-30">
                          <ArrowDown size={16} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={`Eliminar la subtarea «${item.title}»`} onClick={() => patch({ subtasks: form.subtasks.filter((row) => row.id !== item.id) })} className="flex h-11 w-9 cursor-pointer items-center justify-center text-[#D4536A]">
                          <X size={18} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <input
                    aria-label="Nueva subtarea"
                    value={newSubtask}
                    maxLength={120}
                    placeholder="Escribe una subtarea"
                    onChange={(event) => setNewSubtask(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask(); } }}
                    className={`${FIELD} flex-1`}
                  />
                  <button type="button" disabled={!newSubtask.trim()} onClick={addSubtask} className="flex h-12 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-extrabold text-[#069494] disabled:opacity-40">
                    <Plus size={18} aria-hidden="true" /> Añadir subtarea
                  </button>
                </div>
              </section>

              <section className={SECTION} aria-labelledby="notas-titulo">
                <h2 id="notas-titulo" className={SECTION_TITLE}>Notas</h2>
                <textarea
                  aria-labelledby="notas-titulo"
                  value={form.notes}
                  rows={4}
                  maxLength={2000}
                  placeholder="Añadir notas, reuniones o números de teléfono"
                  onChange={(event) => patch({ notes: event.target.value })}
                  className="w-full resize-none rounded-2xl border-[1.5px] border-[#E7D3C6] bg-[#FFF8EE] px-3 py-2 text-base font-semibold text-[#153E40] outline-none focus:border-[#069494]"
                />
              </section>

              {mode === 'editar' && activity?.assistChat?.length ? <AssistConversation turns={activity.assistChat} /> : null}
            </>
          )}

          {error && <p className="m-0 rounded-2xl bg-[#FFF8EE] px-3 py-2 text-sm font-semibold text-[#D4536A]" role="alert">{error}</p>}
        </form>

        <footer className="border-t border-[#E7D3C6] bg-[#FFE4E9] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => { void save(); }}
            className="flex h-14 w-full cursor-pointer items-center justify-center rounded-full bg-[#FCE883] text-base font-extrabold text-[#153E40] shadow-[0_8px_24px_rgba(27,31,94,0.12)] disabled:opacity-60"
          >
            {saving ? 'Guardando…' : mode === 'crear' ? 'Crear tarea' : 'Actualizar tarea'}
          </button>
        </footer>
      </div>
    </div>
  );
}
