import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ScheduledActivity } from '../../types';
import type { EnergyBand } from '../../plan/proposal';
import { freeTimeLine, type DayFocus, type FocusItem } from '../../plan/dayFocus';
import { durationLabel } from '../../plan/task';

function timeOf(item: FocusItem): string {
  const { startTime, endTime } = item.activity;
  return startTime && endTime ? `${startTime}–${endTime}` : durationLabel(item.minutes);
}

/** «Tu foco de hoy»: up to three activities with their reason, and what can wait. Read only. */
export default function DayFocusCard({
  focus,
  energy,
  onEdit,
}: {
  focus: DayFocus;
  energy: EnergyBand | null;
  onEdit: (activity: ScheduledActivity) => void;
}) {
  const [waitingOpen, setWaitingOpen] = useState(false);
  if (focus.focus.length === 0 && focus.waiting.length === 0) return null;

  return (
    <section className="mx-4 flex flex-col gap-3 rounded-[20px] bg-[#FFF8EE] p-4 text-[#153E40]" aria-labelledby="foco-titulo">
      <div>
        <h2 id="foco-titulo" className="m-0 text-xl font-extrabold">Tu foco de hoy</h2>
        <p className="m-0 mt-1 text-sm text-[#245456]">{freeTimeLine(focus)}</p>
        {!energy && (
          <p className="m-0 mt-1 text-xs text-[#3E6466]">Sin tu energía de hoy, Cyclia ordena por fecha límite e importancia.</p>
        )}
      </div>

      {focus.focus.length > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {focus.focus.map((item, index) => (
            <li key={item.activity.id}>
              <button
                type="button"
                onClick={() => onEdit(item.activity)}
                className="flex w-full cursor-pointer items-start gap-3 rounded-2xl bg-white px-3 py-3 text-left"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FCE883] text-sm font-extrabold" aria-hidden="true">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-[15px]">{item.activity.title}</strong>
                  <span className="block text-xs font-bold text-[#3E6466]">{timeOf(item)}</span>
                  <span className="block text-sm text-[#245456]">{item.reason}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-[#245456]">Nada más cabe hoy. Revisa lo que puede esperar.</p>
      )}

      {focus.later.length > 0 && (
        <p className="m-0 text-xs text-[#3E6466]">
          Después: {focus.later.length} {focus.later.length === 1 ? 'actividad más' : 'actividades más'} en tu lista.
        </p>
      )}

      {focus.waiting.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[#EAD9CE] pt-2">
          <button
            type="button"
            aria-expanded={waitingOpen}
            onClick={() => setWaitingOpen((open) => !open)}
            className="flex h-11 cursor-pointer items-center justify-between text-[15px] font-extrabold text-[#D4536A]"
          >
            Puede esperar ({focus.waiting.length})
            <ChevronDown size={20} aria-hidden="true" style={{ transform: waitingOpen ? 'rotate(180deg)' : 'none' }} />
          </button>
          {waitingOpen && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {focus.waiting.map((item) => (
                <li key={item.activity.id} className="flex items-start gap-3 rounded-2xl bg-white px-3 py-3">
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[15px]">{item.activity.title}</strong>
                    <span className="block text-xs font-bold text-[#3E6466]">{timeOf(item)}</span>
                    <span className="block text-sm text-[#245456]">{item.reason}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onEdit(item.activity)}
                    className="flex h-11 shrink-0 cursor-pointer items-center rounded-full px-3 text-sm font-extrabold text-[#069494]"
                  >
                    Cambiar fecha
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="m-0 text-xs text-[#3E6466]">Es una sugerencia: Cyclia no mueve nada sin que tú lo cambies.</p>
    </section>
  );
}
