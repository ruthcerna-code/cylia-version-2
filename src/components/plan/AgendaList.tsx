import React from 'react';
import type { ScheduledActivity } from '../../types';
import type { EnergyBand } from '../../plan/proposal';
import { agendaGroups, type AgendaRange } from '../../plan/agenda';
import ActivityItem from './ActivityItem';

/** Agenda: every scheduled activity in order of date and time, grouped by day. */
export default function AgendaList({
  activities,
  today,
  range,
  onRange,
  energyOf,
  justDoneId,
  busyId,
  onToggleDone,
  onEdit,
  onDelete,
  onReschedule,
  onOpenDay,
}: {
  activities: ScheduledActivity[];
  today: string;
  range: AgendaRange;
  onRange: (range: AgendaRange) => void;
  energyOf: (date: string) => EnergyBand | null;
  justDoneId: string | null;
  busyId?: string | null;
  onToggleDone: (activity: ScheduledActivity) => void;
  onEdit: (activity: ScheduledActivity) => void;
  onDelete: (activity: ScheduledActivity) => void;
  onReschedule: (activity: ScheduledActivity) => void;
  onOpenDay: (date: string) => void;
}) {
  const days = agendaGroups(activities, today, range);
  const total = days.reduce((sum, day) => sum + day.activities.length, 0);

  return (
    <section aria-labelledby="agenda-titulo" className="mx-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="agenda-titulo" className="m-0 text-base font-extrabold text-[#1B1F5E]">
          {range === 'proximas' ? 'Próximas actividades' : 'Todas las actividades'}
          <span className="ml-2 text-sm font-bold text-[#4A4F7A]">{total}</span>
        </h2>
        <div className="flex rounded-full bg-white p-1" role="group" aria-label="Qué actividades mostrar">
          {(['proximas', 'todas'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => onRange(option)}
              className="flex h-9 cursor-pointer items-center rounded-full px-3 text-xs font-extrabold"
              style={{ background: range === option ? '#3A44C4' : 'transparent', color: range === option ? '#FFFFFF' : '#3A44C4' }}
            >
              {option === 'proximas' ? 'Próximas' : 'Todas'}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <p className="m-0 rounded-[20px] bg-white px-4 py-8 text-center text-sm leading-relaxed text-[#3B4070]">
          {range === 'proximas' ? 'No tienes actividades programadas desde hoy. ¿Planificamos una?' : 'Todavía no tienes actividades.'}
        </p>
      ) : (
        days.map((day) => {
          const past = day.date < today;
          return (
            <div key={day.date} className={`flex flex-col gap-2 ${past ? 'opacity-80' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-sm font-extrabold text-[#3A44C4]">
                  {day.label}
                  {day.label === 'Hoy' || day.label === 'Mañana' || day.label === 'Ayer'
                    ? <span className="ml-1 font-bold text-[#4A4F7A]">· {new Date(`${day.date}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}</span>
                    : null}
                </h3>
                <button type="button" onClick={() => onOpenDay(day.date)} className="flex h-9 cursor-pointer items-center text-xs font-extrabold text-[#3A44C4]">
                  Ver día
                </button>
              </div>
              {day.activities.map((activity) => (
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
        })
      )}
    </section>
  );
}
