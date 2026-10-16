import React, { useMemo, useState } from 'react';
import { DailyLog, UserProfile } from '../types';
import { formatDateStr } from '../utils/cycle';

interface SymptomChartProps {
  logs: Record<string, DailyLog>;
  profile: UserProfile;
  onLoadDemoData: () => void;
}

type MetricKey = 'behavior' | 'mood' | 'stress' | 'pain' | 'sleepQuality' | 'fatigue';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'behavior', label: 'Comportamiento' },
  { key: 'mood', label: 'Ánimo' },
  { key: 'stress', label: 'Estrés' },
  { key: 'pain', label: 'Dolor' },
  { key: 'sleepQuality', label: 'Sueño' },
  { key: 'fatigue', label: 'Cansancio' },
];

export function behaviorValue(log: DailyLog): number {
  return (log.mood + log.stress + log.pain + log.sleepQuality + log.fatigue) / 5;
}

export function metricValue(log: DailyLog, key: MetricKey): number {
  return key === 'behavior' ? behaviorValue(log) : log[key];
}

export function lastWeekDates(today = new Date()): string[] {
  const end = new Date(today);
  end.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (6 - index));
    return formatDateStr(date);
  });
}

function formatAverage(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

function behaviorSentence(average: number): string {
  if (average <= 2) return 'La semana se ve estable: tus registros están cerca de sentirte mejor.';
  if (average <= 3.2) return 'La semana está en un punto medio. Conviene cuidar sueño y ritmo.';
  return 'La semana marca más cansancio, estrés o malestar. Prioriza descanso.';
}

export default function SymptomChart({ logs, onLoadDemoData }: SymptomChartProps) {
  const [selected, setSelected] = useState<MetricKey>('behavior');
  const week = useMemo(() => lastWeekDates().map((dateStr) => {
    const date = new Date(`${dateStr}T12:00:00`);
    const label = date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '');
    return { dateStr, label, day: date.getDate(), log: logs[dateStr] };
  }), [logs]);

  const logged = week.filter((day) => day.log);
  const values = logged.map((day) => metricValue(day.log as DailyLog, selected));
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const best = logged.reduce<{ label: string; value: number } | null>((winner, day) => {
    const value = metricValue(day.log as DailyLog, selected);
    if (!winner || value < winner.value) return { label: `${day.label} ${day.day}`, value };
    return winner;
  }, null);

  const width = 330;
  const height = 168;
  const left = 28;
  const right = 8;
  const top = 12;
  const bottom = 28;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const points = week.map((day, index) => {
    if (!day.log) return null;
    const value = metricValue(day.log, selected);
    const x = left + (index / 6) * plotWidth;
    const y = top + ((value - 1) / 4) * plotHeight;
    return { x, y, value };
  });
  const line = points.filter((point): point is { x: number; y: number; value: number } => point !== null)
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

  const metricAverages = METRICS.filter((metric) => metric.key !== 'behavior').map((metric) => {
    const series = logged.map((day) => metricValue(day.log as DailyLog, metric.key));
    const avg = series.reduce((sum, value) => sum + value, 0) / (series.length || 1);
    return { ...metric, avg: series.length ? avg : null };
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-[#4A4F7A]">Promedio de tus registros de los últimos 7 días. 1 es mejor y 5 es más difícil.</p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Indicador">
        {METRICS.map((metric) => {
          const on = metric.key === selected;
          return (
            <button
              key={metric.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelected(metric.key)}
              className="min-h-10 shrink-0 cursor-pointer rounded-full px-3.5 text-[13px] font-extrabold text-[#1B1F5E]"
              style={{ background: on ? '#F49A9E' : '#FFF6CF', border: `1.5px solid ${on ? '#E57F86' : '#F6E27F'}` }}
            >
              {metric.label}
            </button>
          );
        })}
      </div>

      {logged.length === 0 ? (
        <section className="rounded-[20px] bg-white p-5 text-center">
          <h2 className="m-0 text-base font-extrabold">Esta semana todavía no tiene registros</h2>
          <p className="mb-4 mt-2 text-sm leading-relaxed text-[#4A4F7A]">La gráfica usa solo los últimos 7 días. Guarda un registro para ver el promedio de tu comportamiento.</p>
          <button type="button" onClick={onLoadDemoData} className="h-11 cursor-pointer rounded-full bg-[#F6E27F] px-5 text-sm font-extrabold text-[#1B1F5E]">Cargar una semana de ejemplo</button>
        </section>
      ) : (
        <>
          <section className="rounded-[20px] bg-white p-3.5">
            <div className="mb-1 flex justify-between text-xs font-bold text-[#4A4F7A]">
              <span>Arriba: mejor (1)</span>
              <span>Abajo: peor (5)</span>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`Comportamiento de la última semana, promedio ${average === null ? 'sin datos' : formatAverage(average)} de 5`}>
              {[0, 1, 2, 3, 4].map((step) => {
                const y = top + (step / 4) * plotHeight;
                return <line key={step} x1={left} y1={y} x2={width - right} y2={y} stroke="#D5DCF2" strokeWidth="1" />;
              })}
              {[1, 3, 5].map((mark) => (
                <text key={mark} x={left - 6} y={top + ((mark - 1) / 4) * plotHeight + 3} textAnchor="end" fill="#4A4F7A" fontSize="10" fontWeight="700">{mark}</text>
              ))}
              {line && <path d={line} fill="none" stroke="#3A44C4" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
              {points.map((point, index) => point && (
                <circle key={week[index].dateStr} cx={point.x} cy={point.y} r="4.5" fill="#3A44C4" stroke="#FFFFFF" strokeWidth="2" />
              ))}
              {week.map((day, index) => (
                <text key={day.dateStr} x={left + (index / 6) * plotWidth} y={height - 6} textAnchor="middle" fill="#4A4F7A" fontSize="10" fontWeight="700">{day.day}</text>
              ))}
            </svg>
          </section>

          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white p-3">
              <span className="block text-xs font-bold text-[#4A4F7A]">Días</span>
              <span className="text-[22px] font-extrabold">{logged.length}</span>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <span className="block text-xs font-bold text-[#4A4F7A]">Promedio</span>
              <span className="text-[22px] font-extrabold">{average === null ? '—' : formatAverage(average)}</span>
            </div>
            <div className="rounded-2xl bg-white p-3">
              <span className="block text-xs font-bold text-[#4A4F7A]">Mejor día</span>
              <span className="text-base font-extrabold capitalize">{best?.label ?? '—'}</span>
            </div>
          </section>

          <section className="rounded-[18px] bg-white p-4">
            <h2 className="m-0 text-[15px] font-extrabold">Promedio de la semana</h2>
            <ul className="mb-0 mt-2 flex flex-col gap-1.5 text-sm">
              {metricAverages.map((metric) => (
                <li key={metric.key} className="flex items-center justify-between gap-3">
                  <span>{metric.label}</span>
                  <strong>{metric.avg === null ? '—' : formatAverage(metric.avg)}</strong>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[18px] bg-[#F6E27F] p-4">
            <h2 className="m-0 text-[15px] font-extrabold">Comportamiento</h2>
            <p className="mb-0 mt-1.5 text-sm leading-relaxed">
              {average === null
                ? 'Registra al menos un día de esta semana para calcular tu promedio.'
                : `Tu ${METRICS.find((metric) => metric.key === selected)?.label.toLowerCase()} de la última semana promedia ${formatAverage(average)} de 5. ${selected === 'behavior' ? behaviorSentence(average) : 'El cálculo usa solo los días que registraste en estos 7 días.'}`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
