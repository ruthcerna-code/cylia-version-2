import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { getDaysDifference } from './cycle';
import { PHASE_LABEL } from '../plan/dayContext';
import { analyzeCycle } from './cycleModel';
import { readSleep } from './recordCompare';

/** Days she needs to have been registering before Cyclia shows a pattern. */
export const PATTERN_MIN_DAYS = 14;
/** Records with energy needed inside the window. */
export const PATTERN_MIN_RECORDS = 10;
/** Records each compared group needs before it counts. */
export const PATTERN_MIN_GROUP = 4;
/** Smallest gap in average energy, on the 1–5 scale, that counts as a difference. */
export const PATTERN_MIN_GAP = 0.7;
/** Only the last 90 days are read. */
export const PATTERN_WINDOW_DAYS = 90;

export interface PatternFinding {
  id: 'sueno' | 'ciclo';
  title: string;
  detail: string;
  records: number;
}

export interface OwnPattern {
  ready: boolean;
  /** Records with energy inside the window. */
  records: number;
  /** Days since the first record in the window. */
  daysTracked: number;
  findings: PatternFinding[];
  /** One line when there is nothing to show: not ready yet, or no pattern. */
  message: string;
  /** Extra line, for example when the cycle mode has no phases. */
  note: string | null;
}

interface Row {
  date: string;
  energy: number;
  sleep: ReturnType<typeof readSleep>['kind'];
  phase: MenstrualPhase | null;
}

export function energyOf(log: DailyLog): number | null {
  if (typeof log.energy === 'number' && log.energy >= 1 && log.energy <= 5) return log.energy;
  // Fatigue goes 1 (ninguna) to 5 (extrema). Read it backwards when energy was not marked.
  if (typeof log.fatigue === 'number' && log.fatigue >= 1 && log.fatigue <= 5) return 6 - log.fatigue;
  return null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function oneDecimal(value: number): string {
  return (Math.round(value * 10) / 10).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function findOwnPattern(
  profile: UserProfile,
  periods: PeriodRecord[],
  logs: Record<string, DailyLog>,
  today: string,
): OwnPattern {
  const rows: Row[] = Object.values(logs)
    .filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(log.date) && log.date <= today)
    .filter((log) => getDaysDifference(today, log.date) < PATTERN_WINDOW_DAYS)
    .map((log) => {
      const energy = energyOf(log);
      if (energy == null) return null;
      const view = analyzeCycle(profile, periods, log.date, logs);
      return {
        date: log.date,
        energy,
        sleep: readSleep(log).kind,
        phase: view.showPhases ? view.phase : null,
      };
    })
    .filter((row): row is Row => row !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const records = rows.length;
  const daysTracked = records ? getDaysDifference(today, rows[0].date) + 1 : 0;

  if (daysTracked < PATTERN_MIN_DAYS || records < PATTERN_MIN_RECORDS) {
    const missingDays = Math.max(0, PATTERN_MIN_DAYS - daysTracked);
    const missingRecords = Math.max(0, PATTERN_MIN_RECORDS - records);
    const parts: string[] = [];
    if (missingDays) parts.push(plural(missingDays, 'día más', 'días más'));
    if (missingRecords) parts.push(plural(missingRecords, 'registro más con energía', 'registros más con energía'));
    return {
      ready: false,
      records,
      daysTracked,
      findings: [],
      message: `Tu patrón aparece después de 2 semanas de registros. Faltan ${parts.join(' y ')}.`,
      note: null,
    };
  }

  const findings: PatternFinding[] = [];

  const short = rows.filter((row) => row.sleep === 'corto');
  const enough = rows.filter((row) => row.sleep === 'suficiente' || row.sleep === 'largo');
  if (short.length >= PATTERN_MIN_GROUP && enough.length >= PATTERN_MIN_GROUP) {
    const shortAvg = mean(short.map((row) => row.energy));
    const enoughAvg = mean(enough.map((row) => row.energy));
    if (Math.abs(enoughAvg - shortAvg) >= PATTERN_MIN_GAP) {
      const higherWhenRested = enoughAvg > shortAvg;
      findings.push({
        id: 'sueno',
        title: higherWhenRested
          ? 'Cuando duermes bien, tu energía sube'
          : 'Dormir poco no te baja la energía',
        detail: `Los días con sueño corto o malo tu energía promedio es ${oneDecimal(shortAvg)} de 5. Los días con buen sueño, ${oneDecimal(enoughAvg)} de 5.`,
        records: short.length + enough.length,
      });
    }
  }

  let note: string | null = null;
  const withPhase = rows.filter((row) => row.phase);
  if (!withPhase.length) {
    note = 'Tu modo de ciclo no usa fases, así que este patrón no compara por fase.';
  } else {
    const groups = new Map<MenstrualPhase, number[]>();
    withPhase.forEach((row) => {
      const list = groups.get(row.phase as MenstrualPhase) || [];
      list.push(row.energy);
      groups.set(row.phase as MenstrualPhase, list);
    });
    const usable = [...groups.entries()]
      .filter(([, values]) => values.length >= PATTERN_MIN_GROUP)
      .map(([phase, values]) => ({ phase, avg: mean(values), count: values.length }))
      .sort((a, b) => b.avg - a.avg);
    if (usable.length >= 2) {
      const high = usable[0];
      const low = usable[usable.length - 1];
      if (high.avg - low.avg >= PATTERN_MIN_GAP) {
        findings.push({
          id: 'ciclo',
          title: `Tu energía es más alta en la fase ${PHASE_LABEL[high.phase]}`,
          detail: `En la fase ${PHASE_LABEL[high.phase]} promedias ${oneDecimal(high.avg)} de 5. En la fase ${PHASE_LABEL[low.phase]}, ${oneDecimal(low.avg)} de 5. La fase es una estimación por fechas, no una medición.`,
          records: high.count + low.count,
        });
      }
    } else {
      note = 'Todavía no hay suficientes registros en al menos dos fases para compararlas.';
    }
  }

  return {
    ready: true,
    records,
    daysTracked,
    findings,
    message: findings.length
      ? `Esto dicen tus ${plural(records, 'registro', 'registros')} de los últimos ${Math.min(daysTracked, PATTERN_WINDOW_DAYS)} días.`
      : `Con tus ${plural(records, 'registro', 'registros')} todavía no aparece un patrón claro entre ciclo, sueño y energía. No inventamos uno: seguimos mirando a medida que registras.`,
    note,
  };
}
