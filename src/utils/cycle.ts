import { MenstrualPhase, PhaseInfo } from "../types";
import { habitualCycleDays, habitualPeriodDays } from "./profileFields";

export const PHASE_DETAILS: Record<MenstrualPhase, PhaseInfo> = {
  Menstrual: {
    name: "Menstruación",
    badge: "Menstrual",
    colorClass: "bg-[#F49A9E] text-[#1B1F5E]",
    bgHex: "#F49A9E",
    textHex: "#1B1F5E",
    description: "El día 1 es el inicio de la regla. Muchas mujeres reportan más ganas de ir más lento. Tu energía es la que marques en el registro.",
    hormones: "Cyclia no mide hormonas. Algunas descripciones de estos días hablan de estrógeno y progesterona más bajos.",
    stats: {
      concentration: 50,
      creativity: 60,
      physicalEnergy: 30
    },
    tips: [
      "Si el registro marca cansancio, un ritmo más lento es una opción.",
      "Muchas mujeres eligen un movimiento suave, como estirar o caminar poco.",
      "Una bebida caliente es una opción. No es una indicación.",
      "Si hay fatiga, puedes dejar las reuniones más exigentes para otro día."
    ],
    productivity: [
      "Reflexionar sobre el mes anterior",
      "Trabajo individual de baja intensidad",
      "Planificación y establecimiento de intenciones",
      "Organizar carpetas y archivos digitales"
    ]
  },
  Folicular: {
    name: "Fase Folicular",
    badge: "Folicular",
    colorClass: "bg-[#A9C4F0] text-[#1B1F5E]",
    bgHex: "#A9C4F0",
    textHex: "#1B1F5E",
    description: "Muchas mujeres reportan más foco y más ganas de empezar cosas. Si tu registro dice otra cosa, manda el registro.",
    hormones: "Cyclia no mide hormonas. Algunas descripciones de estos días hablan de un ascenso del estrógeno.",
    stats: {
      concentration: 80,
      creativity: 95,
      physicalEnergy: 85
    },
    tips: [
      "Empezar algo nuevo es una opción que muchas mujeres prueban en estos días.",
      "Un movimiento más activo es una opción si tu energía registrada lo acompaña.",
      "Anotar ideas es una opción. No es una tarea.",
      "Ver a otras personas es una opción, no una obligación."
    ],
    productivity: [
      "Comenzar nuevos proyectos",
      "Planificar estrategias creativas",
      "Tomar cursos, estudiar y aprender rápido",
      "Generar ideas innovadoras y brainstorming"
    ]
  },
  Ovulacion: {
    name: "Ovulación",
    badge: "Ovulación",
    colorClass: "bg-[#F6E27F] text-[#1B1F5E]",
    bgHex: "#F6E27F",
    textHex: "#1B1F5E",
    description: "Muchas mujeres reportan un ánimo más abierto. Esta fase no calcula fertilidad ni mide hormonas.",
    hormones: "Cyclia no mide hormonas. Algunas descripciones de estos días hablan de un pico de estrógeno. No es un cálculo de fertilidad.",
    stats: {
      concentration: 75,
      creativity: 85,
      physicalEnergy: 95
    },
    tips: [
      "No es una ventana de fertilidad. Cyclia no la calcula.",
      "Conversar o presentar es una opción si te sientes con ganas.",
      "Un movimiento más intenso es una opción solo si tu registro marca energía alta.",
      "Estar con otras personas es una opción, no un requisito."
    ],
    productivity: [
      "Hacer presentaciones y discursos públicos",
      "Reuniones de ventas y negociaciones",
      "Networking y eventos sociales",
      "Liderazgo grupal y trabajo colaborativo"
    ]
  },
  Lutea: {
    name: "Fase Lútea",
    badge: "Fase Lútea",
    colorClass: "bg-[#3A44C4] text-white",
    bgHex: "#3A44C4",
    textHex: "#ffffff",
    description: "Muchas mujeres reportan un ritmo más reflexivo y, a ratos, más sensibilidad. Tu ánimo es el que marques en el registro.",
    hormones: "Cyclia no mide hormonas. Algunas descripciones de estos días hablan de la progesterona.",
    stats: {
      concentration: 85,
      creativity: 40,
      physicalEnergy: 60
    },
    tips: [
      "Si el registro marca menos energía, cerrar pendientes es una opción.",
      "Revisar detalles es una opción que muchas mujeres eligen en estos días.",
      "Ordenar el espacio es una opción, no una tarea.",
      "Si el ánimo cambia, el registro lo guarda. No es un diagnóstico."
    ],
    productivity: [
      "Revisión minuciosa y auditoría de datos",
      "Cerrar proyectos y tareas pendientes",
      "Organización y limpieza de espacios",
      "Trabajo individual técnico profundo"
    ]
  }
};

/**
 * Calculates the number of days between two dates.
 */
export function getDaysDifference(date1: Date | string, date2: Date | string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  // Reset times to midnight to calculate exact calendar days
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  
  const diffTime = d1.getTime() - d2.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Days since the last period start, plus one. Day 1 is that start.
 * Dates after the start keep growing so a delay can be measured.
 * Dates before the anchor stay inside one estimated cycle.
 */
export function getCycleDay(targetDateStr: string, lastPeriodDateStr: string, cycleLength: number): number {
  const length = habitualCycleDays(cycleLength);
  const diffDays = getDaysDifference(targetDateStr, lastPeriodDateStr);
  if (diffDays < 0) {
    const mod = diffDays % length;
    return mod === 0 ? length : length + mod;
  }
  return diffDays + 1;
}

/** Position of a cycle day inside the period that repeats every cycle length. Day 1 is the bleeding start. */
export function dayWithinCycle(day: number, cycleLength: number): number {
  const length = habitualCycleDays(cycleLength);
  const whole = Number.isFinite(day) ? Math.trunc(day) : 1;
  return ((whole - 1) % length + length) % length + 1;
}

/** Estimated ovulation is 14 days before the next period: cycle length minus 14. */
export function ovulationDay(cycleLength: number): number {
  return Math.max(1, habitualCycleDays(cycleLength) - 14);
}

/**
 * Phase from the period. The pattern restarts every cycle length:
 * bleeding, follicular until two days before ovulation, ovulation plus or minus one, then luteal.
 */
export function getPhaseForDay(day: number, periodLength: number, cycleLength: number): MenstrualPhase {
  const length = habitualCycleDays(cycleLength);
  const bleed = Math.min(habitualPeriodDays(periodLength), length);
  const dayInCycle = dayWithinCycle(day, length);
  if (dayInCycle <= bleed) return 'Menstrual';
  const ovulation = ovulationDay(length);
  if (dayInCycle <= ovulation - 2) return 'Folicular';
  if (dayInCycle >= ovulation - 1 && dayInCycle <= ovulation + 1) return 'Ovulacion';
  return 'Lutea';
}

export interface CycleProjection {
  index: number;
  periodStart: string;
  periodEnd: string;
  estimated: true;
}

/**
 * Adds calendar days to a YYYY-MM-DD date, at local noon so the day does not shift.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return formatDateStr(date);
}

/**
 * First future period start after `fromDate`.
 * Uses the same day count as the calendar: cycleLength - cycle day + 1.
 * Today is not included when it is already day 1 of the current cycle.
 */
export function nextPeriodStart(lastPeriodDate: string, cycleLength: number, fromDate = formatDateStr(new Date())): string {
  const cycleDay = getCycleDay(fromDate, lastPeriodDate, cycleLength);
  const daysUntil = cycleLength - cycleDay + 1;
  return addCalendarDays(fromDate, daysUntil);
}

/**
 * Estimates the next menstrual cycles from the registered anchor.
 * Results are not records: callers must not persist them as period history.
 */
export function projectNextCycles(
  lastPeriodDate: string,
  cycleLength: number,
  periodLength: number,
  count = 3,
  fromDate = formatDateStr(new Date()),
): CycleProjection[] {
  const firstStart = nextPeriodStart(lastPeriodDate, cycleLength, fromDate);
  return Array.from({ length: count }, (_, index) => {
    const periodStart = addCalendarDays(firstStart, index * cycleLength);
    const periodEnd = addCalendarDays(periodStart, Math.max(periodLength, 1) - 1);
    return {
      index: index + 1,
      periodStart,
      periodEnd,
      estimated: true,
    };
  });
}

/**
 * Formats a Date object to YYYY-MM-DD string in local time.
 */
export function formatDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date in Spanish friendly format (e.g., "Martes, 22 de Julio").
 */
export function formatFriendlyDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00'); // Prevent timezone offset shift
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  };
  const str = d.toLocaleDateString('es-ES', options);
  // Capitalize first letter
  return str.charAt(0).toUpperCase() + str.slice(1);
}
