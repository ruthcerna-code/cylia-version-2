import React, { useState } from 'react';
import type { DailyLog, PeriodRecord, UserProfile } from '../types';
import { findOwnPattern } from '../utils/ownPattern';
import { plusNoticeSeen } from '../plus/plusFeatures';
import { PlusBadge, usePlusNotice } from './PlusNotice';

export default function OwnPatternCard({
  profile,
  periods,
  logs,
  today,
}: {
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  today: string;
}) {
  const requestPlus = usePlusNotice();
  // Plus feature: the content opens after the paid-option notice. Once she said OK, it stays open.
  const [open, setOpen] = useState(() => plusNoticeSeen('patron_propio'));
  const pattern = findOwnPattern(profile, periods, logs, today);
  return (
    <section aria-labelledby="tu-patron" className="flex flex-col gap-2 rounded-[20px] bg-white p-4">
      <span className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-[#4A4F7A]">TU PATRÓN PROPIO <PlusBadge /></span>
      {!open ? (
        <>
          <h2 id="tu-patron" className="m-0 text-[17px] font-extrabold text-[#1B1F5E]">Lo que dicen tus registros</h2>
          <p className="m-0 text-sm text-[#3B4070]">Mira qué muestran tus propios registros sobre tu ciclo, tu sueño y tu energía.</p>
          <button
            type="button"
            onClick={() => { void requestPlus('patron_propio').then(() => setOpen(true)); }}
            className="mt-1 flex h-11 w-fit cursor-pointer items-center rounded-full bg-[#F6E27F] px-5 text-sm font-extrabold text-[#1B1F5E]"
          >
            Ver mi patrón
          </button>
        </>
      ) : (
        <>
          <h2 id="tu-patron" className="m-0 text-[17px] font-extrabold text-[#1B1F5E]">
            {pattern.ready ? 'Lo que dicen tus registros' : 'Todavía estamos conociéndote'}
          </h2>
          <p className="m-0 text-sm text-[#3B4070]">{pattern.message}</p>
          {!pattern.ready && (
            <p className="m-0 text-xs text-[#4A4F7A]">
              Llevas {pattern.records} {pattern.records === 1 ? 'registro' : 'registros'} con energía en {pattern.daysTracked} {pattern.daysTracked === 1 ? 'día' : 'días'}.
            </p>
          )}
          {pattern.findings.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {pattern.findings.map((finding) => (
                <li key={finding.id} className="rounded-2xl bg-[#F8F9FE] p-3">
                  <strong className="block text-[15px] text-[#1B1F5E]">{finding.title}</strong>
                  <span className="block text-sm text-[#3B4070]">{finding.detail}</span>
                  <span className="mt-1 block text-xs font-bold text-[#3A44C4]">
                    Lo respaldan {finding.records} {finding.records === 1 ? 'registro' : 'registros'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {pattern.ready && pattern.note && <p className="m-0 text-xs text-[#4A4F7A]">{pattern.note}</p>}
          <p className="m-0 text-xs text-[#4A4F7A]">Sale solo de lo que registraste. No es un diagnóstico.</p>
        </>
      )}
    </section>
  );
}
