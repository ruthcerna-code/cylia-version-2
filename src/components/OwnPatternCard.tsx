import React, { useState } from 'react';
import type { DailyLog, PeriodRecord, UserProfile } from '../types';
import { findOwnPattern } from '../utils/ownPattern';
import { plusNoticeSeen } from '../plus/plusFeatures';
import { PlusBadge, usePlusNotice } from './PlusNotice';
import RecordCoverageNote from './RecordCoverageNote';

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
    <section aria-labelledby="tu-patron" className="flex flex-col gap-2 rounded-[20px] bg-[#FFF8EE] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="tu-patron" className="m-0 text-[26px] font-normal leading-[1.15] text-[#153E40]">Tus patrones</h2>
        <span className="text-2xl leading-none text-[#153E40]" aria-hidden="true">›</span>
      </div>
      {!open ? (
        <>
          <p className="m-0 text-sm text-[#245456]">Mira qué muestran tus propios registros sobre tu ciclo, tu sueño y tu energía. <PlusBadge /></p>
          <button
            type="button"
            onClick={() => { void requestPlus('patron_propio').then(() => setOpen(true)); }}
            className="mt-1 flex h-11 w-fit cursor-pointer items-center rounded-full bg-[#FCE883] px-5 text-sm font-extrabold text-[#153E40]"
          >
            Ver mi patrón
          </button>
        </>
      ) : (
        <>
          <RecordCoverageNote logs={logs} today={today} />
          <h3 className="m-0 text-xl font-normal text-[#153E40]">
            {pattern.ready ? 'Lo que dicen tus registros' : 'Todavía estamos conociéndote'}
          </h3>
          <p className="m-0 text-sm text-[#245456]">{pattern.message}</p>
          {!pattern.ready && (
            <p className="m-0 text-xs text-[#3E6466]">
              Llevas {pattern.records} {pattern.records === 1 ? 'registro' : 'registros'} con energía en {pattern.daysTracked} {pattern.daysTracked === 1 ? 'día' : 'días'}.
            </p>
          )}
          {pattern.findings.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {pattern.findings.map((finding) => (
                <li key={finding.id} className="rounded-2xl bg-[#F8F9FE] p-3">
                  <strong className="block text-[15px] text-[#153E40]">{finding.title}</strong>
                  <span className="block text-sm text-[#245456]">{finding.detail}</span>
                  <span className="mt-1 block text-xs font-bold text-[#069494]">
                    Lo respaldan {finding.records} {finding.records === 1 ? 'registro' : 'registros'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {pattern.ready && pattern.note && <p className="m-0 text-xs text-[#3E6466]">{pattern.note}</p>}
          <p className="m-0 text-xs text-[#3E6466]">Sale solo de lo que registraste. No es un diagnóstico.</p>
        </>
      )}
    </section>
  );
}
