import React from 'react';
import type { ScheduledActivity } from '../../types';
import type { EnergyBand } from '../../plan/proposal';
import { clockMinutes, localDate } from '../../plan/proposal';
import { energyIcon } from '../../plan/dayContext';

function durationLabel(activity: ScheduledActivity): string {
  const start = clockMinutes(activity.startTime);
  const end = clockMinutes(activity.endTime);
  const minutes = activity.estimateMinutes || (start != null && end != null && end > start ? end - start : null);
  if (!minutes) return '';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

export default function ActivityItem({
  activity,
  energy,
  justDone,
  onAsk,
  onReschedule,
}: {
  activity: ScheduledActivity;
  energy: EnergyBand | null;
  justDone: boolean;
  onAsk: () => void;
  onReschedule: () => void;
}) {
  const done = activity.planStatus === 'hecha';
  const skipped = activity.planStatus === 'pospuesta';
  const today = localDate();
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const end = clockMinutes(activity.endTime) ?? clockMinutes(activity.startTime);
  const past = !done && !skipped && (activity.date < today || (activity.date === today && end != null && end <= now));
  const icon = energyIcon(energy);

  return (
    <article className={`flex items-center gap-3 py-3 ${justDone ? 'motion-safe:animate-pulse' : ''}`}>
      <div className={`min-w-0 flex-1 ${done ? 'opacity-60' : ''}`}>
        <p className="m-0 text-[12px] font-bold text-[#4A4F7A]">
          {activity.startTime || '—'}{activity.endTime ? `–${activity.endTime}` : ''}
          {durationLabel(activity) ? ` · ${durationLabel(activity)}` : ''}
          {icon ? ` · ${icon}` : ''}
        </p>
        <h3 className={`m-0 text-[15px] font-extrabold text-[#1B1F5E] ${done ? 'line-through' : ''}`}>{activity.title}</h3>
        {skipped && <p className="m-0 text-[12px] font-bold text-[#8B90B8]">No realizada</p>}
        {skipped && (
          <button type="button" onClick={onReschedule} className="mt-1 flex h-11 cursor-pointer items-center rounded-full bg-[#F8F9FE] px-4 text-sm font-extrabold text-[#3A44C4]">
            Reprogramar
          </button>
        )}
      </div>
      {done ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3A44C4] text-lg text-white" aria-label="Realizada">✓</span>
      ) : (
        <button
          type="button"
          onClick={onAsk}
          aria-label={past ? `Marcar ${activity.title}. Quedó sin registrar.` : `Marcar ${activity.title}`}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-2 bg-white"
          style={{ borderColor: skipped ? '#C9D3EF' : past ? '#D4536A' : '#3A44C4', color: skipped ? '#C9D3EF' : past ? '#D4536A' : '#3A44C4' }}
        >
          {skipped ? '–' : ''}
        </button>
      )}
    </article>
  );
}
