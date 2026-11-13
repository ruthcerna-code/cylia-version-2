import React from 'react';
import type { MenstrualPhase } from '../../types';
import { PHASE_DOT } from '../../plan/dayContext';
import { shiftDate } from '../../plan/proposal';

const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

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
              aria-label={`${LETTERS[index]} ${dayNumber}, ${count.done} de ${count.total}`}
              className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-0.5 py-1.5"
              style={{
                background: active ? '#1B1F5E' : '#F8F9FE',
                color: active ? '#FFFFFF' : '#1B1F5E',
                outline: isToday ? '2px solid #F49A9E' : 'none',
                outlineOffset: 1,
              }}
            >
              <span className="text-[10px] font-extrabold" style={{ color: active ? '#DCE5FA' : '#8B90B8' }}>{LETTERS[index]}</span>
              <span className="text-sm font-extrabold">{dayNumber}</span>
              <span className="h-2 w-2 rounded-full" style={{ background: phase ? PHASE_DOT[phase] : 'transparent', border: phase ? 'none' : '1px solid #C9D3EF' }} aria-hidden="true" />
              <span className="text-[10px] font-bold" style={{ color: active ? '#DCE5FA' : '#4A4F7A' }}>{count.done}/{count.total}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
