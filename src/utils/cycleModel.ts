import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';

interface PhaseFlags {
  hormonal: boolean;
  irregular: boolean;
  menopause: boolean;
}
import { habitualCycleDays, habitualPeriodDays } from './profileFields';
import { addCalendarDays, dayWithinCycle, formatDateStr, getCycleDay, getDaysDifference, getPhaseForDay, ovulationDay } from './cycle';

export type CycleMode = 'natural' | 'hormonal' | 'perimenopause' | 'menopause' | 'paused';

export interface CycleAlert {
  id: string;
  priority: 'alta' | 'media' | 'baja';
  message: string;
}

export interface CycleAnalysis {
  mode: CycleMode;
  showPhases: boolean;
  tasksUsePhases: boolean;
  approximate: boolean;
  predictionsPaused: boolean;
  cycleDay: number;
  averageLength: number;
  periodLength: number;
  regular: boolean | null;
  ovulationDay: number | null;
  phase: MenstrualPhase | null;
  lowerLoad: boolean;
  nextPeriod: string | null;
  delayDays: number;
  offerPerimenopause: boolean;
  alerts: CycleAlert[];
  note: string;
}

function sortedStarts(profile: UserProfile, periods: PeriodRecord[]): string[] {
  const starts = new Set<string>();
  if (/^\d{4}-\d{2}-\d{2}$/.test(profile.lastPeriodDate)) starts.add(profile.lastPeriodDate);
  periods.forEach((item) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.startDate)) starts.add(item.startDate);
  });
  return [...starts].sort();
}

function lengthsFrom(starts: string[]): Array<{ start: string; days: number }> {
  const rows: Array<{ start: string; days: number }> = [];
  for (let index = 1; index < starts.length; index += 1) {
    const days = getDaysDifference(starts[index], starts[index - 1]);
    if (days > 0) rows.push({ start: starts[index - 1], days });
  }
  return rows;
}

function averageLength(profile: UserProfile, rows: Array<{ days: number }>): number {
  const usable = rows.filter((item) => item.days >= 21 && item.days <= 45);
  if (usable.length >= 3) {
    const recent = usable.slice(-6);
    const average = Math.round(recent.reduce((sum, item) => sum + item.days, 0) / recent.length);
    if (average >= 21 && average <= 45) return average;
  }
  return habitualCycleDays(profile.cycleLength, profile.cycleLengthKnown !== false);
}

function bleedingLength(profile: UserProfile, periods: PeriodRecord[], start: string): number {
  const match = periods.find((item) => item.startDate === start && item.endDate);
  if (match?.endDate) {
    const days = getDaysDifference(match.endDate, match.startDate) + 1;
    if (days >= 1 && days <= 10) return days;
  }
  return habitualPeriodDays(profile.periodLength, profile.periodLengthKnown !== false);
}

function regularSpan(age: number): number {
  return age >= 26 && age <= 41 ? 9 : 7;
}

export function focusFlagsFor(profile: UserProfile, flags: PhaseFlags, periods: PeriodRecord[] = []): PhaseFlags {
  const cycle = analyzeCycle(profile, periods);
  return {
    hormonal: flags.hormonal || cycle.mode === 'hormonal',
    irregular: flags.irregular || cycle.regular === false,
    menopause: flags.menopause || cycle.mode === 'menopause' || cycle.mode === 'perimenopause' || cycle.mode === 'paused',
  };
}

export function analyzeCycle(
  profile: UserProfile,
  periods: PeriodRecord[] = [],
  onDate = formatDateStr(new Date()),
  logs: Record<string, DailyLog> = {},
): CycleAnalysis {
  const starts = sortedStarts(profile, periods);
  const anchor = starts.length ? starts[starts.length - 1] : profile.lastPeriodDate;
  const completed = lengthsFrom(starts);
  const length = averageLength(profile, completed);
  const bleed = bleedingLength(profile, periods, anchor);
  const elapsed = getCycleDay(onDate, anchor, length);
  const cycleDay = dayWithinCycle(elapsed, length);
  const daysSince = Math.max(getDaysDifference(onDate, anchor), 0);
  const recent = completed.filter((item) => getDaysDifference(onDate, item.start) <= 365);
  const span = recent.length >= 2 ? Math.max(...recent.map((item) => item.days)) - Math.min(...recent.map((item) => item.days)) : null;
  const regular = span == null ? null : span <= regularSpan(profile.age);
  const hormonal = Boolean(profile.hormonalMethod && profile.hormonalMethod !== 'ninguna');
  const situation = profile.specialSituation || 'ninguna';
  const paused = situation === 'embarazo' || situation === 'posparto_lactancia';
  const menopauseByTime = !paused && daysSince >= 365;
  const menopause = situation === 'sin_regla' || menopauseByTime;
  const lateTransition = profile.age >= 40 && daysSince >= 60 && !menopause && !paused;
  const periOn = profile.perimenopauseMode === 'on' || situation === 'terapia_hormonal' || lateTransition;
  const mode: CycleMode = paused
    ? 'paused'
    : menopause
      ? 'menopause'
      : periOn
        ? 'perimenopause'
        : hormonal
          ? 'hormonal'
          : 'natural';
  const showPhases = mode === 'natural';
  const approximate = showPhases && regular === false;
  const tasksUsePhases = showPhases && regular !== false;
  const predictionsPaused = mode === 'paused' || mode === 'menopause' || lateTransition;
  const ovulation = showPhases ? ovulationDay(length) : null;
  const phase = showPhases ? getPhaseForDay(cycleDay, bleed, length) : null;
  const nextPeriod = predictionsPaused ? null : addCalendarDays(anchor, length);
  const delayDays = nextPeriod && getDaysDifference(onDate, nextPeriod) > 0 ? getDaysDifference(onDate, nextPeriod) : 0;
  const latest = periods.find((item) => item.startDate === anchor);
  const strongPain = latest?.pain === 3 && phase === 'Menstrual';
  const lowerLoad = strongPain || (phase === 'Lutea' && cycleDay > length - 5);
  const consecutiveGaps = completed.slice(-10).filter((item, index, list) => index > 0 && Math.abs(item.days - list[index - 1].days) >= 7).length;
  const offerPerimenopause = profile.age >= 40
    && profile.perimenopauseMode !== 'on'
    && situation !== 'sin_regla'
    && !paused
    && (consecutiveGaps >= 2 || lateTransition);

  const alerts: CycleAlert[] = [];
  const spottingDates = Object.values(logs).filter((log) => log.spotting).map((log) => log.date);
  if (mode === 'menopause' && (spottingDates.length > 0 || (situation === 'sin_regla' && daysSince < 365))) {
    alerts.push({
      id: 'sangrado-menopausia',
      priority: 'alta',
      message: 'El sangrado después de la menopausia siempre debe revisarlo un profesional. Te recomendamos pedir hora pronto.',
    });
  }
  const bleedDays = latest?.endDate ? getDaysDifference(latest.endDate, latest.startDate) + 1 : null;
  if (latest?.volume === 'muy_abundante' || (bleedDays != null && bleedDays > 8)) {
    alerts.push({
      id: 'sangrado-abundante',
      priority: 'alta',
      message: 'Un sangrado así merece una consulta. Si te sientes mareada o muy cansada, consulta hoy.',
    });
  }
  const spottingCycles = new Set(spottingDates.map((date) => {
    const previous = [...starts].reverse().find((start) => start <= date);
    return previous || date;
  }));
  if (spottingCycles.size >= 2) {
    alerts.push({
      id: 'sangrado-entre-reglas',
      priority: 'media',
      message: 'Notamos sangrado entre reglas. Vale la pena comentarlo con tu ginecóloga.',
    });
  }
  const lastThree = completed.slice(-3);
  if (lastThree.length === 3 && lastThree.every((item) => item.days < 24)) {
    alerts.push({
      id: 'ciclos-cortos',
      priority: 'media',
      message: 'Tus ciclos están siendo más cortos de lo habitual. Te sugerimos consultarlo.',
    });
  }
  if (profile.age < 45 && !paused && mode !== 'menopause' && daysSince >= 90) {
    alerts.push({
      id: 'sin-regla-90',
      priority: 'media',
      message: 'Hace tiempo que no registras tu regla. Si no hay embarazo, conviene consultarlo.',
    });
  }
  const painful = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(-3);
  if (painful.length === 3 && painful.every((item) => item.pain === 3)) {
    alerts.push({
      id: 'dolor-repetido',
      priority: 'media',
      message: 'Un dolor fuerte y repetido no es algo que tengas que aguantar. Consúltalo.',
    });
  }
  if (delayDays >= 7 && regular === true && mode === 'natural') {
    alerts.push({
      id: 'retraso',
      priority: 'baja',
      message: 'Tu regla viene con retraso. Si existe posibilidad de embarazo, puedes hacerte un test.',
    });
  }

  const note = mode === 'paused'
    ? 'Las predicciones están en pausa por la situación que registraste. Al reanudar, se vuelven a calcular.'
    : mode === 'menopause'
      ? 'El calendario deja de predecir la regla. Cualquier sangrado conviene comentarlo con un profesional.'
      : mode === 'perimenopause'
        ? 'En esta etapa la variación del ciclo puede ser esperable. Las sugerencias salen de cómo registras el día.'
        : mode === 'hormonal'
          ? 'Con anticoncepción hormonal no se calculan ovulación ni fases. Las sugerencias salen de tu energía y tu ánimo.'
          : approximate
            ? 'Tus ciclos recientes varían. La fase de hoy es aproximada.'
            : 'La fase se estima con el inicio de la regla y la duración de tus ciclos.';

  return {
    mode,
    showPhases,
    tasksUsePhases,
    approximate,
    predictionsPaused,
    cycleDay,
    averageLength: length,
    periodLength: bleed,
    regular,
    ovulationDay: ovulation,
    phase,
    lowerLoad,
    nextPeriod,
    delayDays,
    offerPerimenopause,
    alerts,
    note,
  };
}

export interface PhaseWindow {
  phase: MenstrualPhase;
  fromDay: number;
  toDay: number;
  start: string;
  end: string;
}

export interface ForecastCycle {
  offset: number;
  number: number;
  start: string;
  end: string;
  length: number;
  bleedStart: string;
  bleedEnd: string;
  ovulationDate: string | null;
  phases: PhaseWindow[];
  confidence: number | null;
}

export interface CycleBoard {
  showPhases: boolean;
  predictionsPaused: boolean;
  note: string;
  sample: number;
  meanDays: number | null;
  projectedLength: number;
  periodLength: number;
  deviationDays: number | null;
  cycles: ForecastCycle[];
}

function phaseWindows(start: string, length: number, bleed: number): PhaseWindow[] {
  const order: MenstrualPhase[] = ['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'];
  return order.flatMap((phase) => {
    const days: number[] = [];
    for (let day = 1; day <= length; day += 1) {
      if (getPhaseForDay(day, bleed, length) === phase) days.push(day);
    }
    if (!days.length) return [];
    const fromDay = days[0];
    const toDay = days[days.length - 1];
    return [{
      phase,
      fromDay,
      toDay,
      start: addCalendarDays(start, fromDay - 1),
      end: addCalendarDays(start, toDay - 1),
    }];
  });
}

export function projectCycleBoard(profile: UserProfile, periods: PeriodRecord[] = [], onDate = formatDateStr(new Date())): CycleBoard {
  const view = analyzeCycle(profile, periods, onDate);
  const starts = sortedStarts(profile, periods);
  const anchor = starts.length ? starts[starts.length - 1] : profile.lastPeriodDate;
  const usable = lengthsFrom(starts).filter((item) => item.days >= 21 && item.days <= 45).slice(-6);
  const sample = usable.length;
  const meanExact = sample ? usable.reduce((sum, item) => sum + item.days, 0) / sample : null;
  const deviationDays = sample >= 3 && meanExact != null
    ? Math.round(Math.sqrt(usable.reduce((sum, item) => sum + (item.days - meanExact) ** 2, 0) / sample) * 10) / 10
    : null;
  const regularity = deviationDays == null || meanExact == null
    ? null
    : Math.max(50, Math.min(99, Math.round(100 - (deviationDays / meanExact) * 100)));
  const length = view.averageLength;
  const bleed = view.periodLength;
  const elapsed = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? getCycleDay(onDate, anchor, length) : 1;
  const steps = Math.max(0, Math.floor((elapsed - 1) / length));
  const currentStart = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? addCalendarDays(anchor, steps * length) : onDate;
  const recorded = starts.length;
  const cycles = Array.from({ length: 3 }, (_, index) => {
    const start = addCalendarDays(currentStart, index * length);
    const ovulation = view.showPhases ? addCalendarDays(start, ovulationDay(length) - 1) : null;
    return {
      offset: index + 1,
      number: Math.max(1, recorded + steps + index),
      start,
      end: addCalendarDays(start, length - 1),
      length,
      bleedStart: start,
      bleedEnd: addCalendarDays(start, bleed - 1),
      ovulationDate: ovulation,
      phases: view.showPhases ? phaseWindows(start, length, bleed) : [],
      confidence: regularity == null ? null : Math.max(50, regularity - index * 2),
    };
  });
  return {
    showPhases: view.showPhases,
    predictionsPaused: view.predictionsPaused,
    note: view.note,
    sample,
    meanDays: meanExact == null ? null : Math.round(meanExact * 10) / 10,
    projectedLength: length,
    periodLength: bleed,
    deviationDays,
    cycles,
  };
}
