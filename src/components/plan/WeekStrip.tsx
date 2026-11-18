import React from 'react';
import type { MenstrualPhase } from '../../types';
import { PHASE_DOT } from '../../plan/dayContext';
import { shiftDate } from '../../plan/proposal';

const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const NAVY = '#1B1F5E';

/** Week of the Bandeja de entrada: lavender days, the chosen one in coral with a navy border, today always marked. */
export default function WeekStrip({
  monday,
  selected,
  today,
  phaseOf,
  counts,
  onSelect,
  onShift,
}: {
  monday: string;
  selected: string;
  today: string;
  phaseOf: (date: string) => MenstrualPhase | null;
  counts: (date: string) => { done: number; total: number };
  onSelect: (date: string) => void;
  onShift: (days: number) => void;
}) {
  const days = LETTERS.map((_, index) => shiftDate(monday, index));
  const swipe = React.useRef<{ x: number } | null>(null);

  return (
    <section
      className="mx-4 rounded-[20px] bg-white p-3 shadow-[0_8px_24px_rgba(27,31,94,0.06)]"
      aria-label="Semana"
      onTouchStart={(event) => { swipe.current = { x: event.changedTouches[0].clientX }; }}
      onTouchEnd={(event) => {
        if (!swipe.current) return;
        const delta = event.changedTouches[0].clientX - swipe.current.x;
        if (delta > 40) onShift(-7);
        if (delta < -40) onShift(7);
        swipe.current = null;
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => onShift(-7)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-lg font-extrabold text-[#3A44C4]" aria-label="Semana anterior">‹</button>
        <p className="m-0 text-[12px] font-bold text-[#4A4F7A]">Desliza para cambiar de semana</p>
        <button type="button" onClick={() => onShift(7)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-lg font-extrabold text-[#3A44C4]" aria-label="Semana siguiente">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          const phase = phaseOf(date);
          const count = counts(date);
          const active = date === selected;
          const isToday = date === today;
          const dayNumber = Number(date.slice(8));
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-pressed={active}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${isToday ? 'Hoy, ' : ''}${LETTERS[index]} ${dayNumber}, ${count.done} de ${count.total}`}
              className="flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-1.5 transition-colors"
              style={{
                background: active ? '#F49A9E' : '#A9C4F0',
                color: NAVY,
                boxShadow: active ? `inset 0 0 0 2.5px ${NAVY}` : 'none',
              }}
            >
              <span className="text-[10px] font-extrabold" style={{ color: NAVY, opacity: 0.75 }}>{isToday ? 'Hoy' : LETTERS[index]}</span>
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-extrabold"
                style={isToday ? { background: NAVY, color: '#FFFFFF' } : undefined}
              >
                {dayNumber}
              </span>
              <span className="h-2 w-2 rounded-full" style={{ background: phase ? PHASE_DOT[phase] : 'transparent', border: phase ? '1px solid #FFFFFF' : `1px solid ${NAVY}33` }} aria-hidden="true" />
              <span className="text-[10px] font-bold" style={{ color: NAVY }}>{count.done}/{count.total}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
