import type { DailyLog, MenstrualPhase, PeriodRecord, UserProfile } from '../types';
import { analyzeCycle } from './cycleModel';

export type CareSuggestion = {
  food: string;
  wellbeing: string;
  foods: string[];
  exercises: string[];
  yours: number | null;
  proposed: number | null;
  headline: string;
  detail: string;
  condition: string;
};

/** What many women report for energy, 1 to 5. It is a reference for the chart, not her measurement. */
const PROPOSED_ENERGY: Record<MenstrualPhase, number> = {
  Menstrual: 2,
  Folicular: 4,
  Ovulacion: 5,
  Lutea: 3,
};

const EXERCISE: Record<MenstrualPhase, string[]> = {
  Menstrual: [
    'Caminata suave de 15 minutos.',
    'Estiramientos en el suelo.',
    'Yoga restaurativo, si te apetece.',
  ],
  Folicular: [
    'Fuerza con un peso cómodo.',
    'Caminata rápida o bici suave.',
    'Un movimiento nuevo, sin buscar una marca.',
  ],
  Ovulacion: [
    'Intervalos cortos, solo si hay energía.',
    'Levantamiento con un peso que ya conoces.',
    'Un deporte o una clase en grupo, si te apetece.',
  ],
  Lutea: [
    'Caminata a tu paso.',
    'Yoga o estiramientos suaves.',
    'Parar cuando aparezca el cansancio.',
  ],
};

const EASY_EXERCISE = [
  'Caminata muy corta, o quedarte en casa.',
  'Estiramientos sentada.',
  'Respirar lento unos minutos. El esfuerzo alto puede esperar.',
];

const FOOD: Record<MenstrualPhase, string[]> = {
  Menstrual: [
    'Comidas calientes y fáciles de digerir.',
    'Lentejas, hojas verdes u otros alimentos con hierro, si te apetecen.',
    'Agua o una infusión a lo largo del día.',
  ],
  Folicular: [
    'Comidas frescas, con verdura y una proteína que te siente bien.',
    'Semillas o frutos secos, si ya forman parte de lo que comes.',
    'Horarios de comida parejos.',
  ],
  Ovulacion: [
    'Vegetales como brócoli, coliflor o repollo, si te gustan.',
    'Semillas de calabaza o huevo, si te apetecen.',
    'Arándanos y cacao, como una opción entre otras.',
  ],
  Lutea: [
    'Comidas a tus horarios, sin saltarte una.',
    'Un plato que te resulte reconfortante y te deje satisfecha.',
    'Una colación a mano si la energía baja.',
  ],
};

function needsEase(log: DailyLog | undefined): boolean {
  if (!log) return false;
  return (log.energy != null && log.energy <= 2)
    || log.fatigue >= 4
    || log.pain >= 4
    || log.pelvicCramps === 'medio'
    || log.pelvicCramps === 'leve'
    || log.headache === 'medio';
}

function conditionNote(profile: UserProfile): string {
  const notes: string[] = [];
  if (profile.isCeliac) notes.push('Registraste celiaquía: esta idea no cambia lo que ya te indicaron.');
  if (profile.hasDiabetes) notes.push('Registraste diabetes: no cambia tu tratamiento ni tu insulina.');
  return notes.length ? ` ${notes.join(' ')}` : '';
}

export function suggestCare(
  profile: UserProfile,
  periods: PeriodRecord[],
  logs: Record<string, DailyLog>,
  date: string,
): CareSuggestion {
  const view = analyzeCycle(profile, periods, date);
  const log = logs[date];
  const phase = view.showPhases ? view.phase : null;
  const foods = phase ? FOOD[phase] : [
    'Come a tus horarios.',
    'Elige lo que te siente bien.',
    'Ten agua a mano.',
  ];
  const exercises = !phase || needsEase(log) ? EASY_EXERCISE : EXERCISE[phase];
  const yours = log?.energy ?? null;
  const proposed = phase ? PROPOSED_ENERGY[phase] : null;
  let headline = 'Marca tu energía para ver cómo vas frente a la propuesta.';
  let detail = 'La propuesta es lo que muchas mujeres reportan en esa fase. No es una meta ni una medición.';
  if (!phase) {
    headline = 'El calendario no muestra fases.';
    detail = 'Las tres comidas y los tres ejercicios siguen tu registro, no una fase estimada.';
  } else if (yours != null) {
    const gap = yours - proposed!;
    if (Math.abs(gap) < 1.5) {
      headline = 'Vas cerca de la propuesta de esta fase.';
      detail = `Tu energía es ${yours} de 5. La propuesta de referencia es ${proposed} de 5.`;
    } else if (gap < 0) {
      headline = 'Vas por debajo de la propuesta de esta fase.';
      detail = needsEase(log)
        ? `Tu energía es ${yours} de 5 y la referencia es ${proposed}. Según tu registro hay cansancio o molestia, así que los ejercicios de hoy son suaves.`
        : `Tu energía es ${yours} de 5 y la referencia es ${proposed}. Tu registro manda.`;
    } else {
      headline = 'Vas por encima de la propuesta de esta fase.';
      detail = `Tu energía es ${yours} de 5. La referencia es ${proposed} de 5.`;
    }
  }
  return {
    food: foods[0],
    wellbeing: exercises[0],
    foods,
    exercises,
    yours,
    proposed,
    headline,
    detail,
    condition: conditionNote(profile).trim(),
  };
}
