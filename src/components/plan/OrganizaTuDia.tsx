import React, { useEffect, useState } from 'react';
import type { ActivityDraft } from '../../firebase';
import type { DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../../types';
import { analyzeCycle } from '../../utils/cycleModel';
import { energyBandFromLog } from '../../plan/dayContext';
import type { EnergyBand } from '../../plan/proposal';
import { localDate, mondayOf, shiftDate } from '../../plan/proposal';
import WeekStrip from './WeekStrip';
import DayActivityList from './DayActivityList';
import TaskEditorScreen from './TaskEditorScreen';
import MonthPicker from './MonthPicker';
import CycliaTeAsiste from './CycliaTeAsiste';
import DifficultDaySheet from './DifficultDaySheet';
import { readReplanUndo, toDraft, writeReplanUndo, type ReplanUndo } from '../../plan/difficultDay';
import { PlusBadge, usePlusNotice } from '../PlusNotice';
import AgendaList from './AgendaList';
import { pendingAhead, type AgendaRange } from '../../plan/agenda';
import { CalendarDays, ListOrdered, Plus } from 'lucide-react';
import DayFocusCard from './DayFocusCard';
import { buildDayFocus } from '../../plan/dayFocus';

type EditorState =
  | { mode: 'crear'; token: number; title: string; date: string }
  | { mode: 'editar'; token: number; activity: ScheduledActivity };

export default function OrganizaTuDia({
  openToken,
  userId,
  createTitle,
  createDate,
  profile,
  periods,
  logs,
  activities,
  assistantEnabled,
  availabilityKnown,
  onAuthorizeAssistant,
  onSaveActivity,
  onDeleteActivity,
  onLanded,
}: {
  openToken: number;
  userId: string;
  createTitle: string;
  createDate: string;
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  activities: ScheduledActivity[];
  assistantEnabled: boolean;
  availabilityKnown: boolean;
  onAuthorizeAssistant: () => Promise<boolean>;
  onSaveActivity: (draft: ActivityDraft) => Promise<ScheduledActivity | undefined>;
  onDeleteActivity: (activity: ScheduledActivity) => Promise<void>;
  onSaveEnergy: (date: string, band: EnergyBand) => Promise<void>;
  onOpenRegister: () => void;
  onLanded: () => void;
}) {
  const today = localDate();
  const requestPlus = usePlusNotice();
  const [selected, setSelected] = useState(today);
  const [monday, setMonday] = useState(mondayOf(today));
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [deleting, setDeleting] = useState<ScheduledActivity | null>(null);
  const [view, setView] = useState<'dia' | 'agenda'>('dia');
  const [agendaRange, setAgendaRange] = useState<AgendaRange>('proximas');
  const ahead = pendingAhead(activities, today);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justDoneId, setJustDoneId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ activity: ScheduledActivity; until: number } | null>(null);
  const [markError, setMarkError] = useState('');
  const [difficultOpen, setDifficultOpen] = useState(false);
  const [replanUndo, setReplanUndo] = useState<ReplanUndo | null>(() => readReplanUndo(today));
  const [replanBusy, setReplanBusy] = useState(false);

  useEffect(() => {
    if (!openToken) return;
    const date = createDate >= today ? createDate : today;
    setSelected(date);
    setMonday(mondayOf(date));
    setEditor({ mode: 'crear', token: openToken, title: createTitle, date });
  }, [openToken, createTitle, createDate, today]);

  useEffect(() => {
    if (!undo) return undefined;
    const wait = Math.max(0, undo.until - Date.now());
    const timer = window.setTimeout(() => setUndo(null), wait);
    return () => window.clearTimeout(timer);
  }, [undo]);

  const phaseOf = (date: string) => {
    const view = analyzeCycle(profile, periods, date, logs);
    return view.showPhases ? view.phase : null;
  };
  const dayItems = activities.filter((item) => item.date === selected);
  const now = new Date();
  const todayEnergy = energyBandFromLog(logs[today]);
  const dayFocus = selected === today
    ? buildDayFocus(activities, today, todayEnergy, now.getHours() * 60 + now.getMinutes())
    : null;
  const openToday = activities.some((item) => item.date === today && item.planStatus !== 'hecha');
  // The undo copy lives on this device. Show it only if every activity in it belongs to this account.
  const undoAvailable = Boolean(replanUndo && replanUndo.before.every((draft) => activities.some((item) => item.id === draft.id)));

  const applyReplan = async (drafts: ActivityDraft[], before: ActivityDraft[]) => {
    const saved: string[] = [];
    try {
      for (const draft of drafts) {
        await onSaveActivity(draft);
        if (draft.id) saved.push(draft.id);
      }
    } catch (reason) {
      // All or nothing: put back what was already saved.
      for (const draft of before.filter((item) => item.id && saved.includes(item.id))) {
        await onSaveActivity(draft).catch(() => undefined);
      }
      throw reason;
    }
    const next: ReplanUndo = { date: today, appliedAt: new Date().toISOString(), before };
    writeReplanUndo(next);
    setReplanUndo(next);
    setDifficultOpen(false);
  };

  const undoReplan = async () => {
    if (!replanUndo) return;
    setReplanBusy(true);
    setMarkError('');
    try {
      for (const draft of replanUndo.before) await onSaveActivity(draft);
      writeReplanUndo(null);
      setReplanUndo(null);
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : 'No se pudo deshacer el cambio del día.');
    } finally {
      setReplanBusy(false);
    }
  };

  const dismissReplanUndo = () => {
    writeReplanUndo(null);
    setReplanUndo(null);
  };
  const goTo = (date: string) => {
    setSelected(date);
    setMonday(mondayOf(date));
  };
  const openCreate = (title = '') => setEditor({ mode: 'crear', token: Date.now(), title, date: selected < today ? today : selected });
  const openEdit = (activity: ScheduledActivity) => setEditor({ mode: 'editar', token: Date.now(), activity });

  /** Tachar: one tap marks it done and strikes it through; another tap brings it back. */
  const toggleDone = async (activity: ScheduledActivity) => {
    const done = activity.planStatus !== 'hecha';
    setBusyId(activity.id);
    setMarkError('');
    try {
      const saved = await onSaveActivity(toDraft(activity, {
        planStatus: done ? 'hecha' : 'pendiente',
        completedAt: done ? new Date().toISOString() : null,
      }));
      if (saved && done) {
        setJustDoneId(activity.id);
        window.setTimeout(() => setJustDoneId((current) => current === activity.id ? null : current), 700);
      }
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : 'No se pudo actualizar la actividad.');
    } finally {
      setBusyId(null);
    }
  };

  const removeActivity = async (activity: ScheduledActivity) => {
    setDeleting(null);
    setBusyId(activity.id);
    setMarkError('');
    try {
      await onDeleteActivity(activity);
      setUndo({ activity, until: Date.now() + 6000 });
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : 'No se pudo eliminar la actividad.');
    } finally {
      setBusyId(null);
    }
  };

  /** Deshacer: saves the deleted activity again with the same id, its steps and its conversation. */
  const restore = async () => {
    if (!undo) return;
    const activity = undo.activity;
    setUndo(null);
    try {
      await onSaveActivity(toDraft(activity, { assistChat: activity.assistChat }));
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : 'No se pudo deshacer.');
    }
  };

  return (
    <div className="-mx-0 flex flex-col gap-4 pb-28">
      <header className="rounded-[20px] bg-[#FFF8EE] px-4 py-5 text-[#153E40]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[36px] font-normal leading-[1.1]">Bandeja de entrada</h1>
            <MonthPicker selected={selected} today={today} onPick={(date) => { goTo(date); setView('dia'); }} />
          </div>
          <button
            type="button"
            onClick={() => goTo(today)}
            className="flex h-11 cursor-pointer items-center rounded-full bg-[#FFF8EE] px-4 text-sm font-extrabold text-[#153E40]"
          >
            Hoy
          </button>
        </div>
      </header>
      <div className="mx-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { void requestPlus('cyclia_asiste').then(() => setAssistOpen(true)); }}
          className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#FCE883] text-[15px] font-extrabold text-[#153E40]"
        >
          Cyclia te asiste <PlusBadge />
        </button>
        {openToday && !undoAvailable && (
          <button
            type="button"
            onClick={() => { void requestPlus('dia_dificil').then(() => setDifficultOpen(true)); }}
            className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[#069494] bg-[#FFF8EE] text-[15px] font-extrabold text-[#069494]"
          >
            Hoy es un día difícil <PlusBadge />
          </button>
        )}
        {undoAvailable && replanUndo && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] bg-[#153E40] px-4 py-2 text-sm text-white" role="status">
            <span>Replanificaste hoy {replanUndo.before.length} {replanUndo.before.length === 1 ? 'actividad' : 'actividades'}.</span>
            <span className="flex gap-3">
              <button type="button" disabled={replanBusy} onClick={() => { void undoReplan(); }} className="flex h-11 cursor-pointer items-center font-extrabold text-[#FCE883] disabled:opacity-50">
                {replanBusy ? 'Deshaciendo…' : 'Deshacer'}
              </button>
              <button type="button" disabled={replanBusy} onClick={dismissReplanUndo} className="flex h-11 cursor-pointer items-center font-bold text-[#DCE5FA]">
                Listo
              </button>
            </span>
          </div>
        )}
      </div>
      <div className="mx-4 grid grid-cols-2 gap-1 rounded-full bg-[#FFF8EE] p-1 shadow-[0_8px_24px_rgba(27,31,94,0.06)]" role="tablist" aria-label="Cómo ver tus actividades">
        {([
          { id: 'dia', label: 'Día', Icon: CalendarDays },
          { id: 'agenda', label: 'Agenda', Icon: ListOrdered },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-extrabold transition-colors"
            style={{ background: view === id ? '#069494' : 'transparent', color: view === id ? '#FFFFFF' : '#069494' }}
          >
            <Icon size={18} strokeWidth={2.25} aria-hidden="true" />
            {label}
            {id === 'agenda' && ahead > 0 && (
              <span className="rounded-full px-1.5 text-[11px]" style={{ background: view === id ? '#FCE883' : '#EEF1FD', color: '#153E40' }}>{ahead}</span>
            )}
          </button>
        ))}
      </div>
      {markError && <p className="mx-4 m-0 text-sm text-[#245456]" role="alert">{markError}</p>}
      {view === 'dia' ? (
        <>
          <WeekStrip
            monday={monday}
            selected={selected}
            today={today}
            phaseOf={phaseOf}
            counts={(date) => {
              const items = activities.filter((item) => item.date === date);
              return { done: items.filter((item) => item.planStatus === 'hecha').length, total: items.length };
            }}
            onSelect={setSelected}
            onShift={(days) => {
              const next = shiftDate(monday, days);
              setMonday(next);
              setSelected(next);
            }}
          />
          {dayFocus && <DayFocusCard focus={dayFocus} energy={todayEnergy} onEdit={openEdit} />}
          <DayActivityList
            activities={dayItems}
            energyOf={(date) => energyBandFromLog(logs[date])}
            justDoneId={justDoneId}
            busyId={busyId}
            onToggleDone={(activity) => { void toggleDone(activity); }}
            onEdit={openEdit}
            onDelete={setDeleting}
            onReschedule={(activity) => setEditor({ mode: 'crear', token: Date.now(), title: activity.title, date: today })}
          />
        </>
      ) : (
        <AgendaList
          activities={activities}
          today={today}
          range={agendaRange}
          onRange={setAgendaRange}
          energyOf={(date) => energyBandFromLog(logs[date])}
          justDoneId={justDoneId}
          busyId={busyId}
          onToggleDone={(activity) => { void toggleDone(activity); }}
          onEdit={openEdit}
          onDelete={setDeleting}
          onReschedule={(activity) => setEditor({ mode: 'crear', token: Date.now(), title: activity.title, date: today })}
          onOpenDay={(date) => { goTo(date); setView('dia'); }}
        />
      )}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#153E40]/40" onClick={() => setDeleting(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="eliminar-titulo" aria-describedby="eliminar-texto" className="w-full max-w-[480px] rounded-t-[28px] bg-[#FFF8EE] px-4 pb-8 pt-5" onClick={(event) => event.stopPropagation()}>
            <h2 id="eliminar-titulo" className="m-0 text-lg font-extrabold text-[#153E40]">¿Eliminar esta actividad?</h2>
            <p id="eliminar-texto" className="mt-1 text-sm text-[#245456]">«{deleting.title}» se quitará de tu día. Podrás deshacerlo durante unos segundos.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F8F9FE] text-[15px] font-extrabold text-[#153E40]">Cancelar</button>
              <button type="button" onClick={() => { void removeActivity(deleting); }} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#D4536A] text-[15px] font-extrabold text-white">Eliminar</button>
            </div>
          </div>
        </div>
      )}
      {undo && (
        <div className="fixed bottom-[184px] left-1/2 z-40 flex w-[min(440px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-[#153E40] px-4 py-2 text-sm text-white" role="status">
          <span>Eliminaste «{undo.activity.title}».</span>
          <button type="button" onClick={() => { void restore(); }} className="flex h-11 cursor-pointer items-center font-extrabold text-[#FCE883]">Deshacer</button>
        </div>
      )}
      <CycliaTeAsiste
        open={assistOpen}
        userId={userId}
        activities={activities}
        availabilityKnown={availabilityKnown}
        assistantEnabled={assistantEnabled}
        onAuthorizeAssistant={onAuthorizeAssistant}
        onClose={() => setAssistOpen(false)}
        onSave={onSaveActivity}
        onShow={(activity, mode) => {
          goTo(activity.date);
          setAssistOpen(false);
          if (mode === 'edit') openEdit(activity);
        }}
      />
      <DifficultDaySheet
        open={difficultOpen}
        date={today}
        activities={activities}
        onClose={() => setDifficultOpen(false)}
        onApply={applyReplan}
      />
      <div className="app-shell pointer-events-none fixed bottom-[112px] left-1/2 z-30 flex -translate-x-1/2 justify-end px-4">
        <button
          type="button"
          onClick={() => openCreate()}
          aria-label="Nueva tarea"
          title="Nueva tarea"
          className="pointer-events-auto flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-[#FCE883] text-[#153E40] shadow-[0_10px_28px_rgba(27,31,94,0.25)] transition-transform active:scale-95"
        >
          <Plus size={32} strokeWidth={2.75} aria-hidden="true" />
        </button>
      </div>
      {editor && (
        <TaskEditorScreen
          key={editor.token}
          mode={editor.mode}
          activity={editor.mode === 'editar' ? editor.activity : null}
          initialTitle={editor.mode === 'crear' ? editor.title : ''}
          initialDate={editor.mode === 'crear' ? editor.date : editor.activity.date}
          activities={activities}
          profile={profile}
          periods={periods}
          logs={logs}
          assistantEnabled={assistantEnabled}
          onClose={() => setEditor(null)}
          onSave={onSaveActivity}
          onDone={(date) => {
            goTo(date);
            setEditor(null);
            onLanded();
          }}
        />
      )}
    </div>
  );
}
