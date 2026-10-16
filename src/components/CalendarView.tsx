import React, { useState } from 'react';
import { UserProfile } from '../types';
import { getCycleDay, getPhaseForDay, formatDateStr } from '../utils/cycle';

interface CalendarViewProps {
  profile: UserProfile;
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export default function CalendarView({ profile, selectedDateStr, onSelectDate }: CalendarViewProps) {
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
    
    const cycleDay = getCycleDay(fullDateStr, profile.lastPeriodDate, profile.cycleLength);
    const phase = getPhaseForDay(cycleDay, profile.periodLength, profile.cycleLength);
    
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

    // Decide phase-based color classes matching the "Natural Tones" layout specification
    let bgClass = "bg-gray-100 text-gray-500";
    if (phase === 'Menstrual') {
      bgClass = "bg-[#F49A9E] text-[#1B1F5E] hover:bg-[#E57F86]";
    } else if (phase === 'Folicular') {
      bgClass = "bg-[#A9C4F0] text-[#1B1F5E] hover:bg-[#96b4ea]";
    } else if (phase === 'Ovulacion') {
      bgClass = "bg-[#F6E27F] text-[#1B1F5E] hover:bg-[#E8D46A]";
    } else if (phase === 'Lutea') {
      bgClass = "bg-[#3A44C4] text-white hover:bg-[#2E37B0]";
    }

    gridCells.push(
      <button
        key={`day-${d}`}
        id={`calendar-day-${d}`}
        onClick={() => onSelectDate(dateStr)}
        className={`aspect-square flex flex-col items-center justify-center rounded-2xl font-semibold text-sm transition-all relative cursor-pointer ${bgClass} ${
          isSelected ? 'ring-4 ring-[#1B1F5E] scale-105 z-10 font-bold shadow-md' : ''
        } ${
          isToday ? 'border-2 border-dashed border-[#1B1F5E]' : ''
        }`}
        title={`Día ${d}: Día ${cycleDay} del ciclo (${phase})`}
      >
        <span>{d}</span>
        {isToday && (
          <span className="absolute bottom-1 w-1.5 h-1.5 bg-[#1B1F5E] rounded-full"></span>
        )}
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white px-3 py-4">
      {/* Month Selector & Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-lg font-extrabold text-[#1B1F5E]"
          title="Mes Anterior"
        >
          ‹
        </button>
        <h3 className="text-lg font-extrabold text-[#1B1F5E]">
          {MONTH_NAMES[currentMonth]} {currentYear}
        </h3>
        <button
          onClick={nextMonth}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-lg font-extrabold text-[#1B1F5E]"
          title="Mes Siguiente"
        >
          ›
        </button>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-2 text-center mb-3">
        {["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((dayLabel, idx) => (
          <div key={idx} className="py-1 text-xs font-extrabold text-[#4A4F7A]">
            {dayLabel}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2 text-center flex-1">
        {gridCells}
      </div>

      {/* Color Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-6 pt-4 border-t border-[#EFEFEF] justify-center sm:justify-start">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7A7A70]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F49A9E] inline-block shadow-sm"></span>
          <span>Menstrual</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7A7A70]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#A9C4F0] inline-block shadow-sm"></span>
          <span>Folicular</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7A7A70]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F6E27F] inline-block shadow-sm"></span>
          <span>Ovulación</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7A7A70]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3A44C4] inline-block shadow-sm"></span>
          <span>Lútea</span>
        </div>
      </div>
    </div>
  );
}
