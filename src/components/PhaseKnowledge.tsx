import { useState } from 'react';
import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { getPhaseForDay } from '../utils/cycle';
import { analyzeCycle, projectCycleBoard } from '../utils/cycleModel';

type Mood = 'Serena' | 'Enfocada' | 'Radiante' | 'Reflexiva' | 'Sensible';

const PHASE_TITLE: Record<MenstrualPhase, string> = {
  Menstrual: 'Fase menstrual',
  Folicular: 'Fase folicular',
  Ovulacion: 'Fase ovulatoria',
  Lutea: 'Fase lútea',
};

const PHASE_LOOK: Record<MenstrualPhase, { bg: string; ink: string }> = {
  Menstrual: { bg: '#F49A9E', ink: '#1B1F5E' },
  Folicular: { bg: '#A9C4F0', ink: '#1B1F5E' },
  Ovulacion: { bg: '#F6E27F', ink: '#1B1F5E' },
  Lutea: { bg: '#3A44C4', ink: '#FFFFFF' },
};

const MOOD_COLOR: Record<Mood, string> = {
  Serena: '#F49A9E',
  Enfocada: '#A9C4F0',
  Radiante: '#F6E27F',
  Reflexiva: '#3A44C4',
  Sensible: '#1B1F5E',
};

const REFERENCE: Record<MenstrualPhase, { state: Mood; more: string }> = {
  Menstrual: {
    state: 'Serena',
    more: 'Muchas mujeres reportan más descanso y menos ganas de exigirse. No es una medición de tu energía.',
  },
  Folicular: {
    state: 'Enfocada',
    more: 'Muchas mujeres reportan más foco y más ganas de empezar cosas. Si tu registro marca otra energía, manda el registro.',
  },
  Ovulacion: {
    state: 'Radiante',
    more: 'Muchas mujeres reportan un ánimo más abierto. No es un cálculo de fertilidad ni de tu energía de hoy.',
  },
  Lutea: {
    state: 'Reflexiva',
    more: 'Muchas mujeres reportan un ritmo más pausado y, a ratos, más sensibilidad. Tu cansancio de hoy es el que marques.',
  },
};

function moodOf(log: DailyLog): Mood {
  if (log.feltState) return log.feltState;
  if (log.mood >= 4 || log.stress >= 4) return 'Sensible';
  if ((log.energy ?? 3) >= 4 && log.mood <= 2) return 'Radiante';
  if ((log.concentration ?? 3) >= 4) return 'Enfocada';
  if ((log.energy ?? 3) <= 3 && log.fatigue >= 3) return 'Reflexiva';
  return 'Serena';
}

function wellbeingOf(logs: DailyLog[]): number {
  const scores = logs.map((log) => {
    const energy = ((log.energy ?? 3) / 5) * 100;
    const rest = ((6 - log.fatigue) / 5) * 100;
    const mood = ((6 - log.mood) / 5) * 100;
    const calm = ((6 - log.stress) / 5) * 100;
    return (energy + rest + mood + calm) / 4;
  });
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function Bars({ bars }: { bars: Array<{ mood: Mood; pct: number }> }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
      {bars.map((bar) => (
        <li key={bar.mood} className="grid grid-cols-[88px_1fr_36px] items-center gap-2 text-[13px] font-bold text-[#1B1F5E]">
          <span>{bar.mood}</span>
          <span className="h-2 overflow-hidden rounded-full bg-[#E7EAF8]">
            <span className="block h-2 rounded-full" style={{ width: `${bar.pct}%`, background: MOOD_COLOR[bar.mood] }} />
          </span>
          <span className="text-right">{bar.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

export default function PhaseKnowledge({
  profile,
  periods,
  logs,
  userId = '',
  embedded = false,
}: {
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  userId?: string;
  embedded?: boolean;
}) {
  const board = projectCycleBoard(profile, periods);
  const windows = board.cycles[0]?.phases.length
    ? board.cycles[0].phases
    : (['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'] as const).flatMap((phase) => {
      const days: number[] = [];
      for (let day = 1; day <= board.projectedLength; day += 1) {
        if (getPhaseForDay(day, board.periodLength, board.projectedLength) === phase) days.push(day);
      }
      if (!days.length) return [];
      return [{ phase, fromDay: days[0], toDay: days[days.length - 1], start: '', end: '' }];
    });
  const today = analyzeCycle(profile, periods);
  const current = today.showPhases ? today.phase : null;
  const [chosen, setChosen] = useState<MenstrualPhase | 'none' | null>(null);
  const active = chosen === 'none' ? null : (chosen ?? current ?? windows[0]?.phase ?? null);
  const byPhase = new Map<MenstrualPhase, DailyLog[]>();
  Object.values(logs).forEach((log) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date)) return;
    const view = analyzeCycle(profile, periods, log.date);
    if (!view.showPhases || !view.phase) return;
    const list = byPhase.get(view.phase) || [];
    list.push(log);
    byPhase.set(view.phase, list);
  });
  const currentLook = current ? PHASE_LOOK[current] : null;
  const totalDays = windows.reduce((sum, phase) => sum + (phase.toDay - phase.fromDay + 1), 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      {!embedded && (
        <header className="rounded-[24px] bg-[#3A44C4] px-5 py-5 text-white">
          <p className="m-0 text-[12px] font-extrabold tracking-[0.16em] text-[#F9C4C6]">CYCLIA</p>
          <h1 className="m-0 mt-1 text-[26px] font-extrabold leading-tight">Conocimiento de la fase</h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-[#E3F1FB]">Cuatro momentos para leer el ciclo. No miden tu energía ni tu rendimiento.</p>
        </header>
      )}

      {current && currentLook ? (
        <section className="rounded-[24px] px-5 py-4" style={{ background: currentLook.bg, color: currentLook.ink }}>
          <p className="m-0 text-[12px] font-extrabold uppercase tracking-wide">Hoy</p>
          <p className="m-0 mt-1 text-[32px] font-extrabold leading-none">Día {today.cycleDay}</p>
          <p className="m-0 mt-2 text-base font-extrabold">{PHASE_TITLE[current]} · {REFERENCE[current].state}</p>
          <p className="m-0 mt-2 text-sm leading-relaxed">{REFERENCE[current].more}</p>
        </section>
      ) : (
        <p className="m-0 rounded-[24px] bg-white px-4 py-4 text-sm leading-relaxed text-[#1B1F5E]">{board.note} Abajo está la referencia de un ciclo de {board.projectedLength} días.</p>
      )}

      <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={windows.map((phase) => `${PHASE_TITLE[phase.phase]}, días ${phase.fromDay} a ${phase.toDay}`).join('. ')}>
        {windows.map((phase) => (
          <span
            key={phase.phase}
            style={{
              width: `${((phase.toDay - phase.fromDay + 1) / totalDays) * 100}%`,
              background: PHASE_LOOK[phase.phase].bg,
              boxShadow: phase.phase === current ? 'inset 0 0 0 2px #1B1F5E' : undefined,
            }}
          />
        ))}
      </div>
      <p className="m-0 -mt-1 text-[13px] font-semibold text-[#1B1F5E]">La barra suma {totalDays} días. Toca una fase para leerla.</p>

      <div className="flex flex-col gap-2">
        {windows.map((phase) => {
          const look = PHASE_LOOK[phase.phase];
          const reference = REFERENCE[phase.phase];
          const open = active === phase.phase;
          const own = byPhase.get(phase.phase) || [];
          const ownBars = (['Serena', 'Enfocada', 'Radiante', 'Reflexiva', 'Sensible'] as const)
            .map((mood) => ({ mood, pct: own.length ? Math.round(own.filter((log) => moodOf(log) === mood).length / own.length * 100) : 0 }))
            .filter((bar) => bar.pct > 0);
          return (
            <article key={phase.phase} className="overflow-hidden rounded-[22px] bg-white">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setChosen(open ? 'none' : phase.phase)}
                className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                style={{ background: look.bg, color: look.ink }}
              >
                <span>
                  <span className="block text-[18px] font-extrabold leading-tight">{reference.state}</span>
                  <span className="mt-0.5 block text-[13px] font-bold">{PHASE_TITLE[phase.phase]}</span>
                </span>
                <span className="ml-auto text-right text-[13px] font-extrabold">
                  Días {phase.fromDay}–{phase.toDay}
                  <span className="mt-0.5 block font-bold">{open ? 'Cerrar' : 'Leer'}</span>
                </span>
              </button>
              {open && (
                <div className="px-4 py-4">
                  {phase.phase === current && <p className="m-0 mb-2 text-[13px] font-extrabold text-[#3A44C4]">Esta es la fase de hoy.</p>}
                  <p className="m-0 text-sm leading-relaxed text-[#1B1F5E]">{reference.more}</p>
                  {own.length >= 2 ? (
                    <>
                      <p className="m-0 mt-3 text-[13px] font-extrabold text-[#1B1F5E]">En tus registros de estos días: {wellbeingOf(own)}% de bienestar</p>
                      <Bars bars={ownBars} />
                    </>
                  ) : (
                    <p className="m-0 mt-3 text-[13px] leading-relaxed text-[#3B4070]">Cuando tengas dos registros en estos días, aquí verás cómo te sentiste.</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <p className="m-0 text-[12px] leading-relaxed text-[#3B4070]">Cyclia es educativa. No diagnostica ni indica tratamientos.</p>
    </div>
  );
}
