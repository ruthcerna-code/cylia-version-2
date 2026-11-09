import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import { addCalendarDays, formatFriendlyDate, getCycleDay } from '../utils/cycle';
import {
  PHASE_COLOR,
  PHASE_LABEL,
  RISK_COLOR,
  applyPostpone,
  cyclesWithData,
  discoveries,
  exampleHistory,
  makeTask,
  notesForToday,
  phaseOf,
  showBodyChips,
  splitGoal,
  suggestDate,
  todayStr,
  type FocusCheckin,
  type FocusTask,
  type PostponeReason,
  type SleepLevel,
} from '../focus/logic';
import { deleteFocus, loadFocus, saveFocus, type FocusState } from '../focus/store';

const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const SLEEP: { id: SleepLevel; label: string }[] = [
  { id: 'mal', label: 'Mal' },
  { id: 'regular', label: 'Regular' },
  { id: 'bien', label: 'Bien' },
];
const SYMPTOMS = ['Cólicos', 'Cansancio', 'Dolor de cabeza', 'Ánimo bajo'];
const REASONS: { id: PostponeReason; label: string }[] = [
  { id: 'aburre', label: 'Me aburre' },
  { id: 'no_se', label: 'No sé cómo empezar' },
  { id: 'miedo', label: 'Me da miedo' },
  { id: 'sin_energia', label: 'Sin energía' },
  { id: 'imprevisto', label: 'Imprevisto' },
];

function blank(): FocusState {
  return {
    version: 1,
    consentedAt: null,
    flags: { hormonal: false, irregular: false, menopause: false },
    notifyTime: '09:00',
    notifyEnabled: true,
    ignored: 0,
    reduced: false,
    shownOn: [],
    checkins: [],
    tasks: [],
    lightened: null,
  };
}

function dictate(onText: (value: string) => void): boolean {
  const speech = window as Window & { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = speech.SpeechRecognition || speech.webkitSpeechRecognition;
  if (!Ctor) return false;
  const rec = new Ctor();
  rec.lang = 'es-CL';
  rec.onresult = (event) => onText(event.results[0][0].transcript);
  rec.start();
  return true;
}

interface SpeechRec {
  lang: string;
  start: () => void;
  onresult: (event: { results: { 0: { 0: { transcript: string } } } }) => void;
}

export function FocusMorningGate({
  userId,
  profile,
  onPeriodStart,
}: {
  userId: string;
  profile: UserProfile;
  onPeriodStart: (date: string) => Promise<void>;
}) {
  const [state, setState] = useState<FocusState | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadFocus(userId).then((next) => {
      setState(next);
      const hour = new Date().getHours();
      const done = next.checkins.some((item) => item.date === todayStr());
      setOpen(Boolean(next.consentedAt) && hour < 12 && !done);
    });
  }, [userId]);
  if (!open || !state) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#F6F1E7]/95">
      <div className="w-full max-w-[480px]">
        <Checkin
          profile={profile}
          onSkip={() => { void persist(userId, state, { ...state, checkins: [...state.checkins, { date: todayStr(), energy: 0, mood: 0, sleep: 'regular', symptoms: [], skipped: true }] }); setOpen(false); }}
          onSave={(checkin) => { void persist(userId, state, { ...state, checkins: [...state.checkins.filter((item) => item.date !== checkin.date), checkin] }); setOpen(false); }}
          onPeriod={() => { void onPeriodStart(todayStr()); }}
        />
      </div>
    </div>
  );
}

async function persist(userId: string, _current: FocusState, next: FocusState) {
  await saveFocus(userId, next);
}

export default function FocusModule({
  userId,
  profile,
  onPeriodStart,
  onSchedule,
}: {
  userId: string;
  profile: UserProfile;
  onPeriodStart: (date: string) => Promise<void>;
  onSchedule: (title: string, date: string, activityId?: string) => Promise<string>;
}) {
  const [state, setState] = useState<FocusState | null>(null);
  const [screen, setScreen] = useState<'hoy' | 'mapa' | 'crear' | 'propuesta' | 'dias' | 'meta' | 'tarjetas' | 'posponer' | 'avisos' | 'datos' | 'fases'>('hoy');
  const [draft, setDraft] = useState('');
  const [proposal, setProposal] = useState<FocusTask | null>(null);
  const [goalCards, setGoalCards] = useState<FocusTask[]>([]);
  const [active, setActive] = useState<FocusTask | null>(null);
  const [kindNote, setKindNote] = useState('');
  const [toast, setToast] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [exampleOn, setExampleOn] = useState(false);
  const [exportWarn, setExportWarn] = useState(false);
  const lightenLock = useRef(false);

  useEffect(() => {
    void loadFocus(userId).then(setState);
  }, [userId]);

  const update = (recipe: FocusState | ((current: FocusState) => FocusState)) => {
    setState((current) => {
      if (!current) return current;
      const next = typeof recipe === 'function' ? recipe(current) : recipe;
      void saveFocus(userId, next);
      return next;
    });
  };

  useEffect(() => {
    if (!state?.consentedAt || !state.notifyEnabled || state.lightened || lightenLock.current) return;
    const today = todayStr();
    const [hour, minute] = state.notifyTime.split(':').map(Number);
    const now = new Date();
    const ready = now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= (minute || 0));
    if (!ready) return;
    const sentToday = state.shownOn.filter((item) => item.startsWith(today)).length;
    const lastShown = state.shownOn.length ? state.shownOn[state.shownOn.length - 1].slice(0, 10) : null;
    const realTasks = state.tasks.filter((task) => !task.example);
    const due = notesForToday(realTasks, state.checkins, profile, state.flags, sentToday, state.reduced, lastShown)
      .some((note) => note.kind === 'lighten');
    if (!due) return;
    const tomorrow = addCalendarDays(today, 1);
    if (state.shownOn.some((item) => item.endsWith(`ligero-${tomorrow}`))) return;
    const list = realTasks.filter((task) => task.status === 'pending' && task.scheduledDate === tomorrow);
    if (list.length < 2) return;
    const moved = list[list.length - 1];
    const nextDate = addCalendarDays(tomorrow, 2);
    lightenLock.current = true;
    void onSchedule(moved.title, nextDate, moved.activityId)
      .then((activityId) => {
        update((current) => {
          if (current.lightened) return current;
          return {
            ...current,
            tasks: current.tasks.map((item) => item.id === moved.id ? { ...item, scheduledDate: nextDate, activityId } : item),
            lightened: { taskId: moved.id, previousDate: tomorrow },
          };
        });
      })
      .catch(() => { lightenLock.current = false; });
  }, [state, profile, onSchedule]);

  if (!state) return <p className="px-1 pt-6 text-sm text-[#5C564C]">Cargando tu foco…</p>;
  if (!state.consentedAt) {
    return <Consent onAccept={() => update({ ...state, consentedAt: new Date().toISOString() })} />;
  }

  const today = todayStr();
  const checkinToday = state.checkins.find((item) => item.date === today);
  const needsCheckin = !checkinToday && screen === 'hoy';
  const place = phaseOf(profile);
  const realTasks = state.tasks.filter((task) => !task.example);
  const todays = realTasks.filter((task) => task.status === 'pending' && task.scheduledDate <= today).slice(0, 3);
  const sentToday = state.shownOn.filter((item) => item.startsWith(today)).length;
  const lastShown = state.shownOn.length ? state.shownOn[state.shownOn.length - 1].slice(0, 10) : null;
  const [notifyHour, notifyMinute] = state.notifyTime.split(':').map(Number);
  const now = new Date();
  const notesReady = now.getHours() > notifyHour || (now.getHours() === notifyHour && now.getMinutes() >= (notifyMinute || 0));
  const generated = state.notifyEnabled && notesReady
    ? notesForToday(realTasks, state.checkins, profile, state.flags, sentToday, state.reduced, lastShown)
    : [];
  const lightenId = `ligero-${addCalendarDays(today, 1)}`;
  const notes = state.lightened && !state.shownOn.some((item) => item.endsWith(lightenId)) && !generated.some((note) => note.kind === 'lighten')
    ? [{ id: lightenId, kind: 'lighten' as const, text: 'Mañana sueles tener menos energía. Aligeré tu día.' }, ...generated].slice(0, 2)
    : generated;
  const example = exampleHistory(profile, today);
  const mapProfile = exampleOn ? { ...profile, lastPeriodDate: example.anchor, cycleLength: 28, periodLength: 5 } : profile;
  const mapCheckins = exampleOn ? example.checkins : state.checkins;
  const mapTasks = exampleOn ? example.tasks : realTasks;
  const found = discoveries(mapCheckins, mapTasks, mapProfile);

  const acceptTask = async (task: FocusTask) => {
    let activityId = task.activityId;
    try {
      activityId = await onSchedule(task.title, task.scheduledDate, task.activityId);
    } catch {
      setToast('La tarea quedó en Mi Foco. No pude copiarla a la agenda.');
    }
    const saved = { ...task, activityId };
    update((current) => ({ ...current, tasks: [...current.tasks.filter((item) => item.id !== task.id), saved] }));
  };

  return (
    <div className="relative -mx-4 flex min-h-full flex-col gap-3 bg-[#F6F1E7] px-4 pb-40 pt-2 text-[#1A1A1A]">
      {needsCheckin ? (
        <Checkin
          profile={profile}
          onSkip={() => update({ ...state, checkins: [...state.checkins, { date: today, energy: 0, mood: 0, sleep: 'regular', symptoms: [], skipped: true }] })}
          onSave={(checkin) => update({ ...state, checkins: [...state.checkins.filter((item) => item.date !== today), checkin] })}
          onPeriod={() => { void onPeriodStart(today); setToast('Anoté que empezó hoy. El calendario usa esta fecha.'); }}
        />
      ) : (
        <>
          {screen === 'hoy' && (
            <section className="flex flex-col gap-3">
              <p className="m-0 w-fit rounded-full px-3 py-2 text-sm font-bold text-[#1A1A1A]" style={{ background: PHASE_COLOR[place.phase] }}>
                Día {place.day} · {PHASE_LABEL[place.phase]}
              </p>
              <h1 className="m-0 font-serif text-4xl">Hoy</h1>
              {notes.map((note) => (
                <article key={note.id} className="rounded-[20px] bg-white p-4 shadow-sm">
                  <p className="m-0 text-sm leading-relaxed">{note.text}</p>
                  <div className="mt-3 flex gap-2">
                    {note.kind === 'window' && note.taskId && (
                      <button type="button" className={primary} onClick={() => {
                        const task = realTasks.find((item) => item.id === note.taskId);
                        if (!task) return;
                        const moved = { ...task, scheduledDate: addCalendarDays(today, 3) };
                        void onSchedule(moved.title, moved.scheduledDate, task.activityId).then((activityId) => {
                          update((current) => ({
                            ...current,
                            tasks: current.tasks.map((item) => item.id === task.id ? { ...moved, activityId } : item),
                            shownOn: [...current.shownOn, `${today}:${note.id}`],
                          }));
                        });
                      }}>Agendar ahí</button>
                    )}
                    {note.kind === 'lighten' && state.lightened && (
                      <button type="button" className={primary} onClick={() => {
                        const previous = state.lightened;
                        if (!previous) return;
                        const task = state.tasks.find((item) => item.id === previous.taskId);
                        update((current) => ({
                          ...current,
                          tasks: current.tasks.map((item) => item.id === previous.taskId ? { ...item, scheduledDate: previous.previousDate } : item),
                          lightened: null,
                          shownOn: [...current.shownOn, `${today}:${note.id}`],
                        }));
                        if (task?.activityId) void onSchedule(task.title, previous.previousDate, task.activityId);
                        lightenLock.current = false;
                      }}>Deshacer</button>
                    )}
                    <button type="button" className={quiet} onClick={() => {
                      const ignored = state.ignored + 1;
                      update({ ...state, ignored, reduced: ignored >= 3, shownOn: [...state.shownOn, `${today}:${note.id}`] });
                    }}>Ahora no</button>
                  </div>
                </article>
              ))}
              {toast && <p className="m-0 rounded-[16px] bg-[#F3E7C4] p-3 text-sm" role="status">{toast}</p>}
              {!todays.length && <p className="m-0 rounded-[20px] bg-white p-4 text-sm">Hoy no hay tareas. Cuando quieras, suma una con +.</p>}
              {todays.map((task) => (
                <div key={task.id}>
                  <TaskCard
                    task={task}
                    onDone={() => update({ ...state, tasks: state.tasks.map((item) => item.id === task.id ? { ...item, status: 'done' } : item) })}
                    onPostpone={() => { setActive(task); setScreen('posponer'); }}
                  />
                </div>
              ))}
            </section>
          )}
          {screen === 'mapa' && (
            <MapView
              profile={mapProfile}
              checkins={mapCheckins}
              discoveries={found}
              exampleOn={exampleOn}
              cycles={cyclesWithData(mapCheckins, mapProfile)}
              onExample={() => setExampleOn((value) => !value)}
              onNotices={() => setScreen('avisos')}
              onData={() => setScreen('datos')}
              onFlags={() => setScreen('fases')}
            />
          )}
          {screen === 'crear' && (
            <Composer
              title="Nueva tarea"
              value={draft}
              voiceNote={voiceNote}
              onChange={setDraft}
              onVoice={() => {
                const ok = dictate(setDraft);
                setVoiceNote(ok ? 'Te escucho…' : 'Este navegador no ofrece dictado. Puedes escribir la tarea.');
              }}
              onNext={() => {
                if (!draft.trim()) return;
                const task = makeTask(draft, profile, state.flags, state.checkins, realTasks);
                const suggestion = suggestDate(task.kind, profile, state.flags, state.checkins);
                setProposal(task);
                setKindNote(suggestion.note);
                setScreen('propuesta');
              }}
              onGoal={() => setScreen('meta')}
              onBack={() => setScreen('hoy')}
            />
          )}
          {screen === 'propuesta' && proposal && (
            <section className="flex flex-col gap-3">
              <button type="button" className={back} onClick={() => setScreen('crear')}>← Tarea</button>
              <h1 className="m-0 font-serif text-4xl">¿Este día?</h1>
              <article className="rounded-[20px] bg-white p-4">
                <p className="m-0 text-lg font-bold">{proposal.title}</p>
                <p className="m-0 mt-2 text-sm leading-relaxed">{kindNote}</p>
                <p className="m-0 mt-3 text-sm font-bold">{formatFriendlyDate(proposal.scheduledDate)}</p>
              </article>
              <button type="button" className={primary} onClick={() => { void acceptTask(proposal); setDraft(''); setScreen('hoy'); setToast('Quedó en tu agenda de Cyclia.'); }}>Así</button>
              <button type="button" className={quiet} onClick={() => setScreen('dias')}>Otro día</button>
            </section>
          )}
          {screen === 'dias' && proposal && (
            <section className="flex flex-col gap-3">
              <button type="button" className={back} onClick={() => setScreen('propuesta')}>← Propuesta</button>
              <h1 className="m-0 font-serif text-4xl">Elige el día</h1>
              <div className="flex flex-col gap-2">
                {Array.from({ length: 10 }, (_, index) => addCalendarDays(today, index)).map((date) => (
                  <button key={date} type="button" className={quiet} onClick={() => setProposal({ ...proposal, scheduledDate: date })}>{formatFriendlyDate(date)}</button>
                ))}
              </div>
              <button type="button" className={primary} onClick={() => { void acceptTask(proposal); setScreen('hoy'); setToast('Quedó en tu agenda de Cyclia.'); }}>Agendar este día</button>
            </section>
          )}
          {screen === 'meta' && (
            <Composer
              title="Tu meta"
              value={draft}
              voiceNote={voiceNote}
              onChange={setDraft}
              onVoice={() => setVoiceNote(dictate(setDraft) ? 'Te escucho…' : 'Este navegador no ofrece dictado. Puedes escribir la meta.')}
              onNext={() => {
                if (!draft.trim()) return;
                setGoalCards(splitGoal(draft).map((title) => makeTask(title, profile, state.flags, state.checkins, realTasks)));
                setScreen('tarjetas');
              }}
              onBack={() => setScreen('crear')}
              nextLabel="Dividir"
            />
          )}
          {screen === 'tarjetas' && (
            <GoalStack
              cards={goalCards}
              onAccept={async (task) => {
                await acceptTask(task);
                setGoalCards((current) => current.filter((item) => item.id !== task.id));
                setToast('La acepté y quedó en tu agenda de Cyclia.');
              }}
              onDiscard={(task) => setGoalCards((current) => current.filter((item) => item.id !== task.id))}
              onDone={() => { setDraft(''); setScreen('hoy'); }}
            />
          )}
          {screen === 'posponer' && active && (
            <section className="flex flex-col gap-3">
              <h1 className="m-0 font-serif text-4xl">¿Qué pasó?</h1>
              {REASONS.map((reason) => (
                <button key={reason.id} type="button" className={quiet} onClick={() => {
                  const result = applyPostpone(active, reason.id, profile, state.flags, state.checkins);
                  setToast(result.message);
                  setScreen('hoy');
                  void (async () => {
                    const scheduled: FocusTask[] = [];
                    for (const task of [result.task, ...result.extra]) {
                      try {
                        const activityId = await onSchedule(task.title, task.scheduledDate, task.activityId);
                        scheduled.push({ ...task, activityId });
                      } catch {
                        scheduled.push(task);
                      }
                    }
                    update((current) => ({
                      ...current,
                      tasks: [...current.tasks.filter((item) => item.id !== active.id && !scheduled.some((next) => next.id === item.id)), ...scheduled],
                    }));
                  })();
                }}>{reason.label}</button>
              ))}
            </section>
          )}
          {screen === 'avisos' && (
            <section className="flex flex-col gap-3">
              <button type="button" className={back} onClick={() => setScreen('mapa')}>← Mi mapa</button>
              <h1 className="m-0 font-serif text-4xl">Avisos</h1>
              <p className="m-0 text-sm leading-relaxed">Como máximo dos al día, dentro de Cyclia. No aparecen en la pantalla bloqueada.</p>
              <label className="text-sm font-bold">Horario
                <input type="time" value={state.notifyTime} onChange={(event) => update({ ...state, notifyTime: event.target.value })} className="mt-1 h-12 w-full rounded-2xl border border-[#E4D8C4] bg-white px-3" />
              </label>
              <button type="button" className={primary} onClick={() => update({ ...state, notifyEnabled: !state.notifyEnabled })}>{state.notifyEnabled ? 'Pausar avisos' : 'Activar avisos'}</button>
              {state.reduced && <p className="m-0 text-sm">Bajé la frecuencia porque varios avisos quedaron sin respuesta.</p>}
            </section>
          )}
          {screen === 'datos' && (
            <section className="flex flex-col gap-3">
              <button type="button" className={back} onClick={() => setScreen('mapa')}>← Mi mapa</button>
              <h1 className="m-0 font-serif text-4xl">Tus datos de foco</h1>
              <p className="m-0 text-sm leading-relaxed">La energía, el ánimo y el sueño son datos de salud. Puedes llevártelos o borrarlos.</p>
              {exportWarn && <p className="m-0 rounded-[16px] bg-[#F3E7C4] p-3 text-sm">Este archivo contiene información personal y de salud. Guárdalo en un lugar de confianza.</p>}
              <button type="button" className={quiet} onClick={() => {
                if (!exportWarn) { setExportWarn(true); return; }
                const blob = new Blob([JSON.stringify({ formatVersion: 1, exportedAt: new Date().toISOString(), focus: state }, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `cyclia-foco-${today}.json`;
                link.click();
                URL.revokeObjectURL(url);
              }}>Exportar mis datos de foco</button>
              <button type="button" className={quiet} onClick={() => {
                if (!window.confirm('¿Borrar los datos de Mi Foco de esta cuenta? El resto de Cyclia sigue igual.')) return;
                void deleteFocus(userId).then(() => setState(blank()));
              }}>Borrar datos de Mi Foco</button>
            </section>
          )}
          {screen === 'fases' && (
            <section className="flex flex-col gap-3">
              <button type="button" className={back} onClick={() => setScreen('mapa')}>← Mi mapa</button>
              <h1 className="m-0 font-serif text-4xl">Sin fases</h1>
              <p className="m-0 text-sm leading-relaxed">Si marcas alguna, las propuestas usan solo tu energía registrada.</p>
              {([
                ['hormonal', 'Uso anticonceptivos hormonales'],
                ['irregular', 'Mis ciclos son irregulares'],
                ['menopause', 'Estoy en menopausia'],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" className={quiet} onClick={() => update({ ...state, flags: { ...state.flags, [id]: !state.flags[id] } })}>
                  {state.flags[id] ? '✓ ' : ''}{label}
                </button>
              ))}
            </section>
          )}
        </>
      )}
      {!needsCheckin && (screen === 'hoy' || screen === 'mapa') && (
        <>
          <button type="button" aria-label="Crear tarea" onClick={() => { setDraft(''); setScreen('crear'); }} className="fixed bottom-[168px] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#1A1A1A] text-2xl text-white" style={{ left: 'min(calc(50vw + 240px - 72px), calc(100vw - 72px))' }}>+</button>
          <div className="fixed bottom-[96px] left-1/2 z-30 grid w-full max-w-[480px] -translate-x-1/2 grid-cols-2 gap-2 bg-[#F6F1E7] px-4 py-2">
            <button type="button" className={screen === 'hoy' ? primary : quiet} onClick={() => setScreen('hoy')}>Hoy</button>
            <button type="button" className={screen === 'mapa' ? primary : quiet} onClick={() => setScreen('mapa')}>Mi mapa</button>
          </div>
        </>
      )}
    </div>
  );
}

const primary = 'flex min-h-12 w-full items-center justify-center rounded-full bg-[#1A1A1A] px-4 text-base font-bold text-white';
const quiet = 'flex min-h-12 w-full items-center justify-center rounded-full bg-white px-4 text-base font-bold text-[#1A1A1A]';
const back = 'w-fit text-sm font-bold';

function Consent({ onAccept }: { onAccept: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <section className="flex flex-col gap-3 pt-4">
      <h1 className="m-0 font-serif text-4xl">Mi Foco</h1>
      <p className="m-0 text-sm leading-relaxed">Para proponerte tareas según tu energía, Cyclia guarda el check-in de energía, ánimo y sueño. Son datos de salud. Puedes seguir usando el resto de Cyclia sin activarlo.</p>
      <label className="flex items-start gap-3 rounded-[20px] bg-white p-4 text-sm leading-relaxed">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        Acepto que Mi Foco guarde estos datos para aprender mi patrón. Puedo exportarlos o borrarlos cuando quiera.
      </label>
      <button type="button" disabled={!checked} className={`${primary} disabled:opacity-40`} onClick={onAccept}>Activar Mi Foco</button>
    </section>
  );
}

function Checkin({
  profile,
  onSkip,
  onSave,
  onPeriod,
}: {
  profile: UserProfile;
  onSkip: () => void;
  onSave: (checkin: FocusCheckin) => void;
  onPeriod: () => void;
}) {
  const [energy, setEnergy] = useState(0);
  const [mood, setMood] = useState(0);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const body = showBodyChips(profile);
  const finish = (sleep: SleepLevel) => {
    if (!energy || !mood) return;
    onSave({ date: todayStr(), energy, mood, sleep, symptoms, skipped: false });
  };
  return (
    <section className="flex min-h-[70vh] flex-col justify-end gap-3 pb-2">
      <button type="button" className="w-fit text-sm font-bold" onClick={onSkip}>Saltar</button>
      <h1 className="m-0 font-serif text-4xl">¿Cómo amaneciste?</h1>
      <div className="grid grid-cols-5 gap-2" aria-label="Energía">
        {[1, 2, 3, 4, 5].map((value) => (
          <button key={value} type="button" aria-label={`Energía ${value}`} onClick={() => setEnergy(value)} className="min-h-12 rounded-2xl text-lg font-bold" style={{ background: energy === value ? '#1A1A1A' : '#FFFFFF', color: energy === value ? '#FFFFFF' : '#1A1A1A' }}>{value}</button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2" aria-label="Ánimo">
        {MOODS.map((emoji, index) => (
          <button key={emoji} type="button" aria-label={`Ánimo ${index + 1}`} onClick={() => setMood(index + 1)} className="min-h-12 rounded-2xl text-2xl" style={{ background: mood === index + 1 ? '#1A1A1A' : '#FFFFFF' }}>{emoji}</button>
        ))}
      </div>
      {body && (
        <div className="flex flex-wrap gap-2">
          {SYMPTOMS.map((symptom) => (
            <button key={symptom} type="button" onClick={() => setSymptoms((current) => current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom])} className="min-h-12 rounded-full bg-white px-3 text-sm font-bold">{symptoms.includes(symptom) ? '✓ ' : ''}{symptom}</button>
          ))}
        </div>
      )}
      {body && <button type="button" className={primary} onClick={onPeriod}>Me llegó</button>}
      <div className="grid grid-cols-3 gap-2">
        {SLEEP.map((item) => (
          <button key={item.id} type="button" disabled={!energy || !mood} onClick={() => finish(item.id)} className={`${quiet} disabled:opacity-40`}>{item.label}</button>
        ))}
      </div>
    </section>
  );
}

function TaskCard({ task, onDone, onPostpone }: { task: FocusTask; onDone: () => void; onPostpone: () => void }) {
  const [drag, setDrag] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  return (
    <article
      className="rounded-[20px] bg-white p-4 shadow-sm"
      style={{ transform: `translateX(${drag}px)` }}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setStart(event.clientX); }}
      onPointerMove={(event) => { if (start != null) setDrag(event.clientX - start); }}
      onPointerUp={() => {
        if (drag > 80) onDone();
        else if (drag < -80) onPostpone();
        setDrag(0);
        setStart(null);
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: RISK_COLOR[task.risk] }} aria-label={task.risk === 'green' ? 'Puedes empezar directo' : 'Conviene un primer paso corto'} />
        <div className="flex-1">
          <h2 className="m-0 text-lg font-bold">{task.title}</h2>
          {task.firstStep && <p className="m-0 mt-1 text-sm leading-relaxed">{task.firstStep}</p>}
          {started && <p className="m-0 mt-2 text-sm">Cinco minutos. Solo eso.</p>}
        </div>
      </div>
      <button type="button" className={`${primary} mt-3`} onClick={() => setStarted(true)}>Empezar 5 min</button>
    </article>
  );
}

function Composer({
  title,
  value,
  voiceNote,
  onChange,
  onVoice,
  onNext,
  onBack,
  onGoal,
  nextLabel = 'Listo',
}: {
  title: string;
  value: string;
  voiceNote: string;
  onChange: (value: string) => void;
  onVoice: () => void;
  onNext: () => void;
  onBack: () => void;
  onGoal?: () => void;
  nextLabel?: string;
}) {
  return (
    <section className="flex min-h-[70vh] flex-col justify-end gap-3">
      <button type="button" className={back} onClick={onBack}>← Volver</button>
      <h1 className="m-0 font-serif text-4xl">{title}</h1>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="preparar informe para el viernes" className="min-h-12 rounded-2xl border border-[#E4D8C4] bg-white px-3 text-base" />
      {voiceNote && <p className="m-0 text-sm">{voiceNote}</p>}
      <button type="button" className={quiet} onClick={onVoice}>Dictar</button>
      {onGoal && <button type="button" className={quiet} onClick={onGoal}>Tengo una meta</button>}
      <button type="button" className={primary} onClick={onNext}>{nextLabel}</button>
    </section>
  );
}

function GoalStack({
  cards,
  onAccept,
  onDiscard,
  onDone,
}: {
  cards: FocusTask[];
  onAccept: (task: FocusTask) => void;
  onDiscard: (task: FocusTask) => void;
  onDone: () => void;
}) {
  const [drag, setDrag] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const current = cards[0];
  if (!current) {
    return (
      <section className="flex flex-col gap-3">
        <h1 className="m-0 font-serif text-4xl">Listo</h1>
        <p className="m-0 text-sm">Lo que aceptaste ya está en tu agenda de Cyclia.</p>
        <button type="button" className={primary} onClick={onDone}>Volver a hoy</button>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <h1 className="m-0 font-serif text-4xl">Tu meta, en partes</h1>
      <p className="m-0 text-sm">Desliza a la derecha para aceptar y a la izquierda para descartar.</p>
      <article
        className="rounded-[20px] bg-white p-5 shadow-sm"
        style={{ transform: `translateX(${drag}px)` }}
        onPointerDown={(event) => setStart(event.clientX)}
        onPointerMove={(event) => { if (start != null) setDrag(event.clientX - start); }}
        onPointerUp={() => {
          if (drag > 80) onAccept(current);
          else if (drag < -80) onDiscard(current);
          setDrag(0);
          setStart(null);
        }}
      >
        <h2 className="m-0 font-serif text-3xl">{current.title}</h2>
        <p className="m-0 mt-2 text-sm">{formatFriendlyDate(current.scheduledDate)}</p>
      </article>
      <button type="button" className={primary} onClick={() => onAccept(current)}>Aceptar</button>
      <button type="button" className={quiet} onClick={() => onDiscard(current)}>Descartar</button>
    </section>
  );
}

function MapView({
  profile,
  checkins,
  discoveries: found,
  exampleOn,
  cycles,
  onExample,
  onNotices,
  onData,
  onFlags,
}: {
  profile: UserProfile;
  checkins: FocusCheckin[];
  discoveries: { title: string; detail: string; cycles: number }[];
  exampleOn: boolean;
  cycles: number;
  onExample: () => void;
  onNotices: () => void;
  onData: () => void;
  onFlags: () => void;
}) {
  const byDay = new Map<number, number>();
  checkins.filter((item) => !item.skipped).forEach((item) => {
    byDay.set(getCycleDay(item.date, profile.lastPeriodDate, profile.cycleLength), item.energy);
  });
  const size = 220;
  const radius = 86;
  const center = size / 2;
  return (
    <section className="flex flex-col gap-3">
      <h1 className="m-0 font-serif text-4xl">Mi mapa</h1>
      {exampleOn && <p className="m-0 rounded-[16px] bg-[#F3E7C4] p-3 text-sm">Ejemplo de 3 ciclos. No son tus registros.</p>}
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-56 w-56" aria-label="Energía a lo largo del ciclo">
        {Array.from({ length: profile.cycleLength }, (_, index) => {
          const day = index + 1;
          const angle = (day / profile.cycleLength) * Math.PI * 2 - Math.PI / 2;
          const energy = byDay.get(day) ?? 0;
          const color = energy >= 4 ? '#7DAF8A' : energy === 3 ? '#E6C85A' : energy > 0 ? '#E8899A' : '#E4D8C4';
          return <circle key={day} cx={center + Math.cos(angle) * radius} cy={center + Math.sin(angle) * radius} r={energy ? 7 : 4} fill={color} />;
        })}
      </svg>
      <p className="m-0 text-center text-xs">Verde: más energía. Amarillo: media. Rosa: más baja.</p>
      {found.map((item) => (
        <article key={item.title} className="rounded-[20px] bg-white p-4">
          <h2 className="m-0 text-base font-bold">🔓 {item.title}</h2>
          <p className="m-0 mt-1 text-sm leading-relaxed">{item.detail}</p>
          <p className="m-0 mt-2 text-xs">Respaldado por {item.cycles} ciclos.</p>
        </article>
      ))}
      {!found.length && <p className="m-0 text-sm">Los descubrimientos aparecen cuando hay más de un ciclo registrado. Puedes mirar un ejemplo.</p>}
      <p className="m-0 text-xs leading-relaxed">Las sugerencias aprenden de ti; no reemplazan consejo médico. {cycles > 0 ? `Llevas ${cycles} ${cycles === 1 ? 'ciclo' : 'ciclos'} con datos.` : ''}</p>
      <button type="button" className={quiet} onClick={onExample}>{exampleOn ? 'Ocultar ejemplo' : 'Ver ejemplo de 3 ciclos'}</button>
      <button type="button" className={quiet} onClick={onNotices}>Avisos</button>
      <button type="button" className={quiet} onClick={onFlags}>Mi ciclo no sigue estas fases</button>
      <button type="button" className={quiet} onClick={onData}>Exportar o borrar</button>
    </section>
  );
}
