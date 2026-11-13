import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { formatDateStr, formatFriendlyDate, PHASE_DETAILS } from './cycle';
import { analyzeCycle } from './cycleModel';

export type SleepReading = 'corto' | 'suficiente' | 'largo' | 'sin_dato';

export function sleepHours(text: string): number | null {
  const match = /(\d+(?:[.,]\d+)?)\s*(?:horas?|hrs?|h\b)/i.exec(text || '');
  if (!match) return null;
  const hours = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(hours) || hours < 0 || hours > 16) return null;
  return hours;
}

export function readSleep(log: Pick<DailyLog, 'sleepDetails' | 'sleepQuality' | 'sleepState'>): { kind: SleepReading; hours: number | null } {
  const hours = sleepHours(log.sleepDetails || '');
  if (hours != null) {
    if (hours < 7) return { kind: 'corto', hours };
    if (hours <= 9) return { kind: 'suficiente', hours };
    return { kind: 'largo', hours };
  }
  if (log.sleepQuality <= 2 || log.sleepState === 'bien') return { kind: 'suficiente', hours: null };
  if (log.sleepQuality >= 4 || log.sleepState === 'mal') return { kind: 'corto', hours: null };
  return { kind: 'sin_dato', hours: null };
}

function lowEnergy(log: DailyLog): boolean {
  return (log.energy != null && log.energy <= 2) || log.fatigue >= 4;
}

export function agendaCycleReminder(profile: UserProfile, periods: PeriodRecord[], date: string): { title: string; detail: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      title: 'Elige la fecha de la actividad',
      detail: 'Al elegirla, verás en qué día del ciclo cae.',
    };
  }
  const view = analyzeCycle(profile, periods, date);
  const friendly = formatFriendlyDate(date);
  const today = formatDateStr(new Date());
  if (!view.showPhases || !view.phase) {
    return { title: friendly, detail: view.note };
  }
  const name = PHASE_DETAILS[view.phase].name;
  const approx = view.approximate ? ' aproximada' : '';
  const place = `Día ${view.cycleDay} del ciclo.`;
  if (date === today) return { title: `Hoy estás en ${name}${approx}`, detail: place };
  if (date > today) return { title: `Ese día estarías en ${name}${approx}`, detail: `${friendly}. ${place}` };
  return { title: `Ese día la proyección te ubica en ${name}${approx}`, detail: `${friendly}. ${place}` };
}

const FLUID_LABEL = { seco: 'seco', pegajoso: 'pegajoso', cremoso: 'cremoso', clara_de_huevo: 'clara de huevo' } as const;
const ENERGY_LABEL = { baja: 'baja', estable: 'estable', radiante: 'radiante', inquieta: 'inquieta' } as const;

export function indicatorNote(log: DailyLog | undefined): string | null {
  if (!log) return null;
  const parts: string[] = [];
  if (log.cervicalFluid) {
    parts.push(log.cervicalFluid === 'clara_de_huevo'
      ? 'Marcaste fluido clara de huevo. Muchas mujeres lo asocian con días fértiles. Cyclia no calcula fertilidad.'
      : `Marcaste fluido ${FLUID_LABEL[log.cervicalFluid]}.`);
  }
  if (log.feltState) parts.push(`Tu estado marcado es ${log.feltState}.`);
  if (log.energyFeel === 'inquieta') parts.push('Marcaste la energía como inquieta. Eso no es energía baja ni alta.');
  else if (log.energyFeel) parts.push(`Marcaste la energía como ${ENERGY_LABEL[log.energyFeel]}.`);
  const sensations = [
    ['dolor de cabeza', log.headache],
    ['hinchazón', log.bloating],
    ['sensibilidad mamaria', log.breastSensitivity],
    ['cólicos', log.pelvicCramps],
  ].filter((item): item is [string, 'leve' | 'medio'] => item[1] === 'leve' || item[1] === 'medio');
  if (sensations.length) parts.push(`Sensaciones: ${sensations.map(([name, level]) => `${name} ${level}`).join(', ')}.`);
  return parts.length ? parts.join(' ') : null;
}

export function dayRecordNote(log: DailyLog | undefined): string | null {
  if (!log) return null;
  const sleep = readSleep(log);
  const low = lowEnergy(log);
  const marked = indicatorNote(log);
  let sleepLine: string | null = null;
  if (low && sleep.kind === 'corto') {
    const hours = sleep.hours == null ? 'un sueño corto o malo' : `unas ${sleep.hours} horas de sueño`;
    sleepLine = `Según tu registro de ese día, la energía baja coincide con ${hours}.`;
  } else if (low && sleep.kind === 'suficiente') {
    const hours = sleep.hours == null ? 'marcaste el sueño como bueno' : `anotaste unas ${sleep.hours} horas de sueño`;
    sleepLine = `Según tu registro de ese día hay cansancio y ${hours}. El descanso de esa noche alcanza para descartar que la causa sea dormir poco.`;
  } else if (low && sleep.kind === 'largo') {
    sleepLine = 'Según tu registro de ese día hay cansancio y el sueño fue largo. Dormir de menos no aparece en esa nota.';
  }
  return [sleepLine, marked].filter(Boolean).join(' ') || null;
}

type Row = {
  phase: MenstrualPhase | null;
  energy: number | null;
  low: boolean;
  sleep: SleepReading;
  hours: number | null;
};

function rowsOf(profile: UserProfile, periods: PeriodRecord[], logs: Record<string, DailyLog>): Row[] {
  return Object.values(logs)
    .filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(log.date))
    .map((log) => {
      const view = analyzeCycle(profile, periods, log.date);
      const sleep = readSleep(log);
      return {
        phase: view.showPhases ? view.phase : null,
        energy: log.energy ?? null,
        low: lowEnergy(log),
        sleep: sleep.kind,
        hours: sleep.hours,
      };
    });
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function majority<T>(items: T[], pick: (item: T) => boolean): boolean {
  return items.length > 0 && items.filter(pick).length > items.length / 2;
}

export function compareRecords(profile: UserProfile, periods: PeriodRecord[], logs: Record<string, DailyLog>): string[] {
  const rows = rowsOf(profile, periods, logs);
  if (!rows.length) {
    return ['Todavía no hay registros de energía, cansancio o sueño para compararlos con la proyección del ciclo.'];
  }
  const lines = [`Según tus registros hay ${rows.length} ${rows.length === 1 ? 'día' : 'días'} con energía, cansancio o sueño.`];
  const low = rows.filter((row) => row.low);
  if (!low.length) {
    lines.push('En esos días no aparece un cansancio marcado. La energía registrada no se desvía hacia abajo.');
  } else if (majority(low, (row) => row.sleep === 'corto')) {
    lines.push('Cuando la energía baja, el sueño de esos días es más corto o lo marcaste mal. Según tus registros, esa diferencia se explica por dormir menos.');
  } else if (majority(low, (row) => row.sleep === 'suficiente' && row.hours != null && row.hours >= 7 && row.hours <= 9)) {
    lines.push('El cansancio aparece en días en que anotaste un sueño de unas 7 a 9 horas. Según tus registros, dormir poco no es la causa.');
  } else if (majority(low, (row) => row.sleep === 'suficiente')) {
    lines.push('El cansancio aparece en días en que marcaste el sueño como bueno. Según tus registros, dormir poco no es la causa.');
  } else {
    lines.push('La energía baja no va siempre con el mismo sueño: a veces dormiste menos y a veces el descanso quedó bien.');
  }

  const byPhase = new Map<MenstrualPhase, Row[]>();
  rows.forEach((row) => {
    if (!row.phase || row.energy == null) return;
    const list = byPhase.get(row.phase) || [];
    list.push(row);
    byPhase.set(row.phase, list);
  });
  byPhase.forEach((group, phase) => {
    if (group.length < 2) return;
    const energy = mean(group.map((row) => row.energy as number));
    if (energy == null) return;
    const name = PHASE_DETAILS[phase].name;
    const sleepNote = majority(group, (row) => row.sleep === 'corto')
      ? ' En esos días el sueño fue más corto, y eso coincide con la energía registrada.'
      : majority(group, (row) => row.sleep === 'suficiente')
        ? ' El sueño de esos días es suficiente, así que el número sale de cómo marcaste la energía y el cansancio.'
        : '';
    lines.push(`En ${name}, tu energía promedio es ${energy} de 5, con ${group.length} registros.${sleepNote}`);
  });
  const marked = Object.values(logs).filter((log) => log.feltState || log.energyFeel || log.cervicalFluid || log.headache === 'leve' || log.headache === 'medio' || log.bloating === 'leve' || log.bloating === 'medio' || log.breastSensitivity === 'leve' || log.breastSensitivity === 'medio' || log.pelvicCramps === 'leve' || log.pelvicCramps === 'medio');
  if (marked.length) {
    lines.push(`${marked.length === 1 ? 'Hay 1 día' : `Hay ${marked.length} días`} con fluido, estado, energía en palabras o una sensación marcada. Esa lectura usa lo que tocaste, no un porcentaje de la fase.`);
  }
  return lines;
}
