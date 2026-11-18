import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bell, Check, ChevronDown, Plus, Repeat, X } from 'lucide-react';
import type { ActivityDraft } from '../../firebase';
import type { ActivityColor, AlertKey, DailyLog, PeriodRecord, ScheduledActivity, Subtask, UserProfile } from '../../types';
import { overlappingActivity, validateAssistSchedule } from '../../utils/activities';
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
  endsNextDay,
  moveSubtask,
  quarterSlots,
  subtasksOf,
} from '../../plan/task';
import { AssistConversation } from './CycliaTeAsiste';

const NAVY = '#1B1F5E';
const FIELD = 'h-12 w-full rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 text-base font-semibold text-[#1B1F5E] outline-none focus:border-[#3A44C4]';
const SECTION = 'flex flex-col gap-2 rounded-[20px] bg-white p-4';
const SECTION_TITLE = 'm-0 text-[15px] font-extrabold text-[#1B1F5E]';

type Snapshot = {
  title: string;
  date: string;
  start: string;
  duration: number;
  color: ActivityColor | null;
  alerts: AlertKey[];
  subtasks: Subtask[];
  notes: string;
};

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
      style={{ background: active ? '#F49A9E' : '#F8F9FE', color: NAVY, boxShadow: active ? `inset 0 0 0 2px ${NAVY}` : 'inset 0 0 0 1.5px #C9D3EF' }}
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
      };
    }
    return { title: initialTitle, date: initialDate < today ? today : initialDate, start: nowRounded(), duration: 30, color: null, alerts: [], subtasks: [], notes: '' };
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
  const nextDay = endsNextDay(form.start, form.duration);
  // Chips stay put while she taps them; the time field covers any other hour.
  const slots = useMemo(() => quarterSlots(initial.start), [initial.start]);
  const storedBand = energyBandFromLog(logs[form.date]);
  const energy = storedBand || band;

  const close = () => {
    if (dirty && !window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')) return;
    onClose();
  };

  const validation = (): string | null => {
    if (!form.title.trim()) return 'Escribe el nombre de la actividad.';
    if (mode === 'crear') return validateAssistSchedule({ title: form.title, date: form.date, startTime: form.start, durationMinutes: form.duration });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return 'Elige la fecha de la actividad.';
    if (!/^\d{2}:\d{2}$/.test(form.start)) return 'Indica la hora de inicio.';
    if (!(form.duration > 0) || form.duration > 18 * 60) return 'La duración debe estar entre 5 minutos y 18 horas.';
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
      setForm((current) => ({ ...current, duration: minutes }));
      setCustomDuration(!DURATION_OPTIONS.includes(minutes));
      setFromCyclia(true);
      setSuggestNote(String(data.proposal.motivo || ''));
    } catch (reason) {
      setSuggestNote(reason instanceof Error ? reason.message : 'Cyclia no pudo sugerir una duración esta vez.');
    } finally {
      setSuggestBusy(false);
    }
  };

  const save = async (ignoreClash = false) => {
    if (savingRef.current) return;
    const problem = validation();
    if (problem) {
      setError(problem);
      return;
    }
    const hit = overlappingActivity(activities, { id: activity?.id, date: form.date, startTime: form.start, endTime: end, durationMinutes: form.duration });
    // When editing, warn only if she moved the time; an existing overlap she already accepted stays quiet.
    const timeChanged = form.date !== initial.date || form.start !== initial.start || form.duration !== initial.duration;
    if (hit && !ignoreClash && (mode === 'crear' || timeChanged)) {
      setClash(hit);
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
    <div className="fixed inset-0 z-[60] flex justify-center bg-[#E3F1FB]" role="dialog" aria-modal="true" aria-labelledby="editor-titulo">
      <div className="flex h-[100dvh] w-full max-w-[480px] flex-col">
        <header className="flex items-center gap-2 bg-[#E3F1FB] px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
          <button type="button" onClick={close} aria-label="Cerrar" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#1B1F5E]">
            <X size={24} strokeWidth={2.5} aria-hidden="true" />
          </button>
          <h1 id="editor-titulo" className="m-0 text-[22px] font-extrabold text-[#1B1F5E]">{heading}</h1>
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
            className="h-14 w-full rounded-[20px] border-0 bg-white px-4 text-lg font-extrabold text-[#1B1F5E] shadow-[0_8px_24px_rgba(27,31,94,0.06)] outline-none placeholder:text-[#8B90B8] focus:ring-2 focus:ring-[#3A44C4]"
          />

          <section className={SECTION} aria-labelledby="cuando-titulo">
            <h2 id="cuando-titulo" className={SECTION_TITLE}>¿Cuándo?</h2>
            <input
              type="date"
              aria-label="Fecha"
              min={mode === 'crear' ? today : undefined}
              value={form.date}
              onChange={(event) => patch({ date: event.target.value })}
              className={FIELD}
            />
            <p className="m-0 text-xs font-bold text-[#4A4F7A]">{form.date ? formatFriendlyDate(form.date) : '—'}</p>
            <p className="m-0 mt-1 text-sm font-extrabold text-[#1B1F5E]">Hora de inicio</p>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Horas rápidas">
              {slots.map((slot) => (
                <Chip key={slot} active={form.start === slot} onClick={() => patch({ start: slot })}>{slot}</Chip>
              ))}
            </div>
            <input type="time" aria-label="Otra hora" step={300} value={form.start} onChange={(event) => patch({ start: event.target.value })} className={FIELD} />
          </section>

          <section className={SECTION} aria-labelledby="duracion-titulo">
            <h2 id="duracion-titulo" className={SECTION_TITLE}>Duración</h2>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Duración">
              {DURATION_OPTIONS.map((minutes) => (
                <Chip key={minutes} active={!customDuration && form.duration === minutes} onClick={() => { setCustomDuration(false); setFromCyclia(false); patch({ duration: minutes }); }}>
                  {minutes === 90 ? '1 h 30' : durationLabel(minutes)}
                </Chip>
              ))}
              <Chip active={customDuration} onClick={() => setCustomDuration(true)}>Más…</Chip>
            </div>
            {customDuration && (
              <label className="flex items-center gap-2 text-sm font-extrabold text-[#1B1F5E]">
                <input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={1080}
                  step={5}
                  value={form.duration}
                  onChange={(event) => { setFromCyclia(false); patch({ duration: Math.max(0, Math.round(Number(event.target.value) || 0)) }); }}
                  className={`${FIELD} max-w-[120px]`}
                />
                minutos
              </label>
            )}
            <p className="m-0 rounded-2xl bg-[#F8F9FE] px-3 py-2 text-sm font-extrabold text-[#1B1F5E]" aria-live="polite">
              {form.start || '—'} – {end}{nextDay ? ' (al día siguiente)' : ''} · {durationLabel(form.duration || 0)}
            </p>
            {assistantEnabled && (
              <div className="flex flex-col gap-2">
                {!storedBand && (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#4A4F7A]">
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
                  className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-[#3A44C4] px-4 text-sm font-extrabold text-white disabled:opacity-50"
                >
                  {suggestBusy ? 'Cyclia está mirando el día…' : 'Sugerir duración con Cyclia'}
                </button>
                {suggestNote && <p className="m-0 text-sm text-[#3B4070]" role="status">{suggestNote}</p>}
              </div>
            )}
          </section>

          {clash && (
            <div className="flex flex-col gap-2 rounded-[20px] bg-[#FFF6CF] p-4" role="alert">
              <p className="m-0 text-sm font-extrabold text-[#1B1F5E]">Ya tienes una actividad programada en este horario</p>
              <p className="m-0 text-sm text-[#3B4070]">«{clash.title}» · {clash.startTime}–{clash.endTime}. No se cambiará nada de esa actividad.</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setClash(null)} className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#3A44C4]">Cambiar hora</button>
                <button type="button" onClick={() => { void save(true); }} className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-[#1B1F5E] text-sm font-extrabold text-white">Guardar igual</button>
              </div>
            </div>
          )}

          {mode === 'crear' && (
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className="flex h-12 cursor-pointer items-center justify-between rounded-[20px] bg-white px-4 text-[15px] font-extrabold text-[#1B1F5E]"
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
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F8F9FE] text-xs font-extrabold text-[#4A4F7A]"
                    style={{ boxShadow: form.color === null ? `0 0 0 3px #FFFFFF, 0 0 0 5px ${NAVY}` : 'inset 0 0 0 1.5px #C9D3EF' }}
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
                    <button key={label} type="button" disabled className="flex h-11 cursor-not-allowed items-center rounded-full bg-[#F8F9FE] px-3 text-sm font-extrabold text-[#8B90B8]">
                      {label}
                    </button>
                  ))}
                </div>
                <p className="m-0 text-xs text-[#4A4F7A]">Repetir a diario, por semana o por mes llegará en la próxima versión.</p>
              </section>

              <section className={SECTION} aria-labelledby="alertas-titulo">
                <h2 id="alertas-titulo" className={SECTION_TITLE}>¿Necesita alertas?</h2>
                {form.alerts.length > 0 && (
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {form.alerts.map((key) => (
                      <li key={key} className="flex items-center gap-3 rounded-2xl bg-[#F8F9FE] px-3 py-2">
                        <Bell size={20} color={NAVY} aria-hidden="true" />
                        <span className="flex-1 text-sm font-bold text-[#1B1F5E]">{ALERT_OPTIONS[key]}</span>
                        <button type="button" aria-label={`Quitar la alerta «${ALERT_OPTIONS[key]}»`} onClick={() => patch({ alerts: form.alerts.filter((item) => item !== key) })} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#4A4F7A]">
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
                    <button type="button" onClick={() => setAddingAlert(false)} className="flex h-11 cursor-pointer items-center px-2 text-sm font-extrabold text-[#3A44C4]">Cancelar</button>
                  </div>
                ) : missingAlerts.length > 0 && (
                  <button type="button" onClick={() => setAddingAlert(true)} className="flex h-11 cursor-pointer items-center gap-2 self-start rounded-full px-1 text-sm font-extrabold text-[#3A44C4]">
                    <Plus size={18} aria-hidden="true" /> Añadir una alerta
                  </button>
                )}
                <p className="m-0 text-xs text-[#4A4F7A]">Las alertas quedan guardadas en la tarea. Los avisos al teléfono llegarán en una próxima versión.</p>
              </section>

              <section className={SECTION} aria-labelledby="detalle-titulo">
                <h2 id="detalle-titulo" className={SECTION_TITLE}>
                  ¿Algún detalle?
                  {form.subtasks.length > 0 && <span className="ml-2 text-sm font-bold text-[#4A4F7A]">{doneCount}/{form.subtasks.length}</span>}
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
                          <span className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: item.done ? '#3A44C4' : '#FFFFFF', boxShadow: item.done ? 'none' : 'inset 0 0 0 2px #A9C4F0' }}>
                            {item.done && <Check size={16} strokeWidth={3} color="#FFFFFF" aria-hidden="true" />}
                          </span>
                        </button>
                        <input
                          aria-label={`Subtarea ${index + 1}`}
                          value={item.title}
                          maxLength={120}
                          onChange={(event) => patch({ subtasks: form.subtasks.map((row) => row.id === item.id ? { ...row, title: event.target.value } : row) })}
                          className={`min-w-0 flex-1 bg-transparent text-sm font-bold text-[#1B1F5E] outline-none ${item.done ? 'line-through opacity-60' : ''}`}
                        />
                        <button type="button" aria-label="Subir" disabled={index === 0} onClick={() => patch({ subtasks: moveSubtask(form.subtasks, item.id, -1) })} className="flex h-11 w-9 cursor-pointer items-center justify-center text-[#4A4F7A] disabled:opacity-30">
                          <ArrowUp size={16} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="Bajar" disabled={index === form.subtasks.length - 1} onClick={() => patch({ subtasks: moveSubtask(form.subtasks, item.id, 1) })} className="flex h-11 w-9 cursor-pointer items-center justify-center text-[#4A4F7A] disabled:opacity-30">
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
                  <button type="button" disabled={!newSubtask.trim()} onClick={addSubtask} className="flex h-12 shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-extrabold text-[#3A44C4] disabled:opacity-40">
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
                  className="w-full resize-none rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 py-2 text-base font-semibold text-[#1B1F5E] outline-none focus:border-[#3A44C4]"
                />
              </section>

              {mode === 'editar' && activity?.assistChat?.length ? <AssistConversation turns={activity.assistChat} /> : null}
            </>
          )}

          {error && <p className="m-0 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-[#D4536A]" role="alert">{error}</p>}
        </form>

        <footer className="border-t border-[#C9D3EF] bg-[#E3F1FB] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => { void save(); }}
            className="flex h-14 w-full cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-base font-extrabold text-[#1B1F5E] shadow-[0_8px_24px_rgba(27,31,94,0.12)] disabled:opacity-60"
          >
            {saving ? 'Guardando…' : mode === 'crear' ? 'Crear tarea' : 'Actualizar tarea'}
          </button>
        </footer>
      </div>
    </div>
  );
}
