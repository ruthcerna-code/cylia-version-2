import React, { useEffect, useMemo, useState } from 'react';
import type { DailyLog, PeriodRecord, UserProfile } from '../types';
import { MOVEMENT_CATALOG, MOVEMENT_TYPE_LABELS } from '../catalog/movementCatalog';
import { CONDITION_MESSAGE, pickMovement } from '../utils/movementPicker';
import { analyzeCycle } from '../utils/cycleModel';
import { addCalendarDays } from '../utils/cycle';
import { phaseApi } from '../plan/dayContext';
import { readSleep } from '../utils/recordCompare';
import { fetchMovementDays, saveMovementDay, type MovementDay } from '../firebase';

const INTENSITY_LABEL = { suave: 'Suave', moderada: 'Moderada', alta: 'Alta' } as const;
const INTENSITY_COLOR = { suave: '#A9C4F0', moderada: '#F6E27F', alta: '#F49A9E' } as const;

function sameIds(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** "Tu movimiento de hoy": 3 movement activities for the "Salud física" focus. */
export default function MovementCard({
  userId,
  profile,
  periods,
  logs,
  today,
}: {
  userId: string;
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  today: string;
}) {
  const [days, setDays] = useState<MovementDay[] | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    let active = true;
    fetchMovementDays(userId)
      .then((rows) => { if (active) setDays(rows); })
      .catch(() => { if (active) setDays([]); });
    return () => { active = false; };
  }, [userId]);

  const todayDay = days?.find((day) => day.date === today);
  const weekStart = addCalendarDays(today, -7);
  const recentIds = (days || []).filter((day) => day.date >= weekStart && day.date < today).flatMap((day) => day.suggestedIds);
  const dislikedIds = [...new Set((days || []).flatMap((day) => day.dislikedIds))];
  const log = logs[today] ?? null;
  const view = analyzeCycle(profile, periods, today, logs);

  const result = useMemo(() => pickMovement({
    catalog: MOVEMENT_CATALOG,
    today,
    phase: phaseApi(view.phase),
    mode: view.mode,
    log,
    sleepHours: log ? readSleep(log).hours : null,
    freeMinutes: null,
    recentIds,
    dislikedIds,
    preferences: null,
    seed: `${userId}-${today}`,
    situation: profile.specialSituation,
    keep: todayDay?.suggestedIds,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [days, log, view.phase, view.mode, profile.specialSituation, today, userId]);

  const ids = result.items.map((item) => item.activity.id);

  const store = async (next: MovementDay) => {
    setDays((current) => [...(current || []).filter((day) => day.date !== next.date), next]);
    try {
      await saveMovementDay(userId, next);
      setNote('');
    } catch {
      setNote('Tus propuestas se muestran, pero no se pudieron guardar en tu cuenta.');
    }
  };

  // Save today's proposals once they are known, so tomorrow does not repeat them.
  useEffect(() => {
    if (days === null || result.blocked || !ids.length) return;
    if (todayDay && sameIds(todayDay.suggestedIds, ids)) return;
    void store({
      date: today,
      suggestedIds: ids,
      doneIds: todayDay?.doneIds ?? [],
      dislikedIds: todayDay?.dislikedIds ?? [],
      updatedAt: new Date().toISOString(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days === null, ids.join(','), result.blocked]);

  const update = (patch: Partial<Pick<MovementDay, 'doneIds' | 'dislikedIds'>>) => {
    void store({
      date: today,
      suggestedIds: ids,
      doneIds: todayDay?.doneIds ?? [],
      dislikedIds: todayDay?.dislikedIds ?? [],
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  };

  const done = new Set(todayDay?.doneIds ?? []);
  const hasCondition = Boolean(profile.isCeliac || profile.hasDiabetes || profile.hasObesity || profile.hasDepression);

  return (
    <section aria-labelledby="movimiento-hoy" className="rounded-[20px] bg-white p-4">
      <h2 id="movimiento-hoy" className="m-0 text-base font-extrabold">Tu movimiento de hoy</h2>
      {result.blocked ? (
        <p className="m-0 mt-2 rounded-2xl bg-[#FFF6CF] px-3 py-3 text-sm font-semibold leading-relaxed text-[#1B1F5E]" role="status">{result.blocked}</p>
      ) : days === null ? (
        <p className="m-0 mt-2 text-sm text-[#3B4070]">Preparando tus propuestas…</p>
      ) : result.items.length === 0 ? (
        <p className="m-0 mt-2 text-sm text-[#3B4070]">Hoy no encontré actividades que calcen con tu energía y cómo te sientes. Descansar también cuenta.</p>
      ) : (
        <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {result.items.map(({ activity, reason }) => {
            const isDone = done.has(activity.id);
            return (
              <li key={activity.id} className="rounded-2xl bg-[#F8F9FE] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className={`text-[15px] text-[#1B1F5E] ${isDone ? 'line-through decoration-2' : ''}`}>{activity.name}</strong>
                </div>
                <p className="m-0 mt-1 flex flex-wrap items-center gap-1.5 text-xs font-bold text-[#4A4F7A]">
                  <span>{activity.minutes} min</span>
                  <span aria-hidden="true">·</span>
                  <span className="rounded-full px-2 py-0.5 text-[#1B1F5E]" style={{ background: INTENSITY_COLOR[activity.intensity] }}>{INTENSITY_LABEL[activity.intensity]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{MOVEMENT_TYPE_LABELS[activity.type]}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activity.place}</span>
                </p>
                <p className="m-0 mt-2 text-sm leading-relaxed text-[#3B4070]">{reason}</p>
                {activity.caution && <p className="m-0 mt-1 text-xs font-bold text-[#D4536A]">Cuidado: {activity.caution}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={isDone}
                    onClick={() => update({ doneIds: isDone ? [...done].filter((id) => id !== activity.id) : [...done, activity.id] })}
                    className="flex h-11 cursor-pointer items-center justify-center rounded-full text-sm font-extrabold"
                    style={{ background: isDone ? '#3A44C4' : '#F49A9E', color: isDone ? '#FFFFFF' : '#1B1F5E' }}
                  >
                    {isDone ? '✓ La hice' : 'La hice'}
                  </button>
                  <button
                    type="button"
                    disabled={isDone}
                    onClick={() => update({ dislikedIds: [...new Set([...(todayDay?.dislikedIds ?? []), activity.id])] })}
                    className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-white text-sm font-extrabold text-[#3A44C4] ring-1 ring-[#C9D3EF] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    No me gusta
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {!result.blocked && hasCondition && <p className="m-0 mt-3 text-xs leading-relaxed text-[#4A4F7A]">{CONDITION_MESSAGE}</p>}
      {note && <p className="m-0 mt-2 text-xs text-[#4A4F7A]" role="status">{note}</p>}
      <p className="m-0 mt-2 text-[12px] leading-relaxed text-[#4A4F7A]">Cyclia es educativa: estas ideas no reemplazan la indicación de un profesional.</p>
    </section>
  );
}
