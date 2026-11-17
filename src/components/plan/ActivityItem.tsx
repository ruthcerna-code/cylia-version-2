import React from 'react';
import { CircleCheckBig, Circle, PencilLine, Trash2 } from 'lucide-react';
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

const ICON_BUTTON = 'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-50';

export default function ActivityItem({
  activity,
  energy,
  justDone,
  busy,
  onToggleDone,
  onEdit,
  onDelete,
  onReschedule,
}: {
  activity: ScheduledActivity;
  energy: EnergyBand | null;
  justDone: boolean;
  busy?: boolean;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReschedule: () => void;
}) {
  const done = activity.planStatus === 'hecha';
  const skipped = activity.planStatus === 'pospuesta';
  const today = localDate();
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  const end = clockMinutes(activity.endTime) ?? clockMinutes(activity.startTime);
  const past = !done && !skipped && (activity.date < today || (activity.date === today && end != null && end <= now));
  const icon = energyIcon(energy);
  const doneLabel = done ? `Quitar el tachado de ${activity.title}` : `Tachar ${activity.title} como hecha`;

  return (
    <article className={`flex items-center gap-2 py-3 ${justDone ? 'motion-safe:animate-pulse' : ''}`}>
      <div className={`min-w-0 flex-1 ${done ? 'opacity-60' : ''}`}>
        <p className="m-0 text-[12px] font-bold text-[#4A4F7A]">
          {activity.startTime || '—'}{activity.endTime ? `–${activity.endTime}` : ''}
          {durationLabel(activity) ? ` · ${durationLabel(activity)}` : ''}
          {icon ? ` · ${icon}` : ''}
        </p>
        <h3 className={`m-0 text-[15px] font-extrabold text-[#1B1F5E] ${done ? 'line-through decoration-2 decoration-[#3A44C4]' : ''}`}>{activity.title}</h3>
        {past && <p className="m-0 text-[12px] font-bold text-[#D4536A]">Pasó la hora. ¿La hiciste?</p>}
        {skipped && <p className="m-0 text-[12px] font-bold text-[#8B90B8]">No realizada</p>}
        {skipped && (
          <button type="button" onClick={onReschedule} className="mt-1 flex h-11 cursor-pointer items-center rounded-full bg-[#F8F9FE] px-4 text-sm font-extrabold text-[#3A44C4]">
            Reprogramar
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Acciones de ${activity.title}`}>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={doneLabel}
          title={done ? 'Quitar tachado' : 'Tachar: la hice'}
          className={`${ICON_BUTTON} ${done ? 'bg-[#3A44C4] text-white' : past ? 'bg-[#FDECEF] text-[#D4536A]' : 'bg-[#EEF1FD] text-[#3A44C4]'}`}
        >
          {done ? <CircleCheckBig size={22} strokeWidth={2.5} aria-hidden="true" /> : <Circle size={22} strokeWidth={2.5} aria-hidden="true" />}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          aria-label={`Editar ${activity.title}`}
          title="Editar"
          className={`${ICON_BUTTON} bg-[#FFF6CF] text-[#1B1F5E]`}
        >
          <PencilLine size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Eliminar ${activity.title}`}
          title="Eliminar"
          className={`${ICON_BUTTON} bg-[#FDECEF] text-[#D4536A]`}
        >
          <Trash2 size={20} strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
