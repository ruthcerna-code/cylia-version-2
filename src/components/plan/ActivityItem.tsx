import React from 'react';
import { CircleCheckBig, Circle, ListChecks, PencilLine, Trash2 } from 'lucide-react';
import type { ScheduledActivity } from '../../types';
import type { EnergyBand } from '../../plan/proposal';
import { clockMinutes } from '../../plan/proposal';
import { energyIcon } from '../../plan/dayContext';
import { ACTIVITY_COLORS, DEFAULT_STRIPE, TASK_STATUS_LABEL, subtaskProgress, taskStatus, type TaskStatus } from '../../plan/task';

function durationLabel(activity: ScheduledActivity): string {
  const start = clockMinutes(activity.startTime);
  const end = clockMinutes(activity.endTime);
  const minutes = activity.estimateMinutes || (start != null && end != null && end > start ? end - start : null);
  if (!minutes) return '';
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60} h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return `${minutes} min`;
}

const STATUS_STYLE: Record<TaskStatus, { background: string; color: string }> = {
  pendiente: { background: '#EEF1FD', color: '#069494' },
  en_curso: { background: '#FFF6CF', color: '#153E40' },
  vencida: { background: '#FDECEF', color: '#D4536A' },
  hecha: { background: '#069494', color: '#FFFFFF' },
  no_realizada: { background: '#F1F2F8', color: '#6B7097' },
};

const ICON_BUTTON = 'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-50';

/** Card of the Bandeja de entrada: color stripe, time, status, subtasks and the three quick actions. */
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
  const status = taskStatus(activity, new Date());
  const done = status === 'hecha';
  const skipped = status === 'no_realizada';
  const past = status === 'vencida';
  const icon = energyIcon(energy);
  const progress = subtaskProgress(activity);
  const stripe = activity.color ? ACTIVITY_COLORS[activity.color].hex : DEFAULT_STRIPE;
  const doneLabel = done ? `Quitar el tachado de ${activity.title}` : `Tachar ${activity.title} como hecha`;
  const duration = durationLabel(activity);

  return (
    <article
      className={`relative flex items-center gap-2 overflow-hidden rounded-[18px] bg-[#FFF8EE] py-3 pl-4 pr-2 shadow-[0_6px_18px_rgba(27,31,94,0.06)] ${justDone ? 'motion-safe:animate-pulse' : ''}`}
    >
      <span className="absolute inset-y-0 left-0 w-[6px]" style={{ background: stripe }} aria-hidden="true" />
      <button
        type="button"
        onClick={onEdit}
        disabled={busy}
        aria-label={`Abrir ${activity.title}`}
        className={`min-w-0 flex-1 cursor-pointer bg-transparent p-0 text-left ${done ? 'opacity-60' : ''}`}
      >
        <span className="block text-[12px] font-bold text-[#3E6466]">
          {activity.startTime || '—'}{activity.endTime ? `–${activity.endTime}` : ''}
          {duration ? ` · ${duration}` : ''}
          {icon ? ` · ${icon}` : ''}
        </span>
        <span className={`block text-[15px] font-extrabold text-[#153E40] ${done ? 'line-through decoration-2 decoration-[#069494]' : ''}`}>{activity.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={STATUS_STYLE[status]}>{TASK_STATUS_LABEL[status]}</span>
          {progress.total > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-[#F8F9FE] px-2 py-0.5 text-[11px] font-extrabold text-[#153E40]" aria-label={`${progress.done} de ${progress.total} subtareas`}>
              <ListChecks size={13} aria-hidden="true" /> {progress.done}/{progress.total}
            </span>
          )}
        </span>
        {past && <span className="mt-1 block text-[12px] font-bold text-[#D4536A]">Pasó la hora. ¿La hiciste?</span>}
      </button>
      {skipped && (
        <button type="button" onClick={onReschedule} className="flex h-11 shrink-0 cursor-pointer items-center rounded-full bg-[#F8F9FE] px-3 text-sm font-extrabold text-[#069494]">
          Reprogramar
        </button>
      )}
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label={`Acciones de ${activity.title}`}>
        <button
          type="button"
          disabled={busy}
          onClick={onToggleDone}
          aria-pressed={done}
          aria-label={doneLabel}
          title={done ? 'Quitar tachado' : 'Tachar: la hice'}
          className={`${ICON_BUTTON} ${done ? 'bg-[#C5EBEB] text-[#153E40]' : past ? 'bg-[#FDECEC] text-[#8E2F2F]' : 'bg-[#FFF8EE] text-[#069494]'}`}
        >
          {done ? <CircleCheckBig size={22} strokeWidth={2.5} aria-hidden="true" /> : <Circle size={22} strokeWidth={2.5} aria-hidden="true" />}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onEdit}
          aria-label={`Editar ${activity.title}`}
          title="Editar"
          className={`${ICON_BUTTON} bg-[#FFF6CF] text-[#153E40]`}
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
