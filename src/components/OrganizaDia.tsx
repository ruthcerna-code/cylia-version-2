import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadFocus, saveFocus } from '../focus/store';
import type { ActivityDraft } from '../firebase';
import type { ActivityImportance, DailyLog, EnergyFeel, ScheduledActivity } from '../types';
import { buildDayPlan, moveInSequence, overrunMessage, suggestSteps, taskMinutes } from '../utils/dayPlan';
import { loadDaySettings, saveDaySettings } from '../utils/dayPlanStore';

const FEELS: { id: EnergyFeel; label: string; score: number }[] = [
  { id: 'baja', label: 'Baja', score: 2 },
  { id: 'estable', label: 'Estable', score: 3 },
  { id: 'radiante', label: 'Radiante', score: 5 },
  { id: 'inquieta', label: 'Inquieta', score: 3 },
];

const RANKS: { id: ActivityImportance; label: string }[] = [
  { id: 'alta', label: 'Alta' },
  { id: 'media', label: 'Media' },
  { id: 'baja', label: 'Baja' },
];

function draftFrom(activity: ScheduledActivity, patch: Partial<ActivityDraft> = {}): ActivityDraft {
  return {
    id: activity.id,
    title: activity.title,
    date: activity.date,
    startTime: activity.startTime,
    endTime: activity.endTime,
    reminderMinutes: activity.reminderMinutes,
    notes: activity.notes,
    timeZone: activity.timeZone,
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

export default function OrganizaDia({
  userId,
  date,
  activities,
  activitiesReady,
  log,
  onSave,
  onEnergy,
}: {
  userId: string;
  date: string;
  activities: ScheduledActivity[];
  activitiesReady: boolean;
  log?: DailyLog;
  onSave: (draft: ActivityDraft) => Promise<ScheduledActivity | void>;
  onEnergy: (feel: EnergyFeel, score: number) => void;
}) {
  const [available, setAvailable] = useState<number | null>(null);
  const [feel, setFeel] = useState<EnergyFeel | null>(null);
  const [title, setTitle] = useState('');
  const [more, setMore] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [estimate, setEstimate] = useState('');
  const [importance, setImportance] = useState<ActivityImportance | ''>('');
  const [dependsOn, setDependsOn] = useState('');
  const [notice, setNotice] = useState('');
  const [warning, setWarning] = useState('');
  const [overrun, setOverrun] = useState<{ message: string; postponeId: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const imported = useRef(false);
  const planRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void loadDaySettings(userId, date).then((settings) => {
      setAvailable(settings.availableMinutes);
      setFeel(settings.reportedFeel);
    });
  }, [userId, date]);

  useEffect(() => {
    if (!activitiesReady || imported.current) return;
    imported.current = true;
    void (async () => {
      const focus = await loadFocus(userId);
      const pending = focus.tasks.filter((task) => !task.example && task.status !== 'discarded' && !activities.some((item) => item.id === task.activityId || item.title === task.title));
      if (!pending.length) return;
      const tasks = [...focus.tasks];
      for (const task of pending) {
        const saved = await onSave({
          title: task.title,
          date: task.scheduledDate || date,
          startTime: '',
          endTime: '',
          reminderMinutes: null,
          notes: '',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          estimateMinutes: task.estimateMinutes,
          planStatus: task.status === 'done' ? 'hecha' : 'pendiente',
          steps: task.firstStep ? [{ action: task.firstStep, minutes: Math.min(task.estimateMinutes || 15, 15), doneWhen: 'Ese primer paso quedó hecho.' }] : [],
        });
        if (saved) {
          const index = tasks.findIndex((item) => item.id === task.id);
          if (index >= 0) tasks[index] = { ...tasks[index], activityId: saved.id };
        }
      }
      await saveFocus(userId, { ...focus, tasks });
    })();
  }, [activities, activitiesReady, date, onSave, userId]);

  const energy = log?.energy ?? (feel ? FEELS.find((item) => item.id === feel)?.score ?? null : null);
  const plan = available ? buildDayPlan(activities, date, available, energy) : null;
  const choices = activities.filter((item) => item.planStatus !== 'hecha');

  const remember = (minutes: number | null, nextFeel: EnergyFeel | null) => {
    setAvailable(minutes);
    setFeel(nextFeel);
    void saveDaySettings(userId, date, {
      availableMinutes: minutes,
      reportedEnergy: nextFeel ? FEELS.find((item) => item.id === nextFeel)?.score ?? null : log?.energy ?? null,
      reportedFeel: nextFeel,
    });
  };

  const addTask = async () => {
    if (!title.trim()) {
      setNotice('Escribe el nombre de la actividad.');
      return;
    }
    setSaving(true);
    setNotice('');
    try {
      await onSave({
        title: title.trim(),
        date,
        startTime: '',
        endTime: '',
        reminderMinutes: null,
        notes: '',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        deadline: deadline || null,
        estimateMinutes: estimate ? Number(estimate) : 30,
        importance: importance || null,
        dependsOn: dependsOn || null,
        planStatus: 'pendiente',
        steps: [],
      });
      setTitle('');
      setDeadline('');
      setEstimate('');
      setImportance('');
      setDependsOn('');
      setMore(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo guardar la actividad.');
    } finally {
      setSaving(false);
    }
  };

  const patch = async (activity: ScheduledActivity, next: Partial<ActivityDraft>) => {
    setNotice('');
    await onSave(draftFrom(activity, next));
  };

  const move = async (id: string, direction: -1 | 1) => {
    if (!plan) return;
    const result = moveInSequence(plan.sequence, id, direction, date);
    setWarning(result.warning || '');
    for (const activity of result.next) {
      const current = activities.find((item) => item.id === activity.id);
      if (current && current.sortOrder !== activity.sortOrder) await patch(current, { sortOrder: activity.sortOrder });
    }
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      <header className="flex flex-col gap-1 px-1 pt-6">
        <span className="font-serif text-[15px] tracking-[0.18em] text-[#3A44C4]">CYCLIA</span>
        <h1 className="m-0 text-[28px] font-extrabold text-[#1B1F5E]">Organiza tu día</h1>
        <p className="m-0 text-sm leading-relaxed text-[#4A4F7A]">Qué hacer ahora, qué sigue y qué puede quedar para otro momento. Un imprevisto puede cambiar el plan.</p>
      </header>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">¿Cuánto tiempo tienes para este plan?</h2>
        <div className="grid grid-cols-3 gap-2">
          {[60, 120, 180].map((minutes) => (
            <button key={minutes} type="button" onClick={() => remember(minutes, feel)} className="h-12 cursor-pointer rounded-2xl text-sm font-extrabold text-[#1B1F5E]" style={{ background: available === minutes ? '#1B1F5E' : '#F8F9FE', color: available === minutes ? '#FFFFFF' : '#1B1F5E' }}>
              {minutes / 60} h
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold">
          Otro tiempo, en minutos
          <input type="number" min={15} step={15} inputMode="numeric" value={available && ![60, 120, 180].includes(available) ? available : ''} placeholder="Ej.: 90" onChange={(event) => remember(event.target.value ? Number(event.target.value) : null, feel)} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E] outline-none" />
        </label>
        {log?.energy != null ? (
          <p className="m-0 text-sm text-[#3B4070]">Uso la energía que marcaste hoy en el registro.</p>
        ) : (
          <fieldset className="m-0 border-0 p-0">
            <legend className="p-0 text-sm font-extrabold">¿Cómo está tu energía ahora?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {FEELS.map((item) => (
                <button key={item.id} type="button" onClick={() => { remember(available, item.id); onEnergy(item.id, item.score); }} className="h-12 cursor-pointer rounded-2xl text-sm font-extrabold" style={{ background: feel === item.id ? '#1B1F5E' : '#F8F9FE', color: feel === item.id ? '#FFFFFF' : '#1B1F5E' }}>
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Agregar una actividad</h2>
        <label className="flex flex-col gap-1.5 text-sm font-extrabold">
          Nombre
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E] outline-none" />
        </label>
        <button type="button" onClick={() => setMore((current) => !current)} className="w-fit cursor-pointer text-sm font-extrabold text-[#3A44C4]">{more ? 'Ocultar datos opcionales' : 'Más datos, si quieres'}</button>
        {more && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-extrabold">
              Fecha límite, si tiene
              <input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-extrabold">
              Duración estimada, en minutos
              <input type="number" min={5} step={5} inputMode="numeric" value={estimate} placeholder="30" onChange={(event) => setEstimate(event.target.value)} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]" />
            </label>
            <fieldset className="m-0 border-0 p-0">
              <legend className="p-0 text-sm font-extrabold">Importancia</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {RANKS.map((item) => (
                  <button key={item.id} type="button" onClick={() => setImportance(item.id)} className="h-12 cursor-pointer rounded-2xl text-sm font-extrabold" style={{ background: importance === item.id ? '#1B1F5E' : '#F8F9FE', color: importance === item.id ? '#FFFFFF' : '#1B1F5E' }}>{item.label}</button>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5 text-sm font-extrabold">
              Esta tarea espera a otra
              <select value={dependsOn} onChange={(event) => setDependsOn(event.target.value)} className="h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-sm font-semibold text-[#1B1F5E]">
                <option value="">A nadie</option>
                {choices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
          </div>
        )}
        {notice && <p className="m-0 text-sm font-bold text-[#9C3B45]" role="alert">{notice}</p>}
        <button type="button" disabled={saving} onClick={() => { void addTask(); }} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E] disabled:opacity-60">{saving ? 'Guardando…' : 'Agregar'}</button>
      </section>

      <button type="button" onClick={() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E]">Armar mi plan</button>

      <section ref={planRef} className="flex flex-col gap-3">
        {!plan && <p className="m-0 rounded-[20px] bg-white p-4 text-sm text-[#3B4070]">Elige el tiempo disponible para ver qué cabe hoy.</p>}
        {plan && (
          <>
            <p className="m-0 rounded-[20px] bg-white p-4 text-sm leading-relaxed text-[#1B1F5E]">{plan.headline} Dejé {plan.bufferMinutes} minutos para pausas e imprevistos.</p>
            {plan.reason && <p className="m-0 rounded-[20px] bg-[#E7EAF8] p-4 text-sm leading-relaxed text-[#1B1F5E]">{plan.reason}</p>}
            {warning && <p className="m-0 rounded-[20px] bg-[#FFF6CF] p-4 text-sm leading-relaxed text-[#1B1F5E]" role="status">{warning}</p>}
            {plan.fixed.length > 0 && (
              <section className="rounded-[20px] bg-white p-4">
                <h2 className="m-0 text-base font-extrabold">Con hora</h2>
                <ul className="m-0 mt-2 list-none p-0">
                  {plan.fixed.map((activity) => (
                    <li key={activity.id} className="border-t border-[#E7EAF8] py-3 first:border-t-0">
                      <p className="m-0 text-sm font-extrabold text-[#3A44C4]">{activity.startTime}–{activity.endTime}</p>
                      <p className="m-0 text-[15px] font-extrabold">{activity.title}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <Lane title="Ahora" empty="Nada entra en este momento.">
              {plan.now && <TaskCard activity={plan.now.activity} step={plan.now.step} order={1} onPatch={patch} onMove={move} canUp={false} canDown={plan.sequence.length > 1} />}
            </Lane>
            <Lane title="Después" empty="Nada queda enseguida.">
              {plan.next.map((item, index) => (
                <TaskCard key={`${item.activity.id}-${item.step?.action || index}`} activity={item.activity} step={item.step} order={index + 2} onPatch={patch} onMove={move} canUp={plan.sequence.findIndex((entry) => entry.id === item.activity.id) > 0} canDown={plan.sequence.findIndex((entry) => entry.id === item.activity.id) < plan.sequence.length - 1} />
              ))}
            </Lane>
            <Lane title="Puede esperar" empty="Todo lo elegido cabe en el tiempo.">
              {plan.waiting.map((activity, index) => (
                <TaskCard key={activity.id} activity={activity} step={null} order={plan.packed.length + index + 1} onPatch={patch} onMove={move} canUp={plan.sequence.some((entry) => entry.id === activity.id) && plan.sequence.findIndex((entry) => entry.id === activity.id) > 0} canDown={plan.sequence.some((entry) => entry.id === activity.id) && plan.sequence.findIndex((entry) => entry.id === activity.id) < plan.sequence.length - 1} waiting />
              ))}
            </Lane>
            <section className="rounded-[20px] bg-white p-4">
              <h2 className="m-0 text-base font-extrabold">Si tardó más</h2>
              <p className="m-0 mt-2 text-sm text-[#3B4070]">Recalculo el tiempo que queda. Tú decides si aceptas el ajuste.</p>
              <button type="button" onClick={() => setOverrun(overrunMessage(plan.packed, plan.usableMinutes, 15))} className="mt-3 h-12 w-full cursor-pointer rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E]">Tardó 15 min más</button>
              {overrun && (
                <div className="mt-3 flex flex-col gap-2">
                  <p className="m-0 text-sm leading-relaxed text-[#1B1F5E]">{overrun.message}</p>
                  {overrun.postponeId && (
                    <button type="button" onClick={() => { const activity = activities.find((item) => item.id === overrun.postponeId); if (activity) void patch(activity, { planStatus: 'pospuesta' }); setOverrun(null); }} className="h-12 cursor-pointer rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Aceptar este ajuste</button>
                  )}
                  <button type="button" onClick={() => setOverrun(null)} className="h-12 cursor-pointer rounded-full border border-[#C9D3EF] bg-white text-[15px] font-extrabold text-[#1B1F5E]">Dejarlo como está</button>
                </div>
              )}
            </section>
          </>
        )}
      </section>
      <p className="m-0 px-1 text-[12px] leading-relaxed text-[#4A4F7A]">Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
    </div>
  );
}

function Lane({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const list = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="rounded-[20px] bg-white p-4">
      <h2 className="m-0 text-base font-extrabold">{title}</h2>
      {list.length === 0 ? <p className="m-0 mt-2 text-sm text-[#3B4070]">{empty}</p> : <div className="mt-2 flex flex-col gap-3">{children}</div>}
    </section>
  );
}

function TaskCard({
  activity,
  step,
  order,
  waiting,
  canUp,
  canDown,
  onPatch,
  onMove,
}: {
  activity: ScheduledActivity;
  step: { action: string; minutes: number; doneWhen: string } | null;
  order: number;
  waiting?: boolean;
  canUp: boolean;
  canDown: boolean;
  onPatch: (activity: ScheduledActivity, patch: Partial<ActivityDraft>) => Promise<void>;
  onMove: (id: string, direction: -1 | 1) => Promise<void>;
}) {
  const postponed = activity.planStatus === 'pospuesta';
  return (
    <article className="rounded-2xl bg-[#F8F9FE] p-3">
      <p className="m-0 text-xs font-extrabold tracking-wide text-[#3A44C4]">{order}. {waiting ? 'PUEDE ESPERAR' : activity.planStatus === 'en_curso' ? 'EN CURSO' : 'PENDIENTE'}</p>
      <h3 className="m-0 mt-1 text-[15px] font-extrabold">{activity.title}</h3>
      <p className="m-0 mt-1 text-sm text-[#3B4070]">{taskMinutes(activity)} min{activity.deadline ? ` · vence ${activity.deadline}` : ''}</p>
      {step && (
        <p className="m-0 mt-2 text-sm leading-relaxed text-[#1B1F5E]">
          {step.action} <span className="text-[#3B4070]">{step.minutes} min. Termina cuando {step.doneWhen.charAt(0).toLowerCase()}{step.doneWhen.slice(1)}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!postponed && <button type="button" onClick={() => { void onPatch(activity, { planStatus: 'en_curso' }); }} className="h-10 cursor-pointer rounded-full bg-[#F49A9E] px-3 text-sm font-extrabold text-[#1B1F5E]">Empezar</button>}
        {!postponed && <button type="button" onClick={() => { void onPatch(activity, { planStatus: 'hecha' }); }} className="h-10 cursor-pointer rounded-full bg-[#F6E27F] px-3 text-sm font-extrabold text-[#1B1F5E]">Listo</button>}
        {!postponed && <button type="button" onClick={() => { void onPatch(activity, { steps: suggestSteps(activity.title, taskMinutes(activity)) }); }} className="h-10 cursor-pointer rounded-full border border-[#C9D3EF] bg-white px-3 text-sm font-extrabold text-[#1B1F5E]">Dividir</button>}
        {!postponed && <button type="button" onClick={() => { void onPatch(activity, { planStatus: 'pospuesta' }); }} className="h-10 cursor-pointer rounded-full border border-[#C9D3EF] bg-white px-3 text-sm font-extrabold text-[#1B1F5E]">Dejar para después</button>}
        {postponed && <button type="button" onClick={() => { void onPatch(activity, { planStatus: 'pendiente' }); }} className="h-10 cursor-pointer rounded-full bg-[#F6E27F] px-3 text-sm font-extrabold text-[#1B1F5E]">Incluir de nuevo</button>}
        {canUp && <button type="button" onClick={() => { void onMove(activity.id, -1); }} className="h-10 cursor-pointer rounded-full border border-[#C9D3EF] bg-white px-3 text-sm font-extrabold text-[#1B1F5E]">Subir</button>}
        {canDown && <button type="button" onClick={() => { void onMove(activity.id, 1); }} className="h-10 cursor-pointer rounded-full border border-[#C9D3EF] bg-white px-3 text-sm font-extrabold text-[#1B1F5E]">Bajar</button>}
      </div>
    </article>
  );
}
