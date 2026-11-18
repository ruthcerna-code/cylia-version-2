import React, { useEffect, useRef, useState } from 'react';
import type { ActivityDraft } from '../../firebase';
import type { AssistAnalysis } from '../../plan/assist';
import { endClock, localDate } from '../../plan/proposal';
import type { ActivityEffort, AssistChatTurn, ScheduledActivity } from '../../types';
import { availableStarts, formatDuration, overlappingActivity, suggestOpenSlot, validateAssistSchedule } from '../../utils/activities';
import AvailableStarts from './AvailableStarts';
import { formatFriendlyDate } from '../../utils/cycle';
import { authBearer } from '../../consentApi';

const FIELD = 'w-full rounded-2xl border-[1.5px] border-[#E7D3C6] bg-[#FFF8EE] px-3 py-3 text-base font-semibold text-[#153E40] outline-none';
const EFFORT_LABEL: Record<ActivityEffort, string> = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };
const GREETING = '¡Hola! Cuéntame qué actividad quieres realizar y cuánto esfuerzo crees que te tomará. Si tengo dudas sobre el alcance, te preguntaré antes de proponerla.';

type SlotSource = 'conversacion' | 'sugerido' | 'manual';

type AssistDraftState = {
  chat: AssistChatTurn[];
  result: AssistAnalysis | null;
  name: string;
  description: string;
  stepsText: string;
  effort: ActivityEffort;
  effortReason: string;
  durationValue: string;
  date: string;
  start: string;
  slotSource: SlotSource;
  localEstimate: boolean;
};

const EMPTY: AssistDraftState = {
  chat: [],
  result: null,
  name: '',
  description: '',
  stepsText: '',
  effort: 'medio',
  effortReason: '',
  durationValue: '30',
  date: '',
  start: '',
  slotSource: 'sugerido',
  localEstimate: false,
};

function draftKey(userId: string): string {
  return `cyclia_asiste_borrador_${userId}`;
}

/** The unsaved conversation stays on this device until the activity is saved or she starts over. */
function readDraft(userId: string): AssistDraftState | null {
  try {
    const raw = localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssistDraftState;
    return parsed && Array.isArray(parsed.chat) ? { ...EMPTY, ...parsed } : null;
  } catch {
    return null;
  }
}

function writeDraft(userId: string, state: AssistDraftState | null): void {
  try {
    if (!state || state.chat.length === 0) localStorage.removeItem(draftKey(userId));
    else localStorage.setItem(draftKey(userId), JSON.stringify(state));
  } catch {
    // Storage can be blocked; the conversation then lasts while the app stays open.
  }
}

function readMinutes(value: string): number | null {
  const parsed = Number(value.replace(',', '.').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function effortLine(effort: ActivityEffort, reason: string): string {
  return reason.trim() ? `Esfuerzo ${effort}: ${reason.trim()}` : '';
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

function resultMessage(analysis: AssistAnalysis): string {
  const when = analysis.fecha
    ? ` El ${formatFriendlyDate(analysis.fecha).toLocaleLowerCase('es')}${analysis.hora ? ` a las ${analysis.hora}` : ''}.`
    : analysis.hora ? ` A las ${analysis.hora}.` : '';
  return `Listo. Te propongo «${analysis.nombre}», con esfuerzo ${analysis.esfuerzo} y una duración estimada de ${formatDuration(analysis.duracion_min)}.${when} Revisa la actividad y guárdala en tu día, o escríbeme si quieres cambiar algo.`;
}

function Bubble({ turn }: { turn: Pick<AssistChatTurn, 'role' | 'text'> }) {
  const mine = turn.role === 'user';
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`m-0 max-w-[85%] whitespace-pre-wrap rounded-[20px] px-4 py-3 text-base leading-relaxed ${mine ? 'rounded-br-md bg-[#C5EBEB] text-[#153E40]' : 'rounded-bl-md bg-[#FFF8EE] text-[#153E40]'}`}
      >
        {!mine && <span className="mb-1 block text-xs font-extrabold tracking-wide text-[#069494]">CYCLIA</span>}
        {turn.text}
      </p>
    </div>
  );
}

function Panel({ title, onClose, children, headerAction }: { title: string; onClose: () => void; children: React.ReactNode; headerAction?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153E40]/45 sm:items-center" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cyclia-asiste-titulo"
        className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-[#FFE4E9] px-4 pb-6 pt-3 sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#E7D3C6]" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="cyclia-asiste-titulo" className="m-0 text-xl font-extrabold text-[#153E40]">{title}</h2>
          <div className="flex items-center gap-1">
            {headerAction}
            <button type="button" onClick={onClose} className="flex h-11 cursor-pointer items-center px-2 text-sm font-extrabold text-[#069494]">Cerrar</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AssistConversation({ turns }: { turns: AssistChatTurn[] }) {
  if (!turns.length) return null;
  return (
    <details className="rounded-[20px] bg-white/60 px-3 py-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-extrabold text-[#069494]">
        Conversación con Cyclia ({turns.length} {turns.length === 1 ? 'mensaje' : 'mensajes'})
      </summary>
      <div className="mt-2 flex flex-col gap-2 pb-2">
        {turns.map((turn, index) => <Bubble key={`${turn.at}-${index}`} turn={turn} />)}
      </div>
    </details>
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
  const [durationValue] = useState(String(activity.estimateMinutes || 30));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const minutes = readMinutes(durationValue);
  const starts = availableStarts(activities, date, minutes ?? 0, { ignoreId: activity.id });
  const sameSlot = date === activity.date && start === activity.startTime;
  const startIsFree = Boolean(minutes && (starts.includes(start) || sameSlot));
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
    if (savingRef.current || !draft || scheduleError || !startIsFree || (clash && !sameSlot)) {
      setError(scheduleError || (clash ? `Ese horario se cruza con «${clash.title}». Elige otra hora disponible.` : 'Elige una hora de inicio disponible.'));
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
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
          Nombre de la actividad
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
          Descripción
          <textarea value={description} rows={4} onChange={(event) => setDescription(event.target.value)} className={`${FIELD} resize-none`} />
        </label>
        {activity.steps.length > 0 && (
          <div className="rounded-[20px] bg-[#FFF8EE] px-4 py-3 text-sm text-[#153E40]">
            <p className="m-0 font-extrabold">Pasos</p>
            <ol className="mb-0 mt-1 list-decimal pl-5">
              {activity.steps.map((step, index) => <li key={`${step.action}-${index}`}>{step.action}</li>)}
            </ol>
          </div>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
          Fecha
          <input type="date" min={localDate()} value={date} onChange={(event) => { setDate(event.target.value); setStart(''); }} className={FIELD} />
        </label>
        <p className="m-0 text-base text-[#153E40]">Tiempo estimado: {minutes ? formatDuration(minutes) : '—'}.</p>
        <AvailableStarts starts={starts} value={start} onChange={setStart} />
        <p className="m-0 text-sm font-semibold text-[#153E40]">{startIsFree && draft ? `${start}–${draft.endTime}, según el tiempo estimado.` : 'Elige una hora de inicio disponible. El término se calcula con el tiempo estimado.'}</p>
        {clash && <p className="m-0 rounded-2xl bg-[#FFF6D8] px-3 py-3 text-sm font-semibold text-[#6E4E10]" role="status">Ese horario se cruza con «{clash.title}». Elige otra hora disponible.</p>}
        <AssistConversation turns={activity.assistChat || []} />
        {error && <p className="m-0 text-sm font-semibold text-[#153E40]" role="alert">{error}</p>}
        <button type="button" disabled={saving || !startIsFree || Boolean(clash && !sameSlot)} onClick={() => { void save(); }} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </Panel>
  );
}

export default function CycliaTeAsiste({
  open,
  userId,
  activities,
  availabilityKnown,
  assistantEnabled,
  onAuthorizeAssistant,
  onClose,
  onSave,
  onShow,
}: {
  open: boolean;
  userId: string;
  activities: ScheduledActivity[];
  availabilityKnown: boolean;
  assistantEnabled: boolean;
  onAuthorizeAssistant: () => Promise<boolean>;
  onClose: () => void;
  onSave: (draft: ActivityDraft) => Promise<ScheduledActivity | undefined>;
  onShow: (activity: ScheduledActivity, mode: 'calendar' | 'edit') => void;
}) {
  const [state, setState] = useState<AssistDraftState>(EMPTY);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ScheduledActivity | null>(null);
  const savingRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  // Opening the panel brings back the unsaved conversation, if there is one.
  useEffect(() => {
    if (!open) return;
    setState(readDraft(userId) || EMPTY);
    setInput('');
    setSending(false);
    setSaving(false);
    setError('');
    setSaved(null);
    draftIdRef.current = null;
    savingRef.current = false;
  }, [open, userId]);

  useEffect(() => {
    if (open && !saved) writeDraft(userId, state);
  }, [open, saved, state, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [state.chat.length, state.result, sending]);

  if (!open) return null;

  const patch = (next: Partial<AssistDraftState>) => setState((current) => ({ ...current, ...next }));
  const steps = state.stepsText.split('\n').map((item) => item.trim()).filter(Boolean);
  const durationMinutes = state.result?.duracion_min ?? readMinutes(state.durationValue);
  const freeStarts = state.result && state.date && durationMinutes
    ? availableStarts(activities, state.date, durationMinutes)
    : [];
  const startIsFree = Boolean(durationMinutes && freeStarts.includes(state.start));

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const turn: AssistChatTurn = { role: 'user', text: text.slice(0, 800), at: new Date().toISOString() };
    const chat = [...state.chat, turn];
    patch({ chat });
    setInput('');
    setSending(true);
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
        body: JSON.stringify({
          mensajes: chat.slice(-30).map((item) => ({ role: item.role, texto: item.text })),
          hoy: localDate(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo.');
      }
      const analysis = data.analysis as AssistAnalysis;
      const at = new Date().toISOString();
      if (analysis.necesita_datos) {
        const question = analysis.pregunta || 'Cuéntame un poco más sobre la actividad para poder estimar el trabajo.';
        setState((current) => ({ ...current, chat: [...chat, { role: 'assistant', text: question, at }] }));
        return;
      }
      setState((current) => {
        // Keep a day and time she typed by hand; otherwise use the ones from the conversation or a free slot.
        const keepManual = current.slotSource === 'manual' && current.date && current.start;
        const slot = suggestOpenSlot(activities, analysis.duracion_min, { availabilityKnown, date: analysis.fecha ?? undefined });
        const date = keepManual ? current.date : analysis.fecha ?? slot.date;
        const preferred = keepManual ? current.start : analysis.hora ?? slot.startTime;
        const free = availableStarts(activities, date, analysis.duracion_min);
        const start = free.includes(preferred) ? preferred : (free[0] || '');
        const slotSource: SlotSource = keepManual ? 'manual' : analysis.fecha || analysis.hora ? 'conversacion' : 'sugerido';
        return {
          ...current,
          chat: [...chat, { role: 'assistant', text: resultMessage(analysis), at }],
          result: analysis,
          name: analysis.nombre,
          description: analysis.descripcion,
          stepsText: analysis.pasos.join('\n'),
          effort: analysis.esfuerzo,
          effortReason: analysis.esfuerzo_motivo,
          durationValue: String(analysis.duracion_min),
          date,
          start,
          slotSource,
          localEstimate: data.fuente === 'local',
        };
      });
    } catch (reason) {
      // Her message goes back to the box so she can send it again.
      setState((current) => ({ ...current, chat: current.chat.filter((item) => item !== turn) }));
      setInput(text);
      setError(reason instanceof Error ? reason.message : 'Cyclia no pudo analizar la actividad esta vez. Puedes intentarlo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const scheduleError = state.result ? validateAssistSchedule({
    title: state.name,
    date: state.date,
    startTime: state.start,
    durationMinutes: durationMinutes ?? 0,
  }) : null;
  const preview = state.result && durationMinutes ? buildDraft({
    title: state.name,
    description: state.description,
    effort: state.effort,
    effortReason: state.effortReason,
    steps,
    date: state.date,
    startTime: state.start,
    durationMinutes,
  }) : null;
  const clash = preview ? overlappingActivity(activities, {
    date: state.date,
    startTime: state.start,
    endTime: preview.endTime,
    durationMinutes: durationMinutes ?? undefined,
  }) : null;

  const save = async () => {
    if (savingRef.current || !preview || scheduleError || !startIsFree || clash) {
      setError(scheduleError || (clash ? `Ese horario se cruza con «${clash.title}». Elige otra hora disponible.` : 'Elige una hora de inicio disponible.'));
      return;
    }
    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const stored = await onSave({ ...preview, id: draftIdRef.current, assistChat: state.chat });
      if (!stored) throw new Error('No se pudo guardar la actividad.');
      writeDraft(userId, null);
      setSaved(stored);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad. Tu conversación sigue aquí.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const startOver = () => {
    writeDraft(userId, null);
    setState(EMPTY);
    setInput('');
    setError('');
    setSaved(null);
    draftIdRef.current = null;
  };

  const slotNote = startIsFree
    ? 'El término se calcula con el tiempo estimado, a partir de la hora de inicio que elijas.'
    : 'Elige una hora de inicio disponible. El término se calcula con el tiempo estimado.';

  return (
    <Panel
      title="Cyclia te asiste"
      onClose={onClose}
      headerAction={state.chat.length > 0 && !saved ? (
        <button type="button" onClick={startOver} className="flex h-11 cursor-pointer items-center px-2 text-sm font-bold text-[#245456]">Empezar de nuevo</button>
      ) : null}
    >
      {saved ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 rounded-[20px] bg-[#FFF8EE] px-4 py-4 text-base font-extrabold text-[#153E40]" role="status">Tu actividad quedó guardada en tu día</p>
          <p className="m-0 text-sm leading-relaxed text-[#153E40]">{saved.title} · {formatFriendlyDate(saved.date)} · {saved.startTime}–{saved.endTime}</p>
          <p className="m-0 text-sm text-[#245456]">La conversación con Cyclia quedó guardada junto a la actividad. La puedes ver al revisarla.</p>
          <button type="button" onClick={() => onShow(saved, 'calendar')} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">Ver en mi día</button>
          <button type="button" onClick={() => onShow(saved, 'edit')} className="btn-emeraude flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold">Revisar o editar</button>
          <button type="button" onClick={startOver} className="flex h-11 cursor-pointer items-center justify-center text-sm font-extrabold text-[#069494]">Planificar otra actividad</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2" aria-live="polite">
            <Bubble turn={{ role: 'assistant', text: GREETING }} />
            {state.chat.map((turn, index) => <Bubble key={`${turn.at}-${index}`} turn={turn} />)}
            {sending && (
              <div className="flex justify-start">
                <p className="m-0 rounded-[20px] rounded-bl-md bg-[#FFF8EE] px-4 py-3 text-[15px] text-[#245456]" role="status">Cyclia está pensando…</p>
              </div>
            )}
          </div>

          {state.result && (
            <section aria-labelledby="asiste-actividad" className="flex flex-col gap-3 rounded-[24px] bg-[#FFF8EE] p-4">
              <h3 id="asiste-actividad" className="m-0 text-xs font-extrabold tracking-wide text-[#069494]">ACTIVIDAD PROPUESTA</h3>
              {state.localEstimate && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold leading-relaxed text-[#153E40]" role="status">La IA no está disponible, así que Cyclia armó la actividad con tu texto. Revísala antes de guardar.</p>}
              <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
                Nombre
                <input value={state.name} onChange={(event) => patch({ name: event.target.value })} className={FIELD} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
                Descripción
                <textarea value={state.description} rows={3} onChange={(event) => patch({ description: event.target.value })} className={`${FIELD} resize-none`} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
                Pasos
                <textarea value={state.stepsText} rows={4} onChange={(event) => patch({ stepsText: event.target.value })} className={`${FIELD} resize-none`} />
                <span className="font-semibold text-[#245456]">Un paso por línea.</span>
              </label>
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                <legend className="p-0 text-sm font-extrabold text-[#153E40]">Esfuerzo</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(['bajo', 'medio', 'alto'] as const).map((item) => (
                    <button key={item} type="button" aria-pressed={state.effort === item} onClick={() => patch({ effort: item })} className="flex h-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-[#E7D3C6] text-sm font-extrabold text-[#153E40]" style={{ background: state.effort === item ? '#FF8243' : '#FFFFFF' }}>
                      {EFFORT_LABEL[item]}
                    </button>
                  ))}
                </div>
                {state.effortReason && <p className="m-0 text-sm leading-relaxed text-[#245456]">{state.effortReason}</p>}
              </fieldset>
              <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#153E40]">
                Día
                <input
                  type="date"
                  min={localDate()}
                  value={state.date}
                  onChange={(event) => {
                    const date = event.target.value;
                    const nextStarts = durationMinutes ? availableStarts(activities, date, durationMinutes) : [];
                    patch({ date, start: nextStarts.includes(state.start) ? state.start : (nextStarts[0] || ''), slotSource: 'manual' });
                  }}
                  className={FIELD}
                />
              </label>
              <p className="m-0 text-base text-[#153E40]">Tiempo estimado: {formatDuration(state.result.duracion_min)}.</p>
              <AvailableStarts
                starts={freeStarts}
                value={state.start}
                onChange={(start) => patch({ start, slotSource: 'manual' })}
              />
              <p className="m-0 text-sm font-semibold text-[#153E40]">
                {state.date ? formatFriendlyDate(state.date) : '—'} · {startIsFree && preview ? `${state.start}–${preview.endTime}` : 'elige una hora disponible'}
              </p>
              <p className="m-0 text-sm text-[#3E6466]">{slotNote}</p>
              {clash && <p className="m-0 rounded-2xl bg-[#FFF6D8] px-3 py-3 text-sm font-semibold text-[#6E4E10]" role="status">Ese horario se cruza con «{clash.title}». Elige otra hora disponible.</p>}
              {scheduleError && <p className="m-0 text-sm font-semibold text-[#153E40]" role="alert">{scheduleError}</p>}
              <button type="button" disabled={saving || Boolean(scheduleError) || !preview || !startIsFree || Boolean(clash)} onClick={() => { void save(); }} className="btn-fucsia flex h-12 cursor-pointer items-center justify-center rounded-full text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar en mi día'}
              </button>
            </section>
          )}

          {error && <p className="m-0 text-sm font-semibold text-[#153E40]" role="alert">{error}</p>}

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => { event.preventDefault(); void send(); }}
          >
            <label className="sr-only" htmlFor="asiste-mensaje">Mensaje para Cyclia</label>
            <textarea
              id="asiste-mensaje"
              value={input}
              rows={2}
              maxLength={800}
              placeholder={state.result ? 'Escribe si quieres cambiar algo…' : 'Ej.: preparar la presentación del viernes a las 10, unas 2 horas'}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              className={`${FIELD} min-h-12 flex-1 resize-none`}
            />
            <button type="submit" disabled={sending || !input.trim()} className="btn-fucsia flex h-12 shrink-0 cursor-pointer items-center justify-center rounded-full px-5 text-[15px] font-extrabold disabled:cursor-not-allowed disabled:opacity-50">
              Enviar
            </button>
          </form>
          <div ref={endRef} />
        </div>
      )}
    </Panel>
  );
}
