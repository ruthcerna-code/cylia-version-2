import React, { useEffect, useState } from 'react';
import type { ActivityDraft } from '../../firebase';
import type { DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../../types';
import { analyzeCycle } from '../../utils/cycleModel';
import { energyBandFromLog } from '../../plan/dayContext';
import type { EnergyBand } from '../../plan/proposal';
import { localDate, mondayOf, shiftDate } from '../../plan/proposal';
import WeekStrip from './WeekStrip';
import DayActivityList from './DayActivityList';
import CreateActivitySheet from './CreateActivitySheet';
import CycliaTeAsiste, { ActivityReviewSheet } from './CycliaTeAsiste';

function toDraft(activity: ScheduledActivity, patch: Partial<ActivityDraft> = {}): ActivityDraft {
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
    completedAt: activity.completedAt,
    durationSource: activity.durationSource,
    ...patch,
  };
}

export default function OrganizaTuDia({
  openToken,
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
  onSaveEnergy,
  onOpenRegister,
  onLanded,
}: {
  openToken: number;
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
  onSaveEnergy: (date: string, band: EnergyBand) => Promise<void>;
  onOpenRegister: () => void;
  onLanded: () => void;
}) {
  const today = localDate();
  const [selected, setSelected] = useState(today);
  const [monday, setMonday] = useState(mondayOf(today));
  const [sheet, setSheet] = useState<{ token: number; title: string; date: string } | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [review, setReview] = useState<ScheduledActivity | null>(null);
  const [asking, setAsking] = useState<ScheduledActivity | null>(null);
  const [justDoneId, setJustDoneId] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ activity: ScheduledActivity; until: number } | null>(null);
  const [markError, setMarkError] = useState('');

  useEffect(() => {
    if (!openToken) return;
    const date = createDate >= today ? createDate : today;
    setSelected(date);
    setMonday(mondayOf(date));
    setSheet({ token: openToken, title: createTitle, date });
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
  const month = new Date(`${selected}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

  const mark = async (activity: ScheduledActivity, done: boolean) => {
    const previous = activity;
    setAsking(null);
    setMarkError('');
    try {
      const saved = await onSaveActivity(toDraft(activity, {
        planStatus: done ? 'hecha' : 'pospuesta',
        completedAt: done ? new Date().toISOString() : null,
      }));
      if (!saved) return;
      if (done) {
        setJustDoneId(activity.id);
        window.setTimeout(() => setJustDoneId((current) => current === activity.id ? null : current), 700);
      }
      setUndo({ activity: previous, until: Date.now() + 5000 });
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : 'No se pudo actualizar la actividad.');
    }
  };

  const restore = async () => {
    if (!undo) return;
    const activity = undo.activity;
    setUndo(null);
    try {
      await onSaveActivity(toDraft(activity));
    } catch (reason) {
      setMarkError(reason instanceof Error ? reason.message : 'No se pudo deshacer.');
    }
  };

  return (
    <div className="-mx-0 flex flex-col gap-4 pb-4">
      <header className="bg-[#3A44C4] px-4 pb-5 pt-8 text-white">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-[26px] font-extrabold">Organiza tu día</h1>
            <p className="m-0 mt-1 text-sm capitalize text-[#DCE5FA]">{month}</p>
          </div>
          <button
            type="button"
            onClick={() => { setSelected(today); setMonday(mondayOf(today)); }}
            className="flex h-11 cursor-pointer items-center rounded-full bg-white px-4 text-sm font-extrabold text-[#1B1F5E]"
          >
            Hoy
          </button>
        </div>
      </header>
      <div className="mx-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAssistOpen(true)}
          className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E]"
        >
          Cyclia te asiste
        </button>
        <button
          type="button"
          onClick={() => setSheet({ token: Date.now(), title: '', date: selected < today ? today : selected })}
          className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]"
        >
          + Crear actividad
        </button>
      </div>
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
      {markError && <p className="mx-4 m-0 text-sm text-[#3B4070]" role="alert">{markError}</p>}
      <DayActivityList
        activities={dayItems}
        energyOf={(date) => energyBandFromLog(logs[date])}
        justDoneId={justDoneId}
        onAsk={setAsking}
        onReschedule={(activity) => setSheet({ token: Date.now(), title: activity.title, date: today })}
        onOpen={setReview}
      />
      {asking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B1F5E]/40" onClick={() => setAsking(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="realizaste" className="w-full max-w-[480px] rounded-t-[28px] bg-white px-4 pb-8 pt-5" onClick={(event) => event.stopPropagation()}>
            <h2 id="realizaste" className="m-0 text-lg font-extrabold text-[#1B1F5E]">¿La realizaste?</h2>
            <p className="mt-1 text-sm text-[#3B4070]">{asking.title}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { void mark(asking, true); }} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Sí</button>
              <button type="button" onClick={() => { void mark(asking, false); }} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F8F9FE] text-[15px] font-extrabold text-[#1B1F5E]">No</button>
            </div>
          </div>
        </div>
      )}
      {undo && (
        <div className="fixed bottom-28 left-1/2 z-40 flex w-[min(440px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-full bg-[#1B1F5E] px-4 py-2 text-sm text-white">
          <span>Listo. Puedes deshacer.</span>
          <button type="button" onClick={() => { void restore(); }} className="flex h-11 cursor-pointer items-center font-extrabold text-[#F6E27F]">Deshacer</button>
        </div>
      )}
      <CycliaTeAsiste
        open={assistOpen}
        activities={activities}
        availabilityKnown={availabilityKnown}
        assistantEnabled={assistantEnabled}
        onAuthorizeAssistant={onAuthorizeAssistant}
        onClose={() => setAssistOpen(false)}
        onSave={onSaveActivity}
        onShow={(activity, mode) => {
          setSelected(activity.date);
          setMonday(mondayOf(activity.date));
          setAssistOpen(false);
          setReview(mode === 'edit' ? activity : null);
        }}
      />
      {review && (
        <ActivityReviewSheet
          activity={review}
          activities={activities}
          onClose={() => setReview(null)}
          onSave={async (draft) => {
            const saved = await onSaveActivity(draft);
            if (saved) {
              setReview(saved);
              setSelected(saved.date);
              setMonday(mondayOf(saved.date));
            }
            return saved;
          }}
        />
      )}
      <CreateActivitySheet
        open={Boolean(sheet)}
        token={sheet?.token || 0}
        initialTitle={sheet?.title || ''}
        initialDate={sheet?.date || today}
        profile={profile}
        periods={periods}
        logs={logs}
        activities={activities}
        assistantEnabled={assistantEnabled}
        onClose={() => setSheet(null)}
        onSaveActivity={onSaveActivity}
        onSaveEnergy={onSaveEnergy}
        onOpenRegister={onOpenRegister}
        onAccepted={(date) => {
          setSelected(date);
          setMonday(mondayOf(date));
          setSheet(null);
          onLanded();
        }}
      />
    </div>
  );
}
