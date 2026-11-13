import type { DailyLog, PeriodRecord, UserProfile } from '../types';
import { sleepHours } from './recordCompare';
import { analyzeCycle } from './cycleModel';

export type AnalysisLog = {
  date: string;
  energy: number | null;
  concentration: number | null;
  fatigue: number;
  sleepQuality: number;
  sleepState: string | null;
  sleepHours: number | null;
  sleepDetails: string;
  mood: number;
  stress: number;
  pain: number;
  symptoms: string[];
  spotting: boolean;
  cervicalFluid: string | null;
  feltState: string | null;
  energyFeel: string | null;
  headache: string | null;
  bloating: string | null;
  breastSensitivity: string | null;
  pelvicCramps: string | null;
  notes: string;
  behavior: string;
};

export type AnalysisContext = {
  cycleLength: number;
  periodLength: number;
  showPhases: boolean;
  phase: string | null;
  cycleDay: number | null;
  approximate: boolean;
  mode: string;
  note: string;
  hormonalMethod: string;
  specialSituation: string;
  conditions: {
    celiac: boolean;
    diabetes: boolean;
    obesity: boolean;
    depression: boolean;
  };
  log: AnalysisLog | null;
  recent: AnalysisLog[];
};

const PHASE_NAME = {
  Menstrual: 'Menstrual',
  Folicular: 'Folicular',
  Ovulacion: 'Ovulación',
  Lutea: 'Lútea',
} as const;

export function logForAnalysis(log: DailyLog): AnalysisLog {
  return {
    date: log.date,
    energy: log.energy ?? null,
    concentration: log.concentration ?? null,
    fatigue: log.fatigue,
    sleepQuality: log.sleepQuality,
    sleepState: log.sleepState || null,
    sleepHours: sleepHours(log.sleepDetails || ''),
    sleepDetails: log.sleepDetails || '',
    mood: log.mood,
    stress: log.stress,
    pain: log.pain,
    symptoms: log.symptoms || [],
    spotting: Boolean(log.spotting),
    cervicalFluid: log.cervicalFluid || null,
    feltState: log.feltState || null,
    energyFeel: log.energyFeel || null,
    headache: log.headache || null,
    bloating: log.bloating || null,
    breastSensitivity: log.breastSensitivity || null,
    pelvicCramps: log.pelvicCramps || null,
    notes: log.additionalNotes || '',
    behavior: log.behavior || '',
  };
}

export function buildAnalysisContext(
  profile: UserProfile,
  periods: PeriodRecord[],
  logs: Record<string, DailyLog> | DailyLog[],
  focusDate?: string,
): AnalysisContext {
  const record = Array.isArray(logs)
    ? Object.fromEntries(logs.filter((item) => item.date).map((item) => [item.date, item]))
    : logs;
  const date = focusDate;
  const view = analyzeCycle(profile, periods, date);
  const recent = Object.values(record)
    .filter((item) => item.date && item.date !== date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-4)
    .map(logForAnalysis);
  return {
    cycleLength: view.averageLength,
    periodLength: view.periodLength,
    showPhases: view.showPhases,
    phase: view.showPhases && view.phase ? PHASE_NAME[view.phase] : null,
    cycleDay: view.showPhases ? view.cycleDay : null,
    approximate: view.approximate,
    mode: view.mode,
    note: view.note,
    hormonalMethod: profile.hormonalMethod || 'ninguna',
    specialSituation: profile.specialSituation || 'ninguna',
    conditions: {
      celiac: Boolean(profile.isCeliac),
      diabetes: Boolean(profile.hasDiabetes),
      obesity: Boolean(profile.hasObesity),
      depression: Boolean(profile.hasDepression),
    },
    log: date && record[date] ? logForAnalysis(record[date]) : null,
    recent,
  };
}
