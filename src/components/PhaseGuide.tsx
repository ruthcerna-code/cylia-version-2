import { useEffect, useState } from 'react';
import type { MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { analyzeCycle } from '../utils/cycleModel';

type Area = 'movimiento' | 'nutricion' | 'mente';

const AREAS: Array<{ id: Area | 'todas'; label: string }> = [
  { id: 'todas', label: 'Todas las guías' },
  { id: 'movimiento', label: 'Entrenamiento' },
  { id: 'nutricion', label: 'Nutrición' },
  { id: 'mente', label: 'Mente y foco' },
];

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

export default function PhaseGuide({
  profile,
  periods,
  userId = '',
  windows,
}: {
  profile: UserProfile;
  periods: PeriodRecord[];
  userId?: string;
  windows: Array<{ phase: MenstrualPhase; fromDay: number; toDay: number }>;
}) {
  const today = analyzeCycle(profile, periods);
  const fallback = windows[0]?.phase || 'Menstrual';
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

  const selected = windows.find((item) => item.phase === phase) || windows[0];
  const blocks = (['movimiento', 'nutricion', 'mente'] as const)
    .filter((id) => area === 'todas' || area === id)
    .map((id) => ({
      id,
      title: BLOCK_TITLE[id],
      items: GUIDE[phase][id],
    }));

  return (
    <section className="rounded-[18px] border border-[#E1E5F5] p-3.5">
      <p className="m-0 text-[12px] font-extrabold text-[#3A44C4]">Guía · {today.showPhases && today.phase ? `Hoy la proyección te ubica en fase ${PHASE_NAME[today.phase].toLowerCase()}, día ${today.cycleDay}` : 'Usa la fase que quieras revisar'}</p>
      <h3 className="m-0 mt-1 text-[18px] font-extrabold">Recomendaciones de estilo de vida</h3>
      <p className="m-0 mt-1 text-[13px] leading-relaxed text-[#4A4F7A]">Marca las que quieras probar. Muchas mujeres las reportan en estos días. No son una orden ni una medición de hormonas.</p>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {AREAS.map((item) => (
          <button key={item.id} type="button" onClick={() => setArea(item.id)} className="h-9 shrink-0 cursor-pointer rounded-full px-3 text-[13px] font-extrabold" style={{ background: area === item.id ? '#1B1F5E' : '#F3F5FC', color: area === item.id ? '#FFFFFF' : '#1B1F5E' }}>{item.label}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto">
        {windows.map((item) => (
          <button key={item.phase} type="button" onClick={() => setPhase(item.phase)} className="h-10 shrink-0 cursor-pointer rounded-2xl px-3 text-[12px] font-extrabold" style={{ background: phase === item.phase ? '#1B1F5E' : '#FFFFFF', color: phase === item.phase ? '#FFFFFF' : '#1B1F5E', border: '1px solid #E1E5F5' }}>
            {PHASE_NAME[item.phase]}
            <span className="mt-0.5 block font-bold opacity-80">Días {item.fromDay}–{item.toDay}</span>
          </button>
        ))}
      </div>
      {selected && <p className="m-0 mt-3 text-[13px] font-extrabold text-[#1B1F5E]">Fase {PHASE_NAME[phase].toLowerCase()} · días {selected.fromDay}–{selected.toDay} de {today.averageLength}</p>}
      <div className="mt-3 flex flex-col gap-3">
        {blocks.map((block) => (
          <div key={block.id}>
            <h4 className="m-0 text-[14px] font-extrabold">{block.title}</h4>
            <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
              {block.items.map((item, index) => {
                const id = `${phase}:${block.id}:${index}`;
                return (
                  <li key={id}>
                    <label className="flex min-h-12 cursor-pointer items-start gap-2.5 rounded-2xl border px-3 py-3 text-[14px] leading-relaxed text-[#1B1F5E]" style={{ background: checked.includes(id) ? '#E7F6EA' : '#F8F9FE', borderColor: checked.includes(id) ? '#8FCB9B' : '#E1E5F5' }}>
                      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#2F8F4E]" checked={checked.includes(id)} onChange={() => toggle(id)} />
                      <span>{item}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#4A4F7A]">{phase === 'Menstrual' ? 'Algunas descripciones de estos días hablan de estrógeno y progesterona más bajos.' : phase === 'Folicular' ? 'Algunas descripciones de estos días hablan de un ascenso del estrógeno.' : phase === 'Ovulacion' ? 'Algunas descripciones de estos días hablan de un pico de estrógeno.' : 'Algunas descripciones de estos días hablan de la progesterona.'} Cyclia no mide tus hormonas. Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
    </section>
  );
}
