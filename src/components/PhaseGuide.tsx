import { useEffect, useState } from 'react';
import type { MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { getPhaseForDay, PHASE_DETAILS } from '../utils/cycle';
import { analyzeCycle, projectCycleBoard } from '../utils/cycleModel';
import Cira from './Cira';

type Area = 'movimiento' | 'nutricion' | 'mente';

const AREAS: Array<{ id: Area | 'todas'; label: string; bg: string }> = [
  { id: 'todas', label: 'Todo', bg: '#FFFFFF' },
  { id: 'movimiento', label: 'Moverme', bg: '#FF8243' },
  { id: 'nutricion', label: 'Comer', bg: '#FFD3BC' },
  { id: 'mente', label: 'Mente', bg: '#FCE883' },
];

const PHASE_LOOK: Record<MenstrualPhase, { bg: string; ink: string; solid: string }> = {
  Menstrual: { bg: PHASE_DETAILS.Menstrual.cellHex, ink: PHASE_DETAILS.Menstrual.textHex, solid: PHASE_DETAILS.Menstrual.bgHex },
  Folicular: { bg: PHASE_DETAILS.Folicular.cellHex, ink: PHASE_DETAILS.Folicular.textHex, solid: PHASE_DETAILS.Folicular.bgHex },
  Ovulacion: { bg: PHASE_DETAILS.Ovulacion.cellHex, ink: PHASE_DETAILS.Ovulacion.textHex, solid: PHASE_DETAILS.Ovulacion.bgHex },
  Lutea: { bg: PHASE_DETAILS.Lutea.cellHex, ink: PHASE_DETAILS.Lutea.textHex, solid: PHASE_DETAILS.Lutea.bgHex },
};

const BLOCK_TITLE: Record<Area, string> = {
  movimiento: 'Movimiento',
  nutricion: 'Nutrición',
  mente: 'Mente',
};

const BLOCK_NOTE: Record<Area, string> = {
  movimiento: 'Ideas para moverte en estos días.',
  nutricion: 'Opciones que te dan calma y energía.',
  mente: 'Pequeños hábitos que te dan claridad.',
};

const FILTER_IDLE: Record<string, string> = {
  todas: '#FFF8EE',
  movimiento: '#FFF8EE',
  nutricion: '#FCE883',
  mente: '#D4F4F4',
};

const PHASE_NAME: Record<MenstrualPhase, string> = {
  Menstrual: 'Menstrual',
  Folicular: 'Folicular',
  Ovulacion: 'Ovulatoria',
  Lutea: 'Lútea',
};

const GUIDE: Record<MenstrualPhase, Record<Area, string[]>> = {
  Menstrual: {
    movimiento: [
      'Caminata suave o estiramientos, si el cuerpo lo pide.',
      'Yoga restaurativo o movilidad lenta.',
      'Dejar el esfuerzo alto para otro día.',
    ],
    nutricion: [
      'Comidas calientes y fáciles de digerir.',
      'Lentejas, hojas verdes u otros alimentos con hierro, si te apetecen.',
      'Agua o infusiones a lo largo del día.',
    ],
    mente: [
      'Menos reuniones exigentes, si puedes moverlas.',
      'Un rato corto para anotar cómo te sientes.',
      'Tareas simples, de a una.',
    ],
  },
  Folicular: {
    movimiento: [
      'Empezar una rutina de fuerza con un peso cómodo.',
      'Cardio moderado, si te sientes con ganas.',
      'Probar un movimiento nuevo, sin exigirte una marca.',
    ],
    nutricion: [
      'Comidas frescas, con verdura y una proteína que te siente bien.',
      'Semillas o frutos secos, si forman parte de lo que ya comes.',
      'Mantener horarios de comida regulares.',
    ],
    mente: [
      'Planear o empezar algo que venías postergando.',
      'Aprender una cosa concreta, en un bloque corto.',
      'Dejar por escrito la idea mientras está clara.',
    ],
  },
  Ovulacion: {
    movimiento: [
      'Entrenamiento por intervalos de alta intensidad, si hoy te sientes con energía.',
      'Levantamiento de peso y, si ya lo conoces, una marca personal.',
      'Actividad en grupo o un deporte dinámico.',
    ],
    nutricion: [
      'Vegetales como brócoli, coliflor o repollo.',
      'Alimentos con zinc: semillas de calabaza y huevo.',
      'Arándanos y cacao.',
    ],
    mente: [
      'Una conversación, una reunión o un encuentro, si te apetece.',
      'Una tarea que te pida hablar o decidir.',
      'Si el día está cargado, baja una cosa de la lista.',
    ],
  },
  Lutea: {
    movimiento: [
      'Bajar la intensidad y priorizar una caminata.',
      'Yoga o estiramientos en lugar de una marca nueva.',
      'Parar cuando aparezca el cansancio, aunque el plan dijera otra cosa.',
    ],
    nutricion: [
      'Comidas regulares, sin saltarte horarios.',
      'Algo que te resulte reconfortante y te deje satisfecha.',
      'Tener a mano una colación si el ánimo o la energía bajan.',
    ],
    mente: [
      'Cerrar un pendiente concreto.',
      'Dejar margen entre tareas.',
      'Anotar qué te irrita, sin resolverlo todo el mismo día.',
    ],
  },
};

function storageKey(userId: string) {
  return `cyclia_phase_guide_${userId || 'local'}`;
}

function phaseWindows(profile: UserProfile, periods: PeriodRecord[]) {
  const board = projectCycleBoard(profile, periods);
  if (board.cycles[0]?.phases.length) return board.cycles[0].phases;
  return (['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'] as const).flatMap((phase) => {
    const days: number[] = [];
    for (let day = 1; day <= board.projectedLength; day += 1) {
      if (getPhaseForDay(day, board.periodLength, board.projectedLength) === phase) days.push(day);
    }
    if (!days.length) return [];
    return [{ phase, fromDay: days[0], toDay: days[days.length - 1], start: '', end: '' }];
  });
}

export default function PhaseGuide({
  profile,
  periods,
  userId = '',
  windows,
}: {
  profile: UserProfile;
  periods: PeriodRecord[];
  userId?: string;
  windows?: Array<{ phase: MenstrualPhase; fromDay: number; toDay: number }>;
}) {
  const ranges = windows?.length ? windows : phaseWindows(profile, periods);
  const today = analyzeCycle(profile, periods);
  const fallback = ranges[0]?.phase || 'Menstrual';
  const [phase, setPhase] = useState<MenstrualPhase>(today.showPhases && today.phase ? today.phase : fallback);
  const [area, setArea] = useState<Area | 'todas'>('todas');
  const [checked, setChecked] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]');
      if (Array.isArray(saved)) setChecked(saved.filter((item) => typeof item === 'string'));
    } catch {
      setChecked([]);
    }
  }, [userId]);

  const toggle = (id: string) => {
    setChecked((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      try { localStorage.setItem(storageKey(userId), JSON.stringify(next)); } catch { /* El navegador puede bloquear el almacenamiento. */ }
      return next;
    });
  };

  const selected = ranges.find((item) => item.phase === phase) || ranges[0];
  const blocks = (['movimiento', 'nutricion', 'mente'] as const)
    .filter((id) => area === 'todas' || area === id)
    .map((id) => ({
      id,
      title: BLOCK_TITLE[id],
      items: GUIDE[phase][id],
    }));

  const todayPhase = today.showPhases ? today.phase : null;
  const todayLook = todayPhase ? PHASE_LOOK[todayPhase] : null;

  return (
    <div className="@container flex min-w-0 flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-[#153E40]">Cyclia</p>
          <h1 className="m-0 text-[36px] font-normal leading-[1.1] text-[#153E40]">Bienestar</h1>
          <p className="m-0 mt-1 max-w-[28ch] text-base leading-snug text-[#153E40]">Ideas para tu ciclo. Muchas mujeres las reportan útiles en estos días.</p>
        </div>
        <Cira size={92} />
      </header>

      {todayPhase && todayLook ? (
        <section className="rounded-[20px] bg-[#FFF8EE] px-4 py-4">
          <p className="m-0 text-sm text-[#153E40]">Hoy · Día {today.cycleDay}</p>
          <h2 className="m-0 mt-1 text-2xl font-normal leading-[1.2] text-[#153E40]">Fase {PHASE_NAME[todayPhase].toLowerCase()}</h2>
          <p className="m-0 mt-2 max-w-[40ch] text-base leading-snug text-[#153E40]">Elige otra fase si quieres ver ideas distintas. Tu energía de hoy sigue siendo la que marques.</p>
        </section>
      ) : (
        <p className="m-0 rounded-[20px] bg-[#FFF8EE] px-4 py-4 text-base leading-normal text-[#153E40]">Elige una fase para ver ideas. Cyclia no estima una fase para hoy.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {ranges.map((item) => {
          const look = PHASE_LOOK[item.phase];
          const on = phase === item.phase;
          return (
            <button
              key={item.phase}
              type="button"
              aria-pressed={on}
              onClick={() => setPhase(item.phase)}
              className="min-h-[72px] cursor-pointer rounded-[20px] px-3 py-2 text-left"
              style={{ background: look.solid, color: look.ink, boxShadow: on ? 'inset 0 0 0 2px #153E40' : undefined }}
            >
              <span className="block text-base font-semibold">{PHASE_NAME[item.phase]}</span>
              <span className="mt-0.5 block text-sm">Días {item.fromDay}–{item.toDay}{item.phase === todayPhase ? ' · Hoy' : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {AREAS.map((item) => {
          const on = area === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setArea(item.id)}
              className="h-11 min-w-[5.25rem] flex-1 cursor-pointer rounded-full px-3 text-sm font-semibold"
              style={{ background: on ? '#153E40' : FILTER_IDLE[item.id], color: on ? '#FFF8EE' : '#153E40' }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className={`grid min-w-0 grid-cols-1 gap-3 ${blocks.length > 1 ? '@min-[840px]:grid-cols-3' : ''}`}>
      {blocks.map((block) => (
        <section key={block.id} className="flex min-w-0 flex-col gap-3 rounded-[20px] bg-[#FFF8EE] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-2xl font-normal leading-[1.2] text-[#153E40]">{block.title}</h2>
              <p className="m-0 mt-1 text-sm leading-snug text-[#245456]">{BLOCK_NOTE[block.id]}</p>
            </div>
            <BlockIcon id={block.id} />
          </div>
          {block.items.map((item, index) => {
            const id = `${phase}:${block.id}:${index}`;
            const on = checked.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(id)}
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl bg-[#FCE883] px-3 py-2 text-left"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border-2 border-[#153E40] text-sm font-bold" style={{ background: on ? '#153E40' : 'transparent', color: '#FFF8EE' }}>{on ? '✓' : ''}</span>
                <span className="text-base leading-snug text-[#153E40]">{item}</span>
              </button>
            );
          })}
        </section>
      ))}
      </div>

      <p className="m-0 max-w-[65ch] text-sm leading-normal text-[#3E6466]">Cyclia no mide hormonas. Estas ideas son educativas y no indican un tratamiento.</p>
    </div>
  );
}

function BlockIcon({ id }: { id: 'movimiento' | 'nutricion' | 'mente' }) {
  const common = 'h-10 w-10 shrink-0';
  if (id === 'movimiento') {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
        <circle cx="22" cy="8" r="3" fill="none" stroke="#F48FB1" strokeWidth="2" />
        <path d="M14 34l6-10 4 4 6-8M12 18h8l4 4" fill="none" stroke="#F48FB1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'nutricion') {
    return (
      <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
        <path d="M10 18h16c0 8-3 12-8 12s-8-4-8-12z" fill="none" stroke="#F6C445" strokeWidth="2" />
        <path d="M16 14c0-4 2-6 2-6M20 12c1-3 4-4 4-4" fill="none" stroke="#F6C445" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" className={common} aria-hidden="true">
      <path d="M20 30c-6-6-10-9-10-14a6 6 0 0 1 10-4 6 6 0 0 1 10 4c0 5-4 8-10 14z" fill="none" stroke="#7EBFB4" strokeWidth="2" />
    </svg>
  );
}
