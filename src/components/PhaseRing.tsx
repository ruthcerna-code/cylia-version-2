import type { MenstrualPhase } from '../types';
import { getPhaseForDay, PHASE_DETAILS } from '../utils/cycle';

const ORDER = ['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'] as const;

function phaseArcs(periodLength: number, cycleLength: number) {
  const circumference = 2 * Math.PI * 70;
  const counts: Record<MenstrualPhase, number> = { Menstrual: 0, Folicular: 0, Ovulacion: 0, Lutea: 0 };
  for (let day = 1; day <= cycleLength; day += 1) {
    counts[getPhaseForDay(day, periodLength, cycleLength)] += 1;
  }
  let offset = 0;
  return ORDER.map((phase) => {
    const days = counts[phase];
    const length = (days / cycleLength) * circumference;
    const arc = { phase, days, color: PHASE_DETAILS[phase].bgHex, dash: `${length} ${circumference}`, offset: -offset };
    offset += length;
    return arc;
  });
}

export default function PhaseRing({
  cycleDay,
  cycleLength,
  periodLength,
  phase,
  showPhases,
  approximate = false,
  note = '',
}: {
  cycleDay: number;
  cycleLength: number;
  periodLength: number;
  phase: MenstrualPhase | null;
  showPhases: boolean;
  approximate?: boolean;
  note?: string;
}) {
  if (!showPhases || !phase || cycleLength < 1) {
    return (
      <section className="rounded-[20px] bg-[#FFF8EE] px-5 py-4 text-center">
        <p className="m-0 text-sm font-extrabold text-[#153E40]">Hoy</p>
        <p className="m-0 mt-1 text-sm leading-relaxed text-[#245456]">{note || 'Hoy manda cómo registras el día.'}</p>
      </section>
    );
  }

  const arcs = phaseArcs(periodLength, cycleLength);
  const current = PHASE_DETAILS[phase];
  const markerAngle = ((Math.min(cycleDay, cycleLength) / cycleLength) * Math.PI * 2) - Math.PI / 2;
  const markerX = 100 + 70 * Math.cos(markerAngle);
  const markerY = 100 + 70 * Math.sin(markerAngle);
  const summary = arcs.map((arc) => `${PHASE_DETAILS[arc.phase].name}, ${arc.days} días`).join('. ');

  return (
    <section className="flex flex-col items-center gap-3 bg-transparent px-2 py-1">
      <div className="relative aspect-square w-[min(168px,46vw)]">
        <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Día ${cycleDay} de ${cycleLength}, ${current.name}${approximate ? ' aproximada' : ''}. ${summary}.`}>
          <g transform="rotate(-90 100 100)" fill="none" strokeLinecap="butt">
            {arcs.map((arc) => (
              <circle key={arc.phase} cx="100" cy="100" r="70" stroke={arc.color} strokeWidth={arc.phase === phase ? 18 : 14} strokeDasharray={arc.dash} strokeDashoffset={arc.offset} />
            ))}
          </g>
          <circle cx={markerX} cy={markerY} r="7" fill="#FFF8EE" stroke="#153E40" strokeWidth="3" />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[#153E40]">
          <span className="font-serif text-[34px] leading-none">Día {cycleDay}</span>
          <span className="text-sm">de {cycleLength}</span>
        </div>
      </div>
      <span className="rounded-full px-4 py-1.5 text-sm font-semibold" style={{ background: current.bgHex, color: current.textHex }}>
        {current.badge}{approximate ? ' aproximada' : ''}
      </span>
    </section>
  );
}
