import { useState } from 'react';
import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import PhaseKnowledge from './PhaseKnowledge';
import { projectCycleBoard, type ForecastCycle } from '../utils/cycleModel';

const PHASE_STYLE: Record<MenstrualPhase, { title: string; text: string; dot: string; border: string }> = {
  Menstrual: {
    title: 'Fase menstrual',
    text: 'Inicio proyectado de la menstruación. Muchas mujeres reportan preferir un ritmo más lento.',
    dot: '#F49A9E',
    border: '#F49A9E',
  },
  Folicular: {
    title: 'Fase folicular',
    text: 'Muchas mujeres reportan más energía para empezar cosas y concentrarse.',
    dot: '#7FA8E8',
    border: '#A9C4F0',
  },
  Ovulacion: {
    title: 'Ovulación',
    text: 'Días alrededor de la ovulación estimada. No calcula fertilidad.',
    dot: '#E2C24A',
    border: '#F6E27F',
  },
  Lutea: {
    title: 'Fase lútea',
    text: 'Muchas mujeres reportan un ritmo más tranquilo para cerrar pendientes.',
    dot: '#3A44C4',
    border: '#3A44C4',
  },
};

function shortDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');
}

function monthTitle(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  const label = date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function CycleCard({ cycle, selected, onSelect }: { cycle: ForecastCycle; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-[240px] shrink-0 cursor-pointer flex-col rounded-[22px] p-4 text-left"
      style={{ background: selected ? '#1B1F5E' : '#FFFFFF', color: selected ? '#FFFFFF' : '#1B1F5E', border: selected ? 'none' : '1px solid #E1E5F5' }}
    >
      <span className="flex items-center justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wide">
        <span>Ciclo {cycle.number} · +{cycle.offset}</span>
        <span className="rounded-full px-2 py-0.5" style={{ background: selected ? 'rgba(255,255,255,0.16)' : '#F3F5FC' }}>
          {cycle.confidence == null ? 'Estimación' : `${cycle.confidence}% referencia`}
        </span>
      </span>
      <strong className="mt-3 block text-[22px] leading-tight">{monthTitle(cycle.start)}</strong>
      <span className="mt-1 text-[13px] font-semibold opacity-80">{shortDate(cycle.start)} – {shortDate(cycle.end)}</span>
      <span className="mt-4 flex items-center justify-between gap-2 text-[13px]">
        <span>Menstruación</span>
        <strong>{shortDate(cycle.bleedStart)} – {shortDate(cycle.bleedEnd)}</strong>
      </span>
      {cycle.ovulationDate && (
        <span className="mt-1 flex items-center justify-between gap-2 text-[13px]">
          <span>Ovulación estimada</span>
          <strong>{shortDate(cycle.ovulationDate)}</strong>
        </span>
      )}
    </button>
  );
}

export default function CycleProjectionScreen({
  profile,
  periods,
  logs,
  userId = '',
  onBack,
  onOpenCalendar,
}: {
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  userId?: string;
  onBack: () => void;
  onOpenCalendar: (date: string) => void;
}) {
  const board = projectCycleBoard(profile, periods);
  const [offset, setOffset] = useState(1);
  const selected = board.cycles.find((cycle) => cycle.offset === offset) || board.cycles[0];
  const history = board.sample >= 3
    ? `Basada en tus últimos ${board.sample} ciclos`
    : 'Primera predicción, todavía sin tres ciclos registrados';

  return (
    <section className="flex flex-col gap-4 pt-4">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Calendario</button>
      <p className="m-0 text-[13px] font-extrabold text-[#3A44C4]">Proyección del ciclo · {history}</p>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[26px] font-extrabold leading-tight">Proyección de los próximos 3 ciclos</h1>
        <p className="m-0 text-sm text-[#3B4070]">
          Duración media: {board.meanDays == null ? board.projectedLength : board.meanDays} días
          {board.meanDays != null && board.meanDays !== board.projectedLength ? ` · el calendario usa ${board.projectedLength}` : ''}
          {board.deviationDays == null ? ' · sin desviación todavía' : ` · desviación ±${board.deviationDays} días`}
        </p>
      </div>

      {board.predictionsPaused ? (
        <p className="m-0 rounded-[20px] bg-white p-4 text-sm leading-relaxed text-[#3B4070]">{board.note}</p>
      ) : (
        <>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {board.cycles.map((cycle) => (
              <CycleCard key={cycle.offset} cycle={cycle} selected={cycle.offset === selected.offset} onSelect={() => setOffset(cycle.offset)} />
            ))}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 text-[13px] font-extrabold text-[#4A4F7A]">Detalle del ciclo {selected.number} · {selected.length} días{board.deviationDays != null && board.deviationDays <= 1 ? ' · margen estimado ±1 día' : ''}</p>
              <h2 className="m-0 mt-1 text-[18px] font-extrabold">Del {shortDate(selected.start)} al {shortDate(selected.end)}</h2>
            </div>
            <button type="button" onClick={() => onOpenCalendar(selected.start)} className="shrink-0 cursor-pointer rounded-full bg-[#F6E27F] px-3 py-2 text-[12px] font-extrabold text-[#1B1F5E]">Ver en el calendario</button>
          </div>

          {board.showPhases ? (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              {selected.phases.map((phase) => {
                const style = PHASE_STYLE[phase.phase];
                return (
                  <article key={phase.phase} className="rounded-[18px] bg-white p-3.5" style={{ border: `1.5px solid ${style.border}` }}>
                    <div className="flex items-center justify-between gap-2">
                      <strong className="flex items-center gap-2 text-[14px]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: style.dot }} />{style.title}</strong>
                      <span className="text-[12px] font-bold text-[#4A4F7A]">Días {phase.fromDay}–{phase.toDay}</span>
                    </div>
                    <p className="m-0 mt-2 text-[13px] font-extrabold">{shortDate(phase.start)} – {shortDate(phase.end)}</p>
                    <p className="m-0 mt-1 text-[13px] leading-relaxed text-[#3B4070]">{style.text}</p>
                    {phase.phase === 'Ovulacion' && selected.ovulationDate && (
                      <p className="m-0 mt-2 text-[13px] font-extrabold text-[#1B1F5E]">Ovulación estimada: {shortDate(selected.ovulationDate)}</p>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="m-0 rounded-[20px] bg-white p-4 text-sm leading-relaxed text-[#3B4070]">{board.note}</p>
          )}

          <PhaseKnowledge profile={profile} periods={periods} logs={logs} userId={userId} />
          <p className="m-0 text-[12px] leading-relaxed text-[#4A4F7A]">
            {board.sample >= 3
              ? `Calculada con ${board.sample} ciclos de 21 a 45 días. `
              : 'Mientras no haya tres ciclos en ese rango, la primera predicción usa la duración de tu perfil. '}
            Las sugerencias aprenden de ti; no reemplazan consejo médico.
          </p>
        </>
      )}
    </section>
  );
}
