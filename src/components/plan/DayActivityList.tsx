import React from 'react';
import type { ScheduledActivity } from '../../types';
import type { EnergyBand } from '../../plan/proposal';
import { clockMinutes } from '../../plan/proposal';
import ActivityItem from './ActivityItem';

export default function DayActivityList({
  activities,
  energyOf,
  justDoneId,
  busyId,
  onToggleDone,
  onEdit,
  onDelete,
  onReschedule,
}: {
  activities: ScheduledActivity[];
  energyOf: (date: string) => EnergyBand | null;
  justDoneId: string | null;
  busyId?: string | null;
  onToggleDone: (activity: ScheduledActivity) => void;
  onEdit: (activity: ScheduledActivity) => void;
  onDelete: (activity: ScheduledActivity) => void;
  onReschedule: (activity: ScheduledActivity) => void;
}) {
  const ordered = [...activities].sort((a, b) => (clockMinutes(a.startTime) ?? 0) - (clockMinutes(b.startTime) ?? 0));
  if (ordered.length === 0) {
    return (
      <p className="mx-4 rounded-[20px] bg-[#FFF8EE] px-4 py-8 text-center text-sm leading-relaxed text-[#245456]">
        Aún no tienes actividades este día. ¿Planificamos una?
      </p>
    );
  }
  return (
    <div className="mx-4 flex flex-col gap-2">
      {ordered.map((activity) => (
        <div key={activity.id}>
          <ActivityItem
            activity={activity}
            energy={energyOf(activity.date)}
            justDone={justDoneId === activity.id}
            busy={busyId === activity.id}
            onToggleDone={() => onToggleDone(activity)}
            onEdit={() => onEdit(activity)}
            onDelete={() => onDelete(activity)}
            onReschedule={() => onReschedule(activity)}
          />
        </div>
      ))}
    </div>
  );
}
