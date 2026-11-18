import React, { useRef, useState } from 'react';
import { UserProfile } from '../types';
import { dayWithinCycle, getCycleDay, getPhaseForDay, formatDateStr, PHASE_DETAILS } from '../utils/cycle';

interface CalendarViewProps {
  profile: UserProfile;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  /** Doble clic: abre el registro de cómo amaneció, el ánimo y la salud. */
  onOpenRecord?: (dateStr: string) => void;
  activityDates?: string[];
  /** Days that already have mood and behavior. Other days up to today show P. */
  completeDates?: string[];
  showPhases?: boolean;
  cycleLength?: number;
  periodLength?: number;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function CalendarView({ profile, selectedDateStr, onSelectDate, onOpenRecord, activityDates = [], completeDates = [], showPhases = true, cycleLength = profile.cycleLength, periodLength = profile.periodLength }: CalendarViewProps) {
  const lastTap = useRef<{ date: string; at: number } | null>(null);
  const today = new Date();
  const todayStr = formatDateStr(today);

  // Initialize the calendar to focus on the selected date or today
  const initialDate = selectedDateStr ? new Date(selectedDateStr + 'T12:00:00') : today;
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());

  // Number of days in the current month
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  
  // Starting day of the week (1st of the month), Monday-based (0: Mon, 6: Sun)
  const firstDayIndex = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;

  // Month navigation
  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Check which phase a specific day falls in
  const getDayDetails = (dayNum: number) => {
    const paddedMonth = String(currentMonth + 1).padStart(2, '0');
    const paddedDay = String(dayNum).padStart(2, '0');
    const fullDateStr = `${currentYear}-${paddedMonth}-${paddedDay}`;
    
    const cycleDay = dayWithinCycle(getCycleDay(fullDateStr, profile.lastPeriodDate, cycleLength), cycleLength);
    const phase = getPhaseForDay(cycleDay, periodLength, cycleLength);
    
    return {
      dateStr: fullDateStr,
      cycleDay,
      phase
    };
  };

  // Generate calendar grid array
  const gridCells = [];
  
  // Empty cells for alignment
  for (let i = 0; i < firstDayIndex; i++) {
    gridCells.push(<div key={`empty-${i}`} className="aspect-square opacity-0"></div>);
  }

  // Days of the month
  for (let d = 1; d <= totalDays; d++) {
    const { dateStr, cycleDay, phase } = getDayDetails(d);
    const isSelected = selectedDateStr === dateStr;
    const isToday = todayStr === dateStr;
    const hasActivity = activityDates.includes(dateStr);
    const due = dateStr <= todayStr;
    const recorded = due && completeDates.includes(dateStr);

    const tone = PHASE_DETAILS[phase];
    const phaseName = tone?.badge || 'Sin fase';

    gridCells.push(
      <button
        key={`day-${d}`}
        id={`calendar-day-${d}`}
        type="button"
        onClick={() => {
          const now = Date.now();
          const previous = lastTap.current;
          lastTap.current = { date: dateStr, at: now };
          onSelectDate(dateStr);
          if (previous && previous.date === dateStr && now - previous.at < 500) onOpenRecord?.(dateStr);
        }}
        onDoubleClick={() => { onSelectDate(dateStr); onOpenRecord?.(dateStr); }}
        aria-pressed={isSelected}
        aria-current={isToday ? 'date' : undefined}
        className={`relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl text-[13px] font-semibold @[380px]:rounded-2xl @[380px]:text-sm ${
          isSelected ? 'z-10' : ''
        } ${isToday ? 'font-bold' : ''}`}
        style={{
          background: showPhases ? tone.cellHex : '#FFF1E8',
          color: showPhases ? tone.textHex : '#153E40',
          outline: isSelected ? '2px solid #153E40' : undefined,
          outlineOffset: isSelected ? '1px' : undefined,
        }}
        title={`Día ${d}: Día ${cycleDay} del ciclo, fase ${phaseName}${isToday ? ', hoy' : ''}${isSelected ? ', seleccionado' : ''}. Doble clic para registrar cómo amaneciste, el ánimo y la salud.${due ? (recorded ? ' Ánimo y comportamiento registrados.' : ' Pendiente: falta ánimo o comportamiento.') : ''}`}
      >
        <span>{d}</span>
        {due && (
          <span
            className="absolute left-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-[#FFF8EE] text-[8px] font-extrabold leading-none text-[#153E40]"
            aria-hidden="true"
          >
            {recorded ? '✓' : 'P'}
          </span>
        )}
        {isToday && (
          <span className="absolute bottom-1 w-1.5 h-1.5 bg-[#153E40] rounded-full"></span>
        )}
        {hasActivity && (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#FFF8EE] ring-2 ring-[#153E40]" title="Actividad agendada"></span>
        )}
      </button>
    );
  }

  return (
    <div className="@container flex h-full min-w-0 flex-col overflow-x-clip rounded-[20px] bg-[#FFF8EE] px-4 py-4">
      {/* Month Selector & Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-lg font-semibold text-[#153E40]"
          title="Mes Anterior"
        >
          ‹
        </button>
        <h3 className="m-0 text-2xl leading-[1.2] text-[#153E40]">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h3>
        <button
          onClick={nextMonth}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-lg font-semibold text-[#153E40]"
          title="Mes Siguiente"
        >
          ›
        </button>
      </div>

      {/* Weekday Labels */}
      <div className="mb-3 grid min-w-0 grid-cols-7 gap-1 text-center @[380px]:gap-2">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dayLabel, idx) => (
          <div key={idx} className="min-w-0 py-1 text-[10px] font-semibold text-[#153E40] @[380px]:text-xs">
            {dayLabel}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1 text-center @[380px]:gap-2">
        {gridCells}
      </div>
      <p className="m-0 mt-3 text-sm text-[#245456]">Un clic elige el día. Doble clic abre el registro: cómo amaneciste, ánimo y salud.</p>

      {/* Color Legend */}
      {showPhases && <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-[#E7D3C6] pt-4 sm:justify-start">
        {(['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'] as const).map((item) => (
          <div key={item} className="flex items-center gap-1.5 text-sm text-[#153E40]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PHASE_DETAILS[item].bgHex }} />
            <span>{PHASE_DETAILS[item].badge}</span>
          </div>
        ))}
      </div>}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-[#3E6466]">
        <span>✓ ánimo y comportamiento</span>
        <span>P pendiente</span>
      </div>
    </div>
  );
}
