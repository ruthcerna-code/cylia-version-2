import React, { useEffect, useRef, useState } from 'react';
import type { ActivityDraft } from '../../firebase';
import type { AssistAnalysis } from '../../plan/assist';
import { endClock, localDate } from '../../plan/proposal';
import type { ActivityEffort, ScheduledActivity } from '../../types';
import { formatDuration, overlappingActivity, suggestOpenSlot, validateAssistSchedule } from '../../utils/activities';
import { authBearer } from '../../consentApi';

const FIELD = 'w-full rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 py-3 text-base font-semibold text-[#1B1F5E] outline-none';
const EFFORT_LABEL: Record<ActivityEffort, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };

type Step = 'describe' | 'review' | 'schedule' | 'confirm' | 'saved';

function readDuration(value: string, unit: 'minutos' | 'horas'): number | null {
  const parsed = Number(value.replace(',', '.').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const minutes = unit === 'horas' ? Math.round(parsed * 60) : Math.round(parsed);
  return minutes > 0 ? minutes : null;
}

function effortLine(effort: ActivityEffort, reason: string): string {
  return reason.trim() ? `Esfuerzo ${effort}: ${reason.trim()} Esta estimación es orientativa.` : '';
}

function buildDraft(input: {
  id?: string;
  title: string;
  description: string;
  effort: ActivityEffort;
  effortReason: string;
  steps: string[];
  date: string;
  startTime: string;
  durationMinutes: number;
}): ActivityDraft {
  const steps = input.steps.map((action) => action.trim()).filter(Boolean);
  return {
    id: input.id,
    title: input.title.trim(),
    date: input.date,
    startTime: input.startTime,
    endTime: endClock(input.startTime, input.durationMinutes),
    reminderMinutes: null,
    notes: [input.description.trim(), effortLine(input.effort, input.effortReason)].filter(Boolean).join('\n\n'),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    estimateMinutes: input.durationMinutes,
    effort: input.effort,
    planStatus: 'pendiente',
    durationSource: 'cyclia',
    completedAt: null,
    steps: steps.map((action) => ({
      action,
      minutes: Math.max(5, Math.round(input.durationMinutes / Math.max(steps.length, 1))),
      doneWhen: '',
    })),
  };
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B1F5E]/45 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cyclia-asiste-titulo"
        className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-[#E3F1FB] px-4 pb-8 pt-3 sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#C9D3EF]" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="cyclia-asiste-titulo" className="m-0 text-xl font-extrabold text-[#1B1F5E]">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-11 cursor-pointer items-center px-2 text-sm font-extrabold text-[#3A44C4]">Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ActivityReviewSheet({
  activity,
  activities,
  onClose,
  onSave,
}: {
  activity: ScheduledActivity;
  activities: ScheduledActivity[];
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<ScheduledActivity | undefined>;
}) {
  const [title, setTitle] = useState(activity.title);
  const [description, setDescription] = useState(activity.notes);
  const [date, setDate] = useState(activity.date);
  const [start, setStart] = useState(activity.startTime);
  const [durationValue, setDurationValue] = useState(String(activity.estimateMinutes || 30));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const minutes = readDuration(durationValue, 'minutos');
  const scheduleError = validateAssistSchedule({
    title,
    date,
    startTime: start,
    durationMinutes: minutes ?? 0,
  });
  const draft = minutes ? buildDraft({
    id: activity.id,
    title,
    description,
    effort: activity.effort || 'medio',
    effortReason: '',
    steps: activity.steps.map((step) => step.action),
    date,
    startTime: start,
    durationMinutes: minutes,
  }) : null;
  const clash = draft ? overlappingActivity(activities, { id: activity.id, date, startTime: start, endTime: draft.endTime, durationMinutes: minutes || undefined }) : null;

  const save = async () => {
    if (savingRef.current || !draft || scheduleError) {
      setError(scheduleError || 'Revisa los datos antes de guardar.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const saved = await onSave({
        ...draft,
        planStatus: activity.planStatus,
        completedAt: activity.completedAt,
        importance: activity.importance,
        kind: activity.kind,
        deadline: activity.deadline,
        dependsOn: activity.dependsOn,
        sortOrder: activity.sortOrder,
        reminderMinutes: activity.reminderMinutes,
        durationSource: activity.durationSource,
      });
      if (!saved) throw new Error('No se pudo guardar la actividad.');
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Panel title="Revisar actividad" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
          Nombre de la actividad
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
          Descripción
          <textarea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} className={`${FIELD} resize-none`} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
          Fecha
          <input type="date" min={localDate()} value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
          Hora de inicio
          <input type="time" value={start} onChange={(event) => setStart(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
          Duración estimada (minutos)
          <input inputMode="numeric" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} className={FIELD} />
        </label>
        <p className="m-0 text-sm font-semibold text-[#1B1F5E]">Hora de término: {draft ? draft.endTime : '—'}</p>
        {clash && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold text-[#1B1F5E]" role="status">Este horario coincide con «{clash.title}».</p>}
        {error && <p className="m-0 text-sm font-semibold text-[#1B1F5E]" role="alert">{error}</p>}
        <button type="button" disabled={saving} onClick={() => { void save(); }} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </Panel>
  );
}

export default function CycliaTeAsiste({
  open,
  activities,
  availabilityKnown,
  assistantEnabled,
  onAuthorizeAssistant,
  onClose,
  onSave,
  onShow,
}: {
  open: boolean;
  activities: ScheduledActivity[];
  availabilityKnown: boolean;
  assistantEnabled: boolean;
  onAuthorizeAssistant: () => Promise<boolean>;
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<ScheduledActivity | undefined>;
  onShow: (activity: ScheduledActivity, mode: 'calendar' | 'edit') => void;
}) {
  const [step, setStep] = useState<Step>('describe');
  const [requestText, setRequestText] = useState('');
  const [question, setQuestion] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [effort, setEffort] = useState<ActivityEffort>('medio');
  const [effortReason, setEffortReason] = useState('');
  const [suggestedMinutes, setSuggestedMinutes] = useState(30);
  const [durationValue, setDurationValue] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'minutos' | 'horas'>('minutos');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [needsReview, setNeedsReview] = useState(false);
  const [timeTouched, setTimeTouched] = useState(false);
  const [scheduleReady, setScheduleReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ScheduledActivity | null>(null);
  const savingRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep('describe');
    setRequestText('');
    setQuestion('');
    setName('');
    setDescription('');
    setStepsText('');
    setEffort('medio');
    setEffortReason('');
    setSuggestedMinutes(30);
    setDurationValue('30');
    setDurationUnit('minutos');
    setDate('');
    setStart('');
    setNeedsReview(false);
    setTimeTouched(false);
    setScheduleReady(false);
    setAnalyzing(false);
    setSaving(false);
    setError('');
    setSaved(null);
    draftIdRef.current = null;
    savingRef.current = false;
  }, [open]);

  if (!open) return null;

  const steps = stepsText.split('\n').map((item) => item.trim()).filter(Boolean);
  const durationMinutes = readDuration(durationValue, durationUnit);
  const applySlot = (minutes: number, chosenDate?: string) => {
    const slot = suggestOpenSlot(activities, minutes, { availabilityKnown, date: chosenDate });
    setDate(slot.date);
    setStart(slot.startTime);
    setNeedsReview(slot.needsReview);
    setTimeTouched(false);
  };
  const goToSchedule = () => {
    const minutes = durationMinutes && durationMinutes > 0 ? durationMinutes : 30;
    if (!scheduleReady) {
      setDurationValue(String(minutes));
      setDurationUnit('minutos');
      applySlot(minutes);
      setScheduleReady(true);
    }
    setError('');
    setStep('schedule');
  };

  const analyze = async () => {
    const texto = requestText.trim();
    if (!texto) {
      setError('Escribe la actividad antes de analizar.');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      if (!assistantEnabled) {
        const allowed = await onAuthorizeAssistant();
        if (!allowed) throw new Error('No se pudo autorizar el asistente. Inténtalo de nuevo.');
      }
      const tokenValue = await authBearer();
      const response = await fetch('/api/assist-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({ texto }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo.');
      }
      const analysis = data.analysis as AssistAnalysis;
      if (analysis.necesita_datos) {
        setQuestion(analysis.pregunta || 'Cuéntame un poco más sobre la actividad para poder estimar el trabajo.');
        setStep('describe');
        return;
      }
      setQuestion('');
      setName(analysis.nombre);
      setDescription(analysis.descripcion);
      setStepsText(analysis.pasos.join('\n'));
      setEffort(analysis.esfuerzo);
      setEffortReason(analysis.esfuerzo_motivo);
      setSuggestedMinutes(analysis.duracion_min);
      if (!scheduleReady) {
        setDurationValue(String(analysis.duracion_min));
        setDurationUnit('minutos');
      }
      setStep('review');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo.');
    } finally {
      setAnalyzing(false);
    }
  };

  const scheduleError = validateAssistSchedule({
    title: name,
    date,
    startTime: start,
    durationMinutes: durationMinutes ?? 0,
  });
  const preview = durationMinutes ? buildDraft({
    title: name,
    description,
    effort,
    effortReason,
    steps,
    date,
    startTime: start,
    durationMinutes,
  }) : null;
  const clash = preview ? overlappingActivity(activities, {
    date,
    startTime: start,
    endTime: preview.endTime,
    durationMinutes,
  }) : null;

  const save = async () => {
    if (savingRef.current || !preview || scheduleError) {
      setError(scheduleError || 'Revisa los datos antes de guardar.');
      return;
    }
    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const stored = await onSave({ ...preview, id: draftIdRef.current });
      if (!stored) throw new Error('No se pudo guardar la actividad.');
      setSaved(stored);
      setStep('saved');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad. Tus datos siguen aquí.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Panel title="Cyclia te asiste" onClose={onClose}>
      {step === 'describe' && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]" htmlFor="asiste-texto">
            ¿Qué actividad quieres realizar y cuánto esfuerzo necesitas dedicarle?
            <textarea id="asiste-texto" value={requestText} rows={5} onChange={(event) => setRequestText(event.target.value)} className={`${FIELD} resize-none`} />
          </label>
          <p className="m-0 text-sm leading-relaxed text-[#1B1F5E]">Cuéntanos qué necesitas hacer. Cyclia te ayudará a definir la actividad y estimar el tiempo necesario.</p>
          {question && <p className="m-0 rounded-2xl bg-white px-3 py-3 text-sm font-semibold leading-relaxed text-[#1B1F5E]" role="status">{question}</p>}
          {error && <p className="m-0 text-sm font-semibold text-[#1B1F5E]" role="alert">{error}</p>}
          <button type="button" disabled={analyzing || !requestText.trim()} onClick={() => { void analyze(); }} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">
            {analyzing ? 'Analizando…' : 'Analizar con IA'}
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-semibold text-[#1B1F5E]">Puedes corregir el resultado. La estimación es orientativa.</p>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Descripción
            <textarea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} className={`${FIELD} resize-none`} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Pasos principales
            <textarea value={stepsText} rows={5} onChange={(event) => setStepsText(event.target.value)} className={`${FIELD} resize-none`} />
            <span className="font-semibold text-[#3B4070]">Escribe un paso por línea.</span>
          </label>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="p-0 text-sm font-extrabold text-[#1B1F5E]">Esfuerzo estimado</legend>
            <div className="grid grid-cols-3 gap-2">
              {(['bajo', 'medio', 'alto'] as const).map((item) => (
                <button key={item} type="button" aria-pressed={effort === item} onClick={() => setEffort(item)} className="flex h-11 cursor-pointer items-center justify-center rounded-full text-sm font-extrabold text-[#1B1F5E]" style={{ background: effort === item ? '#F49A9E' : '#FFFFFF' }}>
                  {EFFORT_LABEL[item]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Por qué este esfuerzo
            <textarea value={effortReason} rows={3} onChange={(event) => setEffortReason(event.target.value)} className={`${FIELD} resize-none`} />
          </label>
          <p className="m-0 text-sm text-[#1B1F5E]">Tiempo orientativo: {formatDuration(suggestedMinutes)}. Podrás ajustarlo al definir el horario.</p>
          {error && <p className="m-0 text-sm font-semibold text-[#1B1F5E]" role="alert">{error}</p>}
          <button type="button" onClick={() => { setError(''); setStep('describe'); }} className="flex h-11 cursor-pointer items-center justify-center text-sm font-extrabold text-[#3A44C4]">Volver</button>
          <button type="button" disabled={analyzing} onClick={() => { void analyze(); }} className="btn-emeraude flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">
            {analyzing ? 'Analizando…' : 'Analizar de nuevo'}
          </button>
          <button type="button" onClick={goToSchedule} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">Aceptar y definir horario</button>
        </div>
      )}

      {step === 'schedule' && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Nombre de la actividad
            <input value={name} onChange={(event) => setName(event.target.value)} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Descripción
            <textarea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} className={`${FIELD} resize-none`} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Fecha
            <input type="date" min={localDate()} value={date} onChange={(event) => { setDate(event.target.value); if (!timeTouched) applySlot(durationMinutes || 30, event.target.value); }} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Hora de inicio
            <input type="time" value={start} onChange={(event) => { setStart(event.target.value); setTimeTouched(true); setNeedsReview(false); }} className={FIELD} />
          </label>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
              Duración estimada
              <input inputMode="decimal" value={durationValue} onChange={(event) => setDurationValue(event.target.value)} className={FIELD} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
              Unidad
              <select value={durationUnit} onChange={(event) => {
                const next = event.target.value === 'horas' ? 'horas' : 'minutos';
                const minutes = readDuration(durationValue, durationUnit);
                if (minutes) setDurationValue(next === 'horas' ? String(Math.round((minutes / 60) * 100) / 100) : String(minutes));
                setDurationUnit(next);
              }} className={FIELD}>
                <option value="minutos">Minutos</option>
                <option value="horas">Horas</option>
              </select>
            </label>
          </div>
          <p className="m-0 text-sm font-semibold text-[#1B1F5E]">Hora de término: {preview ? preview.endTime : '—'}{durationMinutes && start && (parseClock(start) + durationMinutes >= 24 * 60) ? ' (al día siguiente)' : ''}</p>
          {needsReview && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold leading-relaxed text-[#1B1F5E]">El horario propuesto requiere revisión. Confirma que te sirve antes de guardarlo.</p>}
          {clash && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold text-[#1B1F5E]" role="status">Este horario coincide con «{clash.title}».</p>}
          {scheduleError && <p className="m-0 text-sm font-semibold text-[#1B1F5E]" role="alert">{scheduleError}</p>}
          <button type="button" onClick={() => setStep('review')} className="flex h-11 cursor-pointer items-center justify-center text-sm font-extrabold text-[#3A44C4]">Volver</button>
          <button type="button" disabled={Boolean(scheduleError)} onClick={() => { setError(''); setStep('confirm'); }} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">Revisar resumen</button>
        </div>
      )}

      {step === 'confirm' && preview && (
        <div className="flex flex-col gap-3">
          <div className="rounded-[20px] bg-white p-4 text-sm leading-relaxed text-[#1B1F5E]">
            <p className="m-0 font-extrabold">{preview.title}</p>
            <p className="mb-0 mt-2">{description}</p>
            <p className="mb-0 mt-2">{date} · {preview.startTime}–{preview.endTime} · {formatDuration(durationMinutes || 0)}</p>
            <p className="mb-0 mt-2">Esfuerzo {EFFORT_LABEL[effort].toLowerCase()}. {effortReason}</p>
            {steps.length > 0 && (
              <ol className="mb-0 mt-2 list-decimal pl-5">
                {steps.map((item) => <li key={item}>{item}</li>)}
              </ol>
            )}
          </div>
          <p className="m-0 text-sm text-[#1B1F5E]">La estimación es orientativa. La actividad se guarda solo cuando aceptes este resumen.</p>
          {needsReview && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold text-[#1B1F5E]">El horario propuesto requiere revisión.</p>}
          {clash && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold text-[#1B1F5E]" role="status">Este horario coincide con «{clash.title}».</p>}
          {error && <p className="m-0 text-sm font-semibold text-[#1B1F5E]" role="alert">{error}</p>}
          <button type="button" onClick={() => setStep('schedule')} className="flex h-11 cursor-pointer items-center justify-center text-sm font-extrabold text-[#3A44C4]">Volver</button>
          <button type="button" disabled={saving} onClick={() => { void save(); }} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full px-3 text-center text-[15px] font-extrabold">
            {saving ? 'Guardando…' : 'Aceptar y guardar en mi calendario'}
          </button>
        </div>
      )}

      {step === 'saved' && saved && (
        <div className="flex flex-col gap-3">
          <p className="m-0 rounded-[20px] bg-white px-4 py-4 text-base font-extrabold text-[#1B1F5E]" role="status">Tu actividad fue agregada al calendario</p>
          <p className="m-0 text-sm leading-relaxed text-[#1B1F5E]">{saved.title} · {saved.date} · {saved.startTime}–{saved.endTime}</p>
          <button type="button" onClick={() => onShow(saved, 'calendar')} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">Ver en el calendario</button>
          <button type="button" onClick={() => onShow(saved, 'edit')} className="btn-emeraude flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">Revisar o editar</button>
        </div>
      )}
    </Panel>
  );
}

function parseClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}
