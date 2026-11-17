import React, { useEffect, useState } from 'react';
import type { DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../types';
import {
  BEHAVIOR_MIN_RECORDS,
  behaviorMonthLabel,
  behaviorTimeline,
  computeBehaviorParams,
  localBehaviorReport,
  type BehaviorReport,
} from '../utils/behavior';
import { fetchBehaviorEntries, saveBehaviorEntry, type BehaviorEntry } from '../firebase';
import { authBearer } from '../consentApi';
import { formatFriendlyDate } from '../utils/cycle';
import { PlusBadge, usePlusNotice } from './PlusNotice';

function ReportView({ report }: { report: BehaviorReport }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-[16px] font-extrabold text-[#1B1F5E]">{report.titulo}</h3>
      <p className="m-0 text-sm leading-relaxed text-[#3B4070]">{report.resumen}</p>
      {report.patrones.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {report.patrones.map((pattern, index) => (
            <li key={`${pattern.texto}-${index}`} className="rounded-2xl bg-[#F8F9FE] p-3">
              <span className="block text-sm font-semibold text-[#1B1F5E]">{pattern.texto}</span>
              {pattern.respaldo && <span className="mt-1 block text-xs font-bold text-[#3A44C4]">Lo respaldan {pattern.respaldo}</span>}
            </li>
          ))}
        </ul>
      )}
      {report.sugerencia && <p className="m-0 rounded-2xl bg-[#FFF6CF] px-3 py-2 text-sm text-[#1B1F5E]">{report.sugerencia}</p>}
      <p className="m-0 text-xs text-[#4A4F7A]">
        {report.fuente === 'ia'
          ? 'Lo escribió la IA de Cyclia a partir de las cifras de tu mes. No es un diagnóstico.'
          : 'Lo armó Cyclia con las cifras de tu mes, sin IA. No es un diagnóstico.'}
      </p>
    </div>
  );
}

export default function BehaviorReportCard({
  userId,
  profile,
  periods,
  logs,
  activities,
  assistantEnabled,
  today,
}: {
  userId: string;
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  activities: ScheduledActivity[];
  assistantEnabled: boolean;
  today: string;
}) {
  const requestPlus = usePlusNotice();
  const [entries, setEntries] = useState<BehaviorEntry[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  const timeline = behaviorTimeline(logs, today);
  const latest = timeline.completed[timeline.completed.length - 1];

  useEffect(() => {
    if (!latest) return;
    let active = true;
    fetchBehaviorEntries(userId)
      .then((rows) => { if (active) setEntries(rows); })
      .catch(() => { if (active) setEntries([]); });
    return () => { active = false; };
  }, [userId, latest?.index]);

  const latestEntry = latest ? entries.find((entry) => entry.block === latest.index && entry.report) : undefined;
  const earlier = entries.filter((entry) => entry.report && (!latest || entry.block < latest.index)).reverse();

  const generate = async () => {
    if (!latest || working) return;
    await requestPlus('patron_mensual');
    setWorking(true);
    setMessage('');
    try {
      const params = computeBehaviorParams(profile, periods, logs, activities, latest, today);
      const previousBlock = latest.index > 1 ? timeline.completed[latest.index - 2] : null;
      const previous = previousBlock
        ? entries.find((entry) => entry.block === previousBlock.index)?.params
          ?? computeBehaviorParams(profile, periods, logs, activities, previousBlock, today)
        : null;
      let report: BehaviorReport | null = null;
      if (params.recordDays >= BEHAVIOR_MIN_RECORDS && assistantEnabled) {
        try {
          const token = await authBearer();
          const response = await fetch('/api/behavior-pattern', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ actual: params, anterior: previous }),
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.report) report = data.report as BehaviorReport;
        } catch {
          report = null;
        }
      }
      if (!report) {
        report = localBehaviorReport(params, previous);
        if (!assistantEnabled && params.recordDays >= BEHAVIOR_MIN_RECORDS) {
          setMessage('No autorizaste el asistente de IA, así que Cyclia armó tu patrón sin IA.');
        }
      }
      const entry: BehaviorEntry = { block: latest.index, from: latest.from, to: latest.to, params, report, generatedAt: new Date().toISOString() };
      setEntries((current) => [...current.filter((item) => item.block !== entry.block), entry].sort((a, b) => a.block - b.block));
      try {
        await saveBehaviorEntry(userId, entry);
      } catch {
        setMessage('Tu patrón se muestra, pero no se pudo guardar en tu cuenta. Inténtalo más tarde.');
      }
    } finally {
      setWorking(false);
    }
  };

  return (
    <section aria-labelledby="patron-mensual" className="flex flex-col gap-2 rounded-[20px] bg-white p-4">
      <span className="flex items-center gap-2 text-xs font-extrabold tracking-wide text-[#4A4F7A]">TU PATRÓN DEL MES <PlusBadge /></span>
      {!timeline.firstDate && (
        <>
          <h2 id="patron-mensual" className="m-0 text-[17px] font-extrabold text-[#1B1F5E]">Cyclia estudia tu comportamiento mes a mes</h2>
          <p className="m-0 text-sm text-[#3B4070]">Cuando cumplas un mes registrando, la IA te contará qué patrón presentas en tu energía, tu sueño, tu ánimo y tus actividades.</p>
        </>
      )}
      {timeline.firstDate && !latest && (
        <>
          <h2 id="patron-mensual" className="m-0 text-[17px] font-extrabold text-[#1B1F5E]">Tu primer patrón mensual se está formando</h2>
          <p className="m-0 text-sm text-[#3B4070]">
            Llevas {timeline.daysTracked} {timeline.daysTracked === 1 ? 'día' : 'días'} desde tu primer registro. Tu patrón estará listo el {formatFriendlyDate(timeline.nextReportDate as string).toLocaleLowerCase('es')}
            {timeline.daysToNext != null ? ` (faltan ${timeline.daysToNext} ${timeline.daysToNext === 1 ? 'día' : 'días'})` : ''}.
          </p>
        </>
      )}
      {latest && !latestEntry && (
        <>
          <h2 id="patron-mensual" className="m-0 text-[17px] font-extrabold text-[#1B1F5E]">Ya cumpliste {behaviorMonthLabel(latest.index)} de registros</h2>
          <p className="m-0 text-sm text-[#3B4070]">Cyclia estudió tus registros del {formatFriendlyDate(latest.from).toLocaleLowerCase('es')} al {formatFriendlyDate(latest.to).toLocaleLowerCase('es')} y tiene listo el patrón que presentas.</p>
          <button
            type="button"
            disabled={working}
            onClick={() => { void generate(); }}
            className="mt-1 flex h-11 w-fit cursor-pointer items-center rounded-full bg-[#F6E27F] px-5 text-sm font-extrabold text-[#1B1F5E] disabled:opacity-50"
          >
            {working ? 'Estudiando tu mes…' : `Ver el patrón de ${behaviorMonthLabel(latest.index)}`}
          </button>
        </>
      )}
      {latestEntry?.report && (
        <>
          <span id="patron-mensual" className="sr-only">Tu patrón del mes</span>
          <ReportView report={latestEntry.report} />
          {timeline.nextReportDate && (
            <p className="m-0 text-xs text-[#4A4F7A]">El próximo patrón estará listo el {formatFriendlyDate(timeline.nextReportDate).toLocaleLowerCase('es')}.</p>
          )}
        </>
      )}
      {message && <p className="m-0 text-sm text-[#3B4070]" role="status">{message}</p>}
      {earlier.length > 0 && (
        <details className="rounded-2xl bg-[#F8F9FE] px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-extrabold text-[#3A44C4]">Meses anteriores ({earlier.length})</summary>
          <div className="flex flex-col gap-4 pb-2">
            {earlier.map((entry) => entry.report && <ReportView key={entry.block} report={entry.report} />)}
          </div>
        </details>
      )}
    </section>
  );
}
