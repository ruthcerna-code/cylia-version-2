import React from 'react';
import type { MenstrualPhase } from '../types';
import { formatDateStr, getCycleDay, getPhaseForDay } from '../utils/cycle';
import { PrivacyClauses } from './DesignScreens';

const PHASE_COLOR: Record<MenstrualPhase, string> = {
  Menstrual: '#F49A9E',
  Folicular: '#A9C4F0',
  Ovulacion: '#F6E27F',
  Lutea: '#3A44C4',
};

const ENERGY: Record<MenstrualPhase, { title: string; text: string }> = {
  Menstrual: {
    title: 'Tu cuerpo pide descanso',
    text: 'Prioriza el sueño, el calor y un ritmo más lento.',
  },
  Folicular: {
    title: 'Tu energía va en aumento',
    text: 'Buen momento para planificar, aprender algo nuevo y empezar proyectos.',
  },
  Ovulacion: {
    title: 'Tu energía está en lo más alto',
    text: 'Buen momento para conversar, presentar y moverte con más intensidad.',
  },
  Lutea: {
    title: 'Tu energía empieza a bajar',
    text: 'Buen momento para cerrar pendientes y cuidar los detalles.',
  },
};

function phaseArcs(periodLength: number, cycleLength: number) {
  const circumference = 2 * Math.PI * 70;
  const counts: Record<MenstrualPhase, number> = { Menstrual: 0, Folicular: 0, Ovulacion: 0, Lutea: 0 };
  for (let day = 1; day <= cycleLength; day += 1) {
    counts[getPhaseForDay(day, periodLength, cycleLength)] += 1;
  }
  let offset = 0;
  return (['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'] as const).map((phase) => {
    const length = (counts[phase] / cycleLength) * circumference;
    const arc = { phase, color: PHASE_COLOR[phase], dash: `${length} ${circumference}`, offset: -offset };
    offset += length;
    return arc;
  });
}

export default function DesignHome({
  name,
  dateLabel,
  todayStr,
  cycleDay,
  cycleLength,
  periodLength,
  lastPeriodDate,
  phase,
  activityTitle,
  onOpenPhase,
  onRegister,
  onChat,
  onMood,
  onActivity,
  onCalendar,
}: {
  name: string;
  dateLabel: string;
  todayStr: string;
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  lastPeriodDate: string;
  phase: MenstrualPhase;
  activityTitle: string;
  onOpenPhase: () => void;
  onRegister: () => void;
  onChat: () => void;
  onMood: () => void;
  onActivity: () => void;
  onCalendar: () => void;
}) {
  const energy = ENERGY[phase];
  const arcs = phaseArcs(periodLength, cycleLength);
  const markerAngle = ((cycleDay / Math.max(cycleLength, 1)) * Math.PI * 2) - Math.PI / 2;
  const markerX = 100 + 70 * Math.cos(markerAngle);
  const markerY = 100 + 70 * Math.sin(markerAngle);
  const names = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
  const start = new Date(`${todayStr}T12:00:00`);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateStr = formatDateStr(date);
    const dayOfCycle = getCycleDay(dateStr, lastPeriodDate, cycleLength);
    const dayPhase = getPhaseForDay(dayOfCycle, periodLength, cycleLength);
    return { label: names[date.getDay()], day: date.getDate(), today: index === 0, color: PHASE_COLOR[dayPhase] };
  });
  let ovulationNote = '';
  for (let index = 0; index < cycleLength; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateStr = formatDateStr(date);
    const dayOfCycle = getCycleDay(dateStr, lastPeriodDate, cycleLength);
    if (getPhaseForDay(dayOfCycle, periodLength, cycleLength) === 'Ovulacion') {
      const when = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
      ovulationNote = `Ventana ovulatoria estimada desde el ${when}.`;
      break;
    }
  }

  return (
    <div className="flex flex-col">
      <header className="relative overflow-hidden bg-[#3A44C4] px-6 pb-20 pt-14 text-white">
        <span className="relative font-serif text-[15px] tracking-[0.18em] text-[#F9C4C6]">CYCLIA</span>
        <h1 className="relative mt-2 text-[28px] font-extrabold">Hola, {name}</h1>
        <p className="relative text-[15px] text-[#DCE5FA]">{dateLabel}</p>
      </header>
      <section className="relative z-10 -mt-16 mx-[18px] flex flex-col items-center gap-3 rounded-3xl bg-white px-5 py-5 shadow-[0_10px_28px_rgba(27,31,94,0.12)]">
        <div className="relative aspect-square w-[min(190px,62vw)]">
          <svg viewBox="0 0 200 200" className="h-full w-full" aria-label={`Día ${cycleDay} de ${cycleLength}`}>
            <g transform="rotate(-90 100 100)" fill="none" strokeWidth="16">
              {arcs.map((arc) => (
                <circle key={arc.phase} cx="100" cy="100" r="70" stroke={arc.color} strokeDasharray={arc.dash} strokeDashoffset={arc.offset} />
              ))}
            </g>
            <circle cx={markerX} cy={markerY} r="11" fill="#FFFFFF" stroke="#1B1F5E" strokeWidth="3" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[13px] font-bold text-[#4A4F7A]">Día</span>
            <span className="font-serif text-[52px] leading-none text-[#3A44C4]">{cycleDay}</span>
            <span className="text-[13px] font-bold text-[#4A4F7A]">de {cycleLength}</span>
          </div>
        </div>
        <span className="rounded-full px-4 py-1.5 text-sm font-extrabold text-[#1B1F5E]" style={{ background: PHASE_COLOR[phase] }}>
          {phase === 'Folicular' ? 'Fase folicular' : phase === 'Ovulacion' ? 'Ovulación' : phase === 'Lutea' ? 'Fase lútea' : 'Menstruación'}
        </span>
        <h2 className="m-0 text-center text-lg font-extrabold">{energy.title}</h2>
        <p className="m-0 text-center text-sm leading-relaxed text-[#4A4F7A]">{energy.text}</p>
        <button type="button" onClick={onOpenPhase} className="cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">Ver tu fase en detalle</button>
      </section>
      <section className="flex flex-col gap-3 px-[18px] py-5">
        <button type="button" onClick={onRegister} className="flex items-center gap-3 rounded-[20px] bg-[#F6E27F] p-4 text-left text-[#1B1F5E]">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#1B1F5E] text-2xl text-[#F6E27F]">+</span>
          <span><strong className="block text-base">Registro de hoy</strong><span className="text-[13px]">Toma menos de un minuto</span></span>
        </button>
        <button type="button" onClick={onChat} className="flex items-center gap-3 rounded-[20px] bg-[#F49A9E] p-4 text-left text-[#1B1F5E]">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white text-xl text-[#3A44C4]">💬</span>
          <span><strong className="block text-base">Pregúntale a Cyclia</strong><span className="text-[13px]">Energía, rutina, alimentación</span></span>
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onMood} className="rounded-[20px] bg-white p-4 text-left">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#F6E27F] text-xl">☺</span>
            <strong className="block text-[15px]">¿Cómo te sientes?</strong>
            <span className="text-[13px] text-[#3B4070]">Registra tu humor en un toque</span>
          </button>
          <button type="button" onClick={onActivity} className="rounded-[20px] bg-white p-4 text-left">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#A9C4F0] text-lg">🏃</span>
            <strong className="block text-[15px]">Actividad de hoy</strong>
            <span className="text-[13px] text-[#3B4070]">{activityTitle}</span>
          </button>
        </div>
        <div className="rounded-[20px] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="m-0 text-base font-extrabold">Próximos días</h2>
            <button type="button" onClick={onCalendar} className="cursor-pointer text-sm font-extrabold text-[#3A44C4]">Calendario</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-[#4A4F7A]">
            {days.map((item) => (
              <span key={`${item.label}-${item.day}`} className="flex flex-col gap-1">
                {item.label}
                <span className="flex h-[34px] items-center justify-center rounded-full text-[#1B1F5E]" style={{ background: item.color, boxShadow: item.today ? 'inset 0 0 0 2px #1B1F5E' : undefined }}>{item.day}</span>
              </span>
            ))}
          </div>
          {ovulationNote && <p className="mb-0 mt-3 text-[13px] text-[#4A4F7A]">{ovulationNote}</p>}
        </div>
        <PrivacyClauses />
      </section>
    </div>
  );
}
