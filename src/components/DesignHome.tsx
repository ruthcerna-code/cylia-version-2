import React from 'react';
import type { MenstrualPhase } from '../types';
import { formatDateStr, getCycleDay, getPhaseForDay } from '../utils/cycle';
import { PrivacyClauses } from './DesignScreens';

const PHASE_COLOR: Record<MenstrualPhase, string> = {
  Menstrual: '#FF8243',
  Folicular: '#FFD3BC',
  Ovulacion: '#FCE883',
  Lutea: '#069494',
};

const ENERGY: Record<MenstrualPhase, { title: string; text: string }> = {
  Menstrual: {
    title: 'Muchas mujeres reportan más descanso',
    text: 'Tu energía de hoy es la que marques en el registro.',
  },
  Folicular: {
    title: 'Muchas mujeres reportan más foco',
    text: 'Si tu registro marca otra energía, manda el registro.',
  },
  Ovulacion: {
    title: 'Muchas mujeres reportan un ánimo más abierto',
    text: 'No es una medición de energía ni de fertilidad.',
  },
  Lutea: {
    title: 'Muchas mujeres reportan un ritmo más lento',
    text: 'Tu cansancio de hoy es el que marques en el registro.',
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
  showPhases = true,
  approximate = false,
  statusNote = '',
  activityTitle,
  care,
  movement,
  onOpenPhase,
  onRegister,
  onChat,
  onMood,
  onActivity,
  onCalendar,
  offerPerimenopause = false,
  onActivatePerimenopause,
  onDeclinePerimenopause,
}: {
  name: string;
  dateLabel: string;
  todayStr: string;
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  lastPeriodDate: string;
  phase: MenstrualPhase;
  showPhases?: boolean;
  approximate?: boolean;
  statusNote?: string;
  activityTitle: string;
  care?: { foods: string[]; exercises: string[] };
  /** "Tu movimiento de hoy" for the "Salud física" focus. When present, it replaces the 3 exercises of care. */
  movement?: React.ReactNode;
  onOpenPhase: () => void;
  onRegister: () => void;
  onChat: () => void;
  onMood: () => void;
  onActivity: () => void;
  onCalendar: () => void;
  offerPerimenopause?: boolean;
  onActivatePerimenopause?: () => void;
  onDeclinePerimenopause?: () => void;
}) {
  const energy = showPhases ? ENERGY[phase] : { title: 'Hoy manda cómo te sientes', text: statusNote };
  const arcs = phaseArcs(periodLength, cycleLength);
  const markerAngle = ((Math.min(cycleDay, cycleLength) / Math.max(cycleLength, 1)) * Math.PI * 2) - Math.PI / 2;
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
    return { label: names[date.getDay()], day: date.getDate(), today: index === 0, color: showPhases ? PHASE_COLOR[dayPhase] : '#FFF1E8' };
  });
  let ovulationNote = '';
  if (showPhases) for (let index = 0; index < cycleLength; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateStr = formatDateStr(date);
    const dayOfCycle = getCycleDay(dateStr, lastPeriodDate, cycleLength);
    if (getPhaseForDay(dayOfCycle, periodLength, cycleLength) === 'Ovulacion') {
      const when = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
      ovulationNote = approximate ? `La ovulación estimada es aproximada, alrededor del ${when}.` : `Ovulación estimada alrededor del ${when}.`;
      break;
    }
  }

  return (
    <div className="flex flex-col">
      <header className="relative overflow-hidden rounded-[20px] bg-[#FFF8EE] px-6 py-6 text-[#153E40]">
        <span className="relative font-serif text-sm tracking-[0.14em] text-[#069494]">CYCLIA</span>
        <h1 className="relative mt-2 text-[36px] font-normal leading-[1.1]">Hola, {name}</h1>
        <p className="relative text-base text-[#3E6466]">{dateLabel}</p>
      </header>
      <section className="relative z-10 mx-[18px] mt-4 flex flex-col items-center gap-3 rounded-[20px] bg-[#FFF8EE] px-5 py-5">
        <div className="relative aspect-square w-[min(190px,62vw)]">
          <svg viewBox="0 0 200 200" className="h-full w-full" aria-label={`Día ${cycleDay} de ${cycleLength}`}>
            <g transform="rotate(-90 100 100)" fill="none" strokeWidth="16">
              {arcs.map((arc) => (
                <circle key={arc.phase} cx="100" cy="100" r="70" stroke={arc.color} strokeDasharray={arc.dash} strokeDashoffset={arc.offset} />
              ))}
            </g>
            <circle cx={markerX} cy={markerY} r="11" fill="#FFFFFF" stroke="#153E40" strokeWidth="3" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[13px] font-bold text-[#3E6466]">Día</span>
            <span className="font-serif text-[52px] leading-none text-[#069494]">{cycleDay}</span>
            <span className="text-[13px] font-bold text-[#3E6466]">de {cycleLength}</span>
          </div>
        </div>
        <span className="rounded-full px-4 py-1.5 text-sm font-extrabold text-[#153E40]" style={{ background: showPhases ? PHASE_COLOR[phase] : '#FFF1E8' }}>
          {showPhases
            ? `${phase === 'Folicular' ? 'Fase folicular' : phase === 'Ovulacion' ? 'Ovulación' : phase === 'Lutea' ? 'Fase lútea' : 'Menstruación'}${approximate ? ' aproximada' : ''}`
            : 'Según tu registro'}
        </span>
        <h2 className="m-0 text-center text-lg font-extrabold">{energy.title}</h2>
        <p className="m-0 text-center text-sm leading-relaxed text-[#3E6466]">{energy.text}</p>
        {showPhases && <button type="button" onClick={onOpenPhase} className="cursor-pointer text-[15px] font-extrabold text-[#069494]">Ver tu fase en detalle</button>}
      </section>
      <section className="flex flex-col gap-3 px-[18px] py-5">
        {offerPerimenopause && (
          <section className="rounded-[20px] bg-[#FFF8EE] p-4">
            <p className="m-0 text-sm font-semibold leading-relaxed text-[#153E40]">Tus ciclos están variando. Desde los 40 es esperable. ¿Quieres que Cyclia siga tu registro diario en vez del calendario?</p>
            <button type="button" onClick={onActivatePerimenopause} className="mt-3 flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-[15px] font-extrabold text-[#153E40]">Activar</button>
            <button type="button" onClick={onDeclinePerimenopause} className="mt-1 flex h-11 w-full cursor-pointer items-center justify-center text-sm font-extrabold text-[#069494]">Ahora no</button>
          </section>
        )}
        {care && (
          <section className="rounded-[20px] bg-[#FFF8EE] p-4">
            <h2 className="m-0 text-base font-extrabold">Alimentación y bienestar</h2>
            <p className="m-0 mt-2 text-[13px] font-extrabold text-[#153E40]">3 nutrientes</p>
            <ol className="m-0 mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[#245456]">
              {care.foods.map((item) => <li key={item}>{item}</li>)}
            </ol>
            {!movement && (
              <>
                <p className="m-0 mt-3 text-[13px] font-extrabold text-[#153E40]">3 ejercicios</p>
                <ol className="m-0 mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[#245456]">
                  {care.exercises.map((item) => <li key={item}>{item}</li>)}
                </ol>
              </>
            )}
            <p className="m-0 mt-2 text-[12px] leading-relaxed text-[#3E6466]">Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
          </section>
        )}
        {movement}
        <button type="button" onClick={onRegister} className="flex items-center gap-3 rounded-[20px] bg-[#FCE883] p-4 text-left text-[#153E40]">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#153E40] text-2xl text-[#FCE883]">+</span>
          <span><strong className="block text-base">Registro de hoy</strong><span className="text-[13px]">Toma menos de un minuto</span></span>
        </button>
        <button type="button" onClick={onChat} className="flex items-center gap-3 rounded-[20px] bg-[#FF8243] p-4 text-left text-[#153E40]">
          <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-[#FFF8EE] text-xl text-[#069494]">💬</span>
          <span><strong className="block text-base">Pregúntale a Cyclia</strong><span className="text-[13px]">Energía, rutina, alimentación</span></span>
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={onMood} className="rounded-[20px] bg-[#FFF8EE] p-4 text-left">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#FCE883] text-xl">☺</span>
            <strong className="block text-[15px]">¿Cómo te sientes?</strong>
            <span className="text-[13px] text-[#245456]">Registra tu humor en un toque</span>
          </button>
          <button type="button" onClick={onActivity} className="rounded-[20px] bg-[#FFF8EE] p-4 text-left">
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#FFD3BC] text-lg">🏃</span>
            <strong className="block text-[15px]">Actividad de hoy</strong>
            <span className="text-[13px] text-[#245456]">{activityTitle}</span>
          </button>
        </div>
        <div className="rounded-[20px] bg-[#FFF8EE] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="m-0 text-base font-extrabold">Próximos días</h2>
            <button type="button" onClick={onCalendar} className="cursor-pointer text-sm font-extrabold text-[#069494]">Calendario</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-[#3E6466]">
            {days.map((item) => (
              <span key={`${item.label}-${item.day}`} className="flex flex-col gap-1">
                {item.label}
                <span className="flex h-[34px] items-center justify-center rounded-full text-[#153E40]" style={{ background: item.color, boxShadow: item.today ? 'inset 0 0 0 2px #153E40' : undefined }}>{item.day}</span>
              </span>
            ))}
          </div>
          {ovulationNote && <p className="mb-0 mt-3 text-[13px] text-[#3E6466]">{ovulationNote}</p>}
        </div>
        <PrivacyClauses />
      </section>
    </div>
  );
}
