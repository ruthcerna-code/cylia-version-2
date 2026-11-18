import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** First day of a month as YYYY-MM-DD. */
export function monthStart(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Month and year of the Bandeja de entrada: a button that opens a year with its 12 months. */
export default function MonthPicker({
  selected,
  today,
  onPick,
}: {
  selected: string;
  today: string;
  onPick: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selYear = Number(selected.slice(0, 4));
  const selMonth = Number(selected.slice(5, 7)) - 1;
  const [year, setYear] = useState(selYear);
  const long = new Date(`${selected}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const label = long.charAt(0).toUpperCase() + long.slice(1);
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7)) - 1;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setYear(selYear); setOpen((value) => !value); }}
        className="mt-1 flex h-11 cursor-pointer items-center gap-1 rounded-full bg-[#FFE4E9] px-3 text-sm font-semibold text-[#153E40]"
      >
        {label}
        <ChevronDown size={16} aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div role="dialog" aria-label="Elegir mes" className="absolute left-0 top-11 z-30 w-[280px] rounded-[20px] bg-[#FFF8EE] p-3 text-[#153E40] shadow-[0_12px_32px_rgba(27,31,94,0.2)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Año anterior" onClick={() => setYear((value) => value - 1)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#069494]">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <span className="text-base font-extrabold">{year}</span>
            <button type="button" aria-label="Año siguiente" onClick={() => setYear((value) => value + 1)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[#069494]">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((name, month) => {
              const active = year === selYear && month === selMonth;
              const current = year === todayYear && month === todayMonth;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setOpen(false);
                    onPick(current ? today : monthStart(year, month));
                  }}
                  className="flex h-11 cursor-pointer items-center justify-center rounded-full text-sm font-extrabold"
                  style={{
                    background: active ? '#FF8243' : '#F8F9FE',
                    boxShadow: active ? 'inset 0 0 0 2px #153E40' : current ? 'inset 0 0 0 1.5px #069494' : 'none',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
