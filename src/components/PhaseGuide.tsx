import { useEffect, useState } from 'react';
import type { MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { getPhaseForDay } from '../utils/cycle';
import { analyzeCycle, projectCycleBoard } from '../utils/cycleModel';

type Area = 'movimiento' | 'nutricion' | 'mente';

const AREAS: Array<{ id: Area | 'todas'; label: string; bg: string }> = [
  { id: 'todas', label: 'Todo', bg: '#FFFFFF' },
  { id: 'movimiento', label: 'Moverme', bg: '#F49A9E' },
  { id: 'nutricion', label: 'Comer', bg: '#A9C4F0' },
  { id: 'mente', label: 'Mente', bg: '#F6E27F' },
];

const PHASE_LOOK: Record<MenstrualPhase, { bg: string; ink: string }> = {
  Menstrual: { bg: '#F49A9E', ink: '#1B1F5E' },
  Folicular: { bg: '#A9C4F0', ink: '#1B1F5E' },
  Ovulacion: { bg: '#F6E27F', ink: '#1B1F5E' },
  Lutea: { bg: '#3A44C4', ink: '#FFFFFF' },
};

const BLOCK_TITLE: Record<Area, string> = {
  movimiento: 'Movimiento y entrenamiento',
  nutricion: 'Nutrición y micronutrientes',
  mente: 'Mente y estado',
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
    <div className="flex flex-col gap-3">
      <header className="rounded-[24px] bg-[#3A44C4] px-5 py-5 text-white">
        <p className="m-0 text-[12px] font-extrabold tracking-[0.16em] text-[#F9C4C6]">CYCLIA</p>
        <h1 className="m-0 mt-1 text-[26px] font-extrabold leading-tight">Bienestar</h1>
        <p className="m-0 mt-2 text-sm leading-relaxed text-[#E3F1FB]">Ideas para probar. Muchas mujeres las reportan en estos días. No son una orden.</p>
      </header>

      {todayPhase && todayLook ? (
        <section className="rounded-[24px] px-5 py-4" style={{ background: todayLook.bg, color: todayLook.ink }}>
          <p className="m-0 text-[12px] font-extrabold uppercase tracking-wide">Hoy · día {today.cycleDay}</p>
          <p className="m-0 mt-1 text-[22px] font-extrabold leading-tight">Fase {PHASE_NAME[todayPhase].toLowerCase()}</p>
          <p className="m-0 mt-2 text-sm leading-relaxed">Elige otra fase si quieres ver ideas distintas. Tu energía de hoy sigue siendo la que marques.</p>
        </section>
      ) : (
        <p className="m-0 rounded-[24px] bg-white px-4 py-4 text-sm leading-relaxed text-[#1B1F5E]">Elige una fase para ver ideas. Cyclia no estima una fase para hoy.</p>
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
              className="min-h-16 cursor-pointer rounded-[20px] px-3 py-3 text-left"
              style={{ background: look.bg, color: look.ink, boxShadow: on ? 'inset 0 0 0 3px #1B1F5E' : undefined }}
            >
              <span className="block text-[16px] font-extrabold">{PHASE_NAME[item.phase]}</span>
              <span className="mt-0.5 block text-[13px] font-bold">Días {item.fromDay}–{item.toDay}{item.phase === todayPhase ? ' · hoy' : ''}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {AREAS.map((item) => {
          const on = area === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => setArea(item.id)}
              className="min-h-14 cursor-pointer rounded-[18px] px-1 text-[13px] font-extrabold"
              style={{ background: on ? '#1B1F5E' : item.bg, color: on ? '#FFFFFF' : '#1B1F5E', boxShadow: on ? undefined : 'inset 0 0 0 1.5px #C9D3EF' }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {selected && <p className="m-0 text-sm font-extrabold text-[#1B1F5E]">Ideas de la fase {PHASE_NAME[phase].toLowerCase()}, días {selected.fromDay}–{selected.toDay}. Toca las que quieras probar.</p>}

      {blocks.map((block) => (
        <section key={block.id} className="flex flex-col gap-2">
          <h2 className="m-0 text-base font-extrabold text-[#1B1F5E]">{block.title}</h2>
          {block.items.map((item, index) => {
            const id = `${phase}:${block.id}:${index}`;
            const on = checked.includes(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(id)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[20px] px-3 py-3 text-left"
                style={{ background: on ? '#F6E27F' : '#FFFFFF' }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold" style={{ background: on ? '#1B1F5E' : '#E3F1FB', color: on ? '#F6E27F' : '#3A44C4' }}>{on ? '✓' : ''}</span>
                <span className="text-[15px] font-semibold leading-snug text-[#1B1F5E]">{item}</span>
              </button>
            );
          })}
        </section>
      ))}

      <p className="m-0 text-[12px] leading-relaxed text-[#3B4070]">Cyclia no mide hormonas. Estas ideas son educativas y no indican un tratamiento.</p>
    </div>
  );
}
