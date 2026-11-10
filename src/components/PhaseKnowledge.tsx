import { useState } from 'react';
import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { getPhaseForDay } from '../utils/cycle';
import { analyzeCycle, projectCycleBoard } from '../utils/cycleModel';
import PhaseGuide from './PhaseGuide';

type Mood = 'Serena' | 'Enfocada' | 'Radiante' | 'Reflexiva' | 'Sensible';

const PHASE_TITLE: Record<MenstrualPhase, string> = {
  Menstrual: 'Fase menstrual',
  Folicular: 'Fase folicular',
  Ovulacion: 'Fase ovulatoria',
  Lutea: 'Fase lútea',
};

const MOOD_COLOR: Record<Mood, string> = {
  Serena: '#7FA8E8',
  Enfocada: '#3D9A6A',
  Radiante: '#E2A04A',
  Reflexiva: '#8B6BB8',
  Sensible: '#E06A6A',
};

const REFERENCE: Record<MenstrualPhase, { state: Mood; more: string }> = {
  Menstrual: {
    state: 'Serena',
    more: 'Muchas mujeres reportan más descanso y menos ganas de exigirse. Cyclia no mide hormonas: esta frase no es un análisis de laboratorio.',
  },
  Folicular: {
    state: 'Enfocada',
    more: 'Muchas mujeres reportan más foco y más ganas de empezar cosas. Cyclia no mide hormonas.',
  },
  Ovulacion: {
    state: 'Radiante',
    more: 'Muchas mujeres reportan un ánimo más abierto. No es un cálculo de fertilidad ni un análisis de laboratorio.',
  },
  Lutea: {
    state: 'Reflexiva',
    more: 'Muchas mujeres reportan un ritmo más reflexivo y, a ratos, más sensibilidad. Cyclia no mide hormonas.',
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
    <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
      {bars.map((bar) => (
        <li key={bar.mood} className="grid grid-cols-[88px_1fr_36px] items-center gap-2 text-[12px] font-bold text-[#3B4070]">
          <span>{bar.mood}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-[#E7EAF8]">
            <span className="block h-1.5 rounded-full" style={{ width: `${bar.pct}%`, background: MOOD_COLOR[bar.mood] }} />
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
}: {
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
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
  const byPhase = new Map<MenstrualPhase, DailyLog[]>();
  Object.values(logs).forEach((log) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date)) return;
    const view = analyzeCycle(profile, periods, log.date);
    if (!view.showPhases || !view.phase) return;
    const list = byPhase.get(view.phase) || [];
    list.push(log);
    byPhase.set(view.phase, list);
  });

  return (
    <section className="rounded-[20px] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-[18px] font-extrabold leading-tight">Conocimiento por fase</h2>
          <p className="m-0 mt-1 text-[13px] text-[#4A4F7A]">Referencia general, con los días de tu ciclo registrado.</p>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} className="shrink-0 cursor-pointer text-[13px] font-extrabold text-[#3A44C4]" aria-expanded={open}>
          {open ? 'Ver menos' : 'Ver más'}
        </button>
      </div>
      {!open && (
        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[13px] font-bold text-[#1B1F5E]">
          {windows.map((phase) => (
            <li key={phase.phase}>{REFERENCE[phase.phase].state} · días {phase.fromDay}–{phase.toDay}</li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          {!board.showPhases && <p className="m-0 text-[13px] leading-relaxed text-[#3B4070]">{board.note} Los rangos de abajo son la referencia de un ciclo de {board.projectedLength} días y una regla de {board.periodLength}.</p>}
          {windows.map((phase) => {
            const reference = REFERENCE[phase.phase];
            const own = byPhase.get(phase.phase) || [];
            const ownBars = (['Serena', 'Enfocada', 'Radiante', 'Reflexiva', 'Sensible'] as const)
              .map((mood) => ({ mood, pct: own.length ? Math.round(own.filter((log) => moodOf(log) === mood).length / own.length * 100) : 0 }))
              .filter((bar) => bar.pct > 0);
            const ownState = ownBars.slice().sort((a, b) => b.pct - a.pct)[0]?.mood;
            return (
              <article key={phase.phase} className="rounded-[18px] border border-[#E1E5F5] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <strong className="rounded-full bg-[#F8F9FE] px-3 py-1 text-[13px]">{PHASE_TITLE[phase.phase]}</strong>
                  <span className="text-[12px] font-bold text-[#4A4F7A]">Días {phase.fromDay} – {phase.toDay}</span>
                </div>
                <div className="mt-3 rounded-2xl bg-[#F8F9FE] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-[10px] font-extrabold uppercase tracking-wide text-[#4A4F7A]">Estado que muchas mujeres reportan</span>
                      <strong className="mt-1 block text-[16px]" style={{ color: MOOD_COLOR[own.length >= 2 && ownState ? ownState : reference.state] }}>
                        {own.length >= 2 && ownState ? ownState : reference.state}
                      </strong>
                    </span>
                    <span className="text-right">
                      <span className="block text-[10px] font-extrabold uppercase tracking-wide text-[#4A4F7A]">{own.length >= 2 ? 'Según tus registros' : 'Sin porcentaje'}</span>
                      <strong className="mt-1 block text-[22px]">{own.length >= 2 ? `${wellbeingOf(own)}%` : '—'}</strong>
                    </span>
                  </div>
                </div>
                {own.length >= 2 ? (
                  <>
                    <p className="m-0 mt-3 text-[13px] font-extrabold">Frecuencia según tus registros</p>
                    <Bars bars={ownBars} />
                  </>
                ) : (
                  <p className="m-0 mt-3 text-[13px] text-[#4A4F7A]">Todavía no hay dos registros en estos días, así que no hay un porcentaje propio.</p>
                )}
                <p className="m-0 mt-3 text-[13px] leading-relaxed text-[#3B4070]">{reference.more}</p>
              </article>
            );
          })}
          <PhaseGuide profile={profile} periods={periods} userId={userId} windows={windows} />
          <p className="m-0 text-[12px] leading-relaxed text-[#4A4F7A]">Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
        </div>
      )}
    </section>
  );
}
