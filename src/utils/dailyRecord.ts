import type { DailyLog, SleepState } from '../types';
import { addCalendarDays } from './cycle';

/** Days in a row with mood and behavior before an analysis can lean on that base. */
export const CONTINUOUS_RECORD_DAYS = 30;
/** Saved days the analysis can read as the user's pattern. */
export const PATTERN_HISTORY_DAYS = 90;

export interface RecordPatternDay {
  date: string;
  /** Cómo amaneció: bien, regular o mal. */
  morning: SleepState | null;
  mood: number;
  felt: string | null;
  energy: number | null;
  pain: number;
  symptoms: string[];
  behavior: string;
}

/** The saved records up to `today`, oldest first. This is the pattern the analysis reads. */
export function recordPattern(logs: Record<string, DailyLog> | DailyLog[], today: string): RecordPatternDay[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return [];
  const from = addCalendarDays(today, -(PATTERN_HISTORY_DAYS - 1));
  const list = Array.isArray(logs) ? logs : Object.values(logs);
  return list
    .filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(log.date) && log.date >= from && log.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({
      date: log.date,
      morning: log.sleepState || null,
      mood: log.mood,
      felt: log.feltState || null,
      energy: typeof log.energy === 'number' ? log.energy : null,
      pain: log.pain,
      symptoms: (log.symptoms || []).slice(0, 8),
      behavior: (log.behavior || '').trim().slice(0, 120),
    }));
}

/** A day counts when she saved both a mood and a behavior note. Energy alone does not. */
export function hasMoodAndBehavior(log: DailyLog | undefined): boolean {
  if (!log || !/^\d{4}-\d{2}-\d{2}$/.test(log.date)) return false;
  const mood = (typeof log.mood === 'number' && log.mood >= 1 && log.mood <= 5) || Boolean(log.feltState);
  const behavior = Boolean((log.behavior || '').trim());
  return mood && behavior;
}

export interface RecordCoverage {
  /** Days up to `today` with mood and behavior. */
  registeredDays: number;
  /** Longest run of consecutive days with both. */
  continuousDays: number;
  continuous30: boolean;
}

export function recordCoverage(logs: Record<string, DailyLog> | DailyLog[], today: string): RecordCoverage {
  const list = Array.isArray(logs) ? logs : Object.values(logs);
  const dates = [...new Set(
    list
      .filter((log) => hasMoodAndBehavior(log) && log.date <= today)
      .map((log) => log.date),
  )].sort();
  let continuousDays = 0;
  let run = 0;
  let previous = '';
  for (const date of dates) {
    run = previous && addCalendarDays(previous, 1) === date ? run + 1 : 1;
    if (run > continuousDays) continuousDays = run;
    previous = date;
  }
  return {
    registeredDays: dates.length,
    continuousDays,
    continuous30: continuousDays >= CONTINUOUS_RECORD_DAYS,
  };
}

export function recordCoverageText(coverage: RecordCoverage): string {
  const days = coverage.registeredDays === 1 ? '1 día registrado' : `${coverage.registeredDays} días registrados`;
  const withMood = `${days} con ánimo y comportamiento.`;
  if (coverage.continuous30) {
    return `Hay ${withMood} La racha seguida más larga es de ${coverage.continuousDays} días.`;
  }
  const streak = coverage.continuousDays === 1 ? '1 día seguido' : `${coverage.continuousDays} días seguidos`;
  return `Hay ${withMood} La racha seguida más larga es de ${streak}. Sin un registro continuo de ${CONTINUOUS_RECORD_DAYS} días, el análisis puede tener errores.`;
}
