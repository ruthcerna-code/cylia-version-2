import React from 'react';
import type { ActivityProposal } from '../../plan/proposal';
import { endClock } from '../../plan/proposal';

function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

export default function ProposalCard({
  proposal,
  start,
  onAccept,
  onAnother,
  onAdjust,
  onDiscard,
  anotherLeft,
  busy,
}: {
  proposal: ActivityProposal;
  start: string;
  onAccept: () => void;
  onAnother: () => void;
  onAdjust: () => void;
  onDiscard: () => void;
  anotherLeft: boolean;
  busy: boolean;
}) {
  const end = endClock(start, proposal.duracion_min);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-[#F8F9FE] p-4" aria-live="polite" aria-label="Propuesta de Cyclia">
      <p className="m-0 text-[12px] font-extrabold tracking-wide text-[#3A44C4]">PROPUESTA DE CYCLIA</p>
      <p className="m-0 text-[20px] font-extrabold text-[#1B1F5E]">{durationLabel(proposal.duracion_min)}</p>
      <p className="m-0 text-sm font-bold text-[#1B1F5E]">{start}–{end}</p>
      <p className="m-0 text-sm leading-relaxed text-[#3B4070]">{proposal.motivo}</p>
      {proposal.pasos.length > 0 && (
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm text-[#1B1F5E]">
          {proposal.pasos.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}
      {proposal.aviso && <p className="m-0 text-sm text-[#3B4070]">{proposal.aviso}</p>}
      {proposal.dividir_en_bloques && (
        <p className="m-0 text-sm text-[#3B4070]">Puedes partirla en bloques cortos, con una pausa entre medio.</p>
      )}
      <button type="button" disabled={busy} onClick={onAccept} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E] disabled:opacity-60">
        Sí, la acepto
      </button>
      <div className="grid grid-cols-1 gap-2">
        {anotherLeft && (
          <button type="button" disabled={busy} onClick={onAnother} className="flex h-11 cursor-pointer items-center justify-center rounded-full border border-[#C9D3EF] bg-white text-sm font-extrabold text-[#1B1F5E] disabled:opacity-60">
            Otra propuesta
          </button>
        )}
        <button type="button" disabled={busy} onClick={onAdjust} className="flex h-11 cursor-pointer items-center justify-center rounded-full border border-[#C9D3EF] bg-white text-sm font-extrabold text-[#1B1F5E] disabled:opacity-60">
          Ajustar yo
        </button>
        <button type="button" disabled={busy} onClick={onDiscard} className="flex h-11 cursor-pointer items-center justify-center rounded-full border border-[#C9D3EF] bg-white text-sm font-extrabold text-[#3A44C4] disabled:opacity-60">
          Descartar
        </button>
      </div>
    </section>
  );
}
