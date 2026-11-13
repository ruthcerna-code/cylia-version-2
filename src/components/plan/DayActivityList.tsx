import React from 'react';
import type { ScheduledActivity } from '../../types';
import type { EnergyBand } from '../../plan/proposal';
import { clockMinutes } from '../../plan/proposal';
import ActivityItem from './ActivityItem';

export default function DayActivityList({
  activities,
  energyOf,
  justDoneId,
  onAsk,
  onReschedule,
  onOpen,
}: {
  activities: ScheduledActivity[];
  energyOf: (date: string) => EnergyBand | null;
  justDoneId: string | null;
  onAsk: (activity: ScheduledActivity) => void;
  onReschedule: (activity: ScheduledActivity) => void;
  onOpen: (activity: ScheduledActivity) => void;
}) {
  const ordered = [...activities].sort((a, b) => (clockMinutes(a.startTime) ?? 0) - (clockMinutes(b.startTime) ?? 0));
  if (ordered.length === 0) {
    return (
      <p className="mx-4 rounded-[20px] bg-white px-4 py-8 text-center text-sm leading-relaxed text-[#3B4070]">
        Aún no tienes actividades este día. ¿Planificamos una?
      </p>
    );
  }
  return (
    <div className="mx-4 rounded-[20px] bg-white px-4 shadow-[0_8px_24px_rgba(27,31,94,0.06)]">
      {ordered.map((activity, index) => (
        <div key={activity.id} className={index > 0 ? 'border-t border-dashed border-[#C9D3EF]' : ''}>
          <ActivityItem
            activity={activity}
            energy={energyOf(activity.date)}
            justDone={justDoneId === activity.id}
            onAsk={() => onAsk(activity)}
            onReschedule={() => onReschedule(activity)}
            onOpen={() => onOpen(activity)}
          />
        </div>
      ))}
    </div>
  );
}
