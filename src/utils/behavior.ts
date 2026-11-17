import type { CycleSymptom, DailyLog, MenstrualPhase, PeriodRecord, ScheduledActivity, UserProfile } from '../types';
import { addCalendarDays, getDaysDifference } from './cycle';
import { analyzeCycle } from './cycleModel';
import { readSleep } from './recordCompare';
import { energyOf } from './ownPattern';
import { energyBandFromLog, PHASE_LABEL } from '../plan/dayContext';

/** A "month" of records is 30 days counted from her first record. */
export const BEHAVIOR_BLOCK_DAYS = 30;
/** Records needed inside a month before Cyclia describes a pattern. */
export const BEHAVIOR_MIN_RECORDS = 10;

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const SYMPTOM_LABEL: Record<CycleSymptom, string> = {
  colicos: 'cólicos',
  dolor_cabeza: 'dolor de cabeza',
  hinchazon: 'hinchazón',
  sensibilidad_mamaria: 'sensibilidad mamaria',
  antojos: 'antojos',
  irritabilidad: 'irritabilidad',
  bochornos: 'bochornos',
  sudores_nocturnos: 'sudores nocturnos',
  sequedad_vaginal: 'sequedad vaginal',
};

export interface BehaviorBlock {
  /** 1 is her first month of records. */
  index: number;
  from: string;
  to: string;
}

export interface BehaviorTimeline {
  firstDate: string | null;
  daysTracked: number;
  /** Months already complete, oldest first. */
  completed: BehaviorBlock[];
  /** Day the next monthly pattern becomes available. */
  nextReportDate: string | null;
  daysToNext: number | null;
}

type Counted = { planned: number; done: number };

/** Behavior parameters of one month. Only aggregates: no free text, name or contact data. */
export interface BehaviorParams {
  block: number;
  from: string;
  to: string;
  cycleMode: string;
  recordDays: number;
  /** Percentage of the 30 days with a record. */
  coverage: number;
  averages: {
    energy: number | null;
    mood: number | null;
    stress: number | null;
    fatigue: number | null;
    pain: number | null;
    sleepQuality: number | null;
  };
  lowEnergyDays: number;
  sleep: {
    daysWithHours: number;
    averageHours: number | null;
    shortDays: number;
    energyAfterShortSleep: number | null;
    energyAfterGoodSleep: number | null;
  };
  weekdays: { best: string | null; bestEnergy: number | null; worst: string | null; worstEnergy: number | null };
  phases: Array<{ phase: string; records: number; energy: number }>;
  symptoms: Array<{ name: string; days: number }>;
  activities: {
    planned: number;
    done: number;
    notDone: number;
    completionRate: number | null;
    byEffort: { bajo: Counted; medio: Counted; alto: Counted };
    onLowEnergyDays: Counted;
    onGoodEnergyDays: Counted;
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number | null {
  return values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Where she is in her months of records, counted from the first record. */
export function behaviorTimeline(logs: Record<string, DailyLog>, today: string): BehaviorTimeline {
  const dates = Object.values(logs).map((log) => log.date).filter((date) => validDate(date) && date <= today).sort();
  const firstDate = dates[0] ?? null;
  if (!firstDate) return { firstDate: null, daysTracked: 0, completed: [], nextReportDate: null, daysToNext: null };
  const daysTracked = getDaysDifference(today, firstDate) + 1;
  const count = Math.floor((daysTracked - 1) / BEHAVIOR_BLOCK_DAYS);
  const completed = Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    from: addCalendarDays(firstDate, i * BEHAVIOR_BLOCK_DAYS),
    to: addCalendarDays(firstDate, (i + 1) * BEHAVIOR_BLOCK_DAYS - 1),
  }));
  const nextReportDate = addCalendarDays(firstDate, (count + 1) * BEHAVIOR_BLOCK_DAYS);
  return { firstDate, daysTracked, completed, nextReportDate, daysToNext: getDaysDifference(nextReportDate, today) };
}

function count(list: ScheduledActivity[]): Counted {
  return { planned: list.length, done: list.filter((item) => item.planStatus === 'hecha').length };
}

/** Computes the behavior parameters of one month from her records and activities. */
export function computeBehaviorParams(
  profile: UserProfile,
  periods: PeriodRecord[],
  logs: Record<string, DailyLog>,
  activities: ScheduledActivity[],
  block: BehaviorBlock,
  today: string,
): BehaviorParams {
  const inBlock = Object.values(logs)
    .filter((log) => validDate(log.date) && log.date >= block.from && log.date <= block.to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const energies = inBlock.map((log) => energyOf(log)).filter((value): value is number => value != null);
  const scale = (pick: (log: DailyLog) => number | undefined) => mean(inBlock
    .map(pick)
    .filter((value): value is number => typeof value === 'number' && value >= 1 && value <= 5));

  const sleepRows = inBlock.map((log) => ({ sleep: readSleep(log), energy: energyOf(log) }));
  const hours = sleepRows.map((row) => row.sleep.hours).filter((value): value is number => value != null);
  const shortEnergy = sleepRows.filter((row) => row.sleep.kind === 'corto' && row.energy != null).map((row) => row.energy as number);
  const goodEnergy = sleepRows.filter((row) => (row.sleep.kind === 'suficiente' || row.sleep.kind === 'largo') && row.energy != null).map((row) => row.energy as number);

  const byWeekday = new Map<number, number[]>();
  inBlock.forEach((log) => {
    const energy = energyOf(log);
    if (energy == null) return;
    const day = new Date(`${log.date}T12:00:00`).getDay();
    byWeekday.set(day, [...(byWeekday.get(day) || []), energy]);
  });
  const weekdayAverages = [...byWeekday.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([day, values]) => ({ day, energy: mean(values) as number }))
    .sort((a, b) => b.energy - a.energy);
  const best = weekdayAverages[0];
  const worst = weekdayAverages[weekdayAverages.length - 1];
  // A weekday difference counts only when it is clear, the same 0.7 used by Tu patrón propio.
  const weekdaysDiffer = Boolean(best && worst && best.day !== worst.day && best.energy - worst.energy >= 0.7);

  const phaseGroups = new Map<MenstrualPhase, number[]>();
  let cycleMode = analyzeCycle(profile, periods, block.to, logs).mode;
  inBlock.forEach((log) => {
    const view = analyzeCycle(profile, periods, log.date, logs);
    cycleMode = view.mode;
    const energy = energyOf(log);
    if (!view.showPhases || !view.phase || energy == null) return;
    phaseGroups.set(view.phase, [...(phaseGroups.get(view.phase) || []), energy]);
  });
  const phases = [...phaseGroups.entries()]
    .map(([phase, values]) => ({ phase: PHASE_LABEL[phase], records: values.length, energy: mean(values) as number }))
    .sort((a, b) => b.energy - a.energy);

  const symptomCount = new Map<CycleSymptom, number>();
  inBlock.forEach((log) => (log.symptoms || []).forEach((code) => symptomCount.set(code, (symptomCount.get(code) || 0) + 1)));
  const symptoms = [...symptomCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, days]) => ({ name: SYMPTOM_LABEL[code] || code, days }));

  const blockActivities = activities.filter((item) => item.date >= block.from && item.date <= block.to);
  const done = blockActivities.filter((item) => item.planStatus === 'hecha').length;
  const notDone = blockActivities.filter((item) => item.planStatus === 'pospuesta' || (item.planStatus !== 'hecha' && item.date < today)).length;
  const bandOf = (date: string) => energyBandFromLog(logs[date]);

  return {
    block: block.index,
    from: block.from,
    to: block.to,
    cycleMode,
    recordDays: inBlock.length,
    coverage: Math.round((inBlock.length / BEHAVIOR_BLOCK_DAYS) * 100),
    averages: {
      energy: mean(energies),
      mood: scale((log) => log.mood),
      stress: scale((log) => log.stress),
      fatigue: scale((log) => log.fatigue),
      pain: scale((log) => log.pain),
      sleepQuality: scale((log) => log.sleepQuality),
    },
    lowEnergyDays: energies.filter((value) => value <= 2).length,
    sleep: {
      daysWithHours: hours.length,
      averageHours: mean(hours),
      shortDays: sleepRows.filter((row) => row.sleep.kind === 'corto').length,
      energyAfterShortSleep: shortEnergy.length >= 3 ? mean(shortEnergy) : null,
      energyAfterGoodSleep: goodEnergy.length >= 3 ? mean(goodEnergy) : null,
    },
    weekdays: {
      best: weekdaysDiffer ? WEEKDAYS[best.day] : null,
      bestEnergy: weekdaysDiffer ? best.energy : null,
      worst: weekdaysDiffer ? WEEKDAYS[worst.day] : null,
      worstEnergy: weekdaysDiffer ? worst.energy : null,
    },
    phases,
    symptoms,
    activities: {
      planned: blockActivities.length,
      done,
      notDone,
      completionRate: blockActivities.length ? Math.round((done / blockActivities.length) * 100) : null,
      byEffort: {
        bajo: count(blockActivities.filter((item) => item.effort === 'bajo')),
        medio: count(blockActivities.filter((item) => item.effort === 'medio')),
        alto: count(blockActivities.filter((item) => item.effort === 'alto')),
      },
      onLowEnergyDays: count(blockActivities.filter((item) => bandOf(item.date) === 'sin_energia')),
      onGoodEnergyDays: count(blockActivities.filter((item) => bandOf(item.date) === 'con_energia')),
    },
  };
}

export interface BehaviorReport {
  titulo: string;
  resumen: string;
  patrones: Array<{ texto: string; respaldo: string }>;
  sugerencia: string;
  fuente: 'ia' | 'local';
}

function monthName(block: number): string {
  const names = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo', 'undécimo', 'duodécimo'];
  return names[block - 1] ? `tu ${names[block - 1]} mes` : `tu mes ${block}`;
}

export function behaviorMonthLabel(block: number): string {
  return monthName(block);
}

/** A pattern written without AI, from the same parameters. Used when the AI is not available. */
/** A number written the Spanish way: 3,2. */
function n(value: number | null): string {
  return value == null ? '—' : value.toLocaleString('es-CL', { maximumFractionDigits: 1 });
}

export function localBehaviorReport(current: BehaviorParams, previous?: BehaviorParams | null): BehaviorReport {
  const label = monthName(current.block);
  if (current.recordDays < BEHAVIOR_MIN_RECORDS) {
    return {
      titulo: `Pocos registros en ${label}`,
      resumen: `Registraste ${current.recordDays} de 30 días. Con menos de ${BEHAVIOR_MIN_RECORDS} registros no se puede describir un patrón sin inventarlo.`,
      patrones: [],
      sugerencia: 'Registrar unos segundos cada día ayuda a que el próximo mes muestre tu patrón.',
      fuente: 'local',
    };
  }
  const patterns: BehaviorReport['patrones'] = [];
  const { sleep, weekdays, activities, averages } = current;
  if (sleep.energyAfterShortSleep != null && sleep.energyAfterGoodSleep != null && Math.abs(sleep.energyAfterGoodSleep - sleep.energyAfterShortSleep) >= 0.7) {
    patterns.push({
      texto: sleep.energyAfterGoodSleep > sleep.energyAfterShortSleep
        ? `Tu energía sube cuando duermes bien: ${n(sleep.energyAfterGoodSleep)} de 5, contra ${n(sleep.energyAfterShortSleep)} los días de sueño corto.`
        : `Dormir poco no bajó tu energía este mes: ${n(sleep.energyAfterShortSleep)} de 5 con sueño corto y ${n(sleep.energyAfterGoodSleep)} con buen sueño.`,
      respaldo: `${sleep.shortDays} días con sueño corto o malo`,
    });
  }
  if (weekdays.best && weekdays.worst) {
    patterns.push({
      texto: `Los ${weekdays.best} tienes más energía (${n(weekdays.bestEnergy)} de 5) y los ${weekdays.worst}, menos (${n(weekdays.worstEnergy)} de 5).`,
      respaldo: 'al menos 2 registros de cada día',
    });
  }
  if (current.phases.length >= 2 && current.phases[0].energy - current.phases[current.phases.length - 1].energy >= 0.7) {
    const high = current.phases[0];
    const low = current.phases[current.phases.length - 1];
    patterns.push({
      texto: `Tu energía fue más alta en la fase ${high.phase} (${n(high.energy)} de 5) que en la fase ${low.phase} (${n(low.energy)} de 5).`,
      respaldo: `${high.records + low.records} registros`,
    });
  }
  if (activities.completionRate != null && activities.planned >= 5) {
    patterns.push({
      texto: `Completaste el ${activities.completionRate} % de tus actividades (${activities.done} de ${activities.planned}).`,
      respaldo: `${activities.planned} actividades planificadas`,
    });
  }
  const comparison = previous && previous.averages.energy != null && averages.energy != null
    ? ` Tu energía promedio pasó de ${n(previous.averages.energy)} a ${n(averages.energy)} de 5 respecto del mes anterior.`
    : '';
  return {
    titulo: `Tu patrón en ${label}`,
    resumen: `Registraste ${current.recordDays} de 30 días. Tu energía promedio fue ${averages.energy == null ? '—' : n(averages.energy)} de 5 y tuviste ${current.lowEnergyDays} días de energía baja.${comparison}`,
    patrones: patterns,
    sugerencia: patterns.length
      ? 'Usa estos datos para ubicar lo más exigente en tus días de más energía.'
      : 'Este mes no aparece un patrón claro. Seguir registrando ayuda a verlo el próximo mes.',
    fuente: 'local',
  };
}
