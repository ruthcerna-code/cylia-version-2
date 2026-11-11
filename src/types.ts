export type HormonalMethod = 'ninguna' | 'pastilla' | 'diu_hormonal' | 'implante' | 'inyeccion' | 'anillo_parche';
export type SpecialSituation = 'ninguna' | 'embarazo' | 'posparto_lactancia' | 'terapia_hormonal' | 'sin_regla';
export type PerimenopauseMode = 'off' | 'offered' | 'on';
export type BleedingVolume = 'leve' | 'moderado' | 'abundante' | 'muy_abundante';
export type SleepState = 'bien' | 'regular' | 'mal';
export type CervicalFluid = 'seco' | 'pegajoso' | 'cremoso' | 'clara_de_huevo';
export type FeltState = 'Serena' | 'Enfocada' | 'Radiante' | 'Reflexiva' | 'Sensible';
export type EnergyFeel = 'baja' | 'estable' | 'radiante' | 'inquieta';
export type BodyLevel = 'ninguno' | 'leve' | 'medio';
export type CycleSymptom =
  | 'colicos'
  | 'dolor_cabeza'
  | 'hinchazon'
  | 'sensibilidad_mamaria'
  | 'antojos'
  | 'irritabilidad'
  | 'bochornos'
  | 'sudores_nocturnos'
  | 'sequedad_vaginal';

export interface UserProfile {
  name: string;
  age: number;
  birthDate: string;
  weight: number;
  height: number;
  email: string;
  lastPeriodDate: string; // YYYY-MM-DD
  periodLength: number; // in days, e.g., 5
  cycleLength: number; // in days, e.g., 28
  /** False when the person chose "no sé". The stored number is then the default, 5. */
  periodLengthKnown?: boolean;
  /** False when the person chose "no sé". The stored number is then the default, 28. */
  cycleLengthKnown?: boolean;
  hormonalMethod?: HormonalMethod;
  specialSituation?: SpecialSituation;
  /** Offered from age 40. The person decides whether to turn it on. */
  perimenopauseMode?: PerimenopauseMode;
  contraceptive: string; // "Ninguno" or custom
  /** manual: the saved day counts are the reference. records: use an average when enough observed cycles exist. */
  lengthSource?: 'manual' | 'records';
  /** Whether the user wants cycle reminders. Delivery is a separate, not-yet-built step. */
  cycleReminders?: boolean;
  isCeliac?: boolean;
  hasDiabetes?: boolean;
  hasObesity?: boolean;
  hasDepression?: boolean;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  sleepQuality: number; // 1-5 scale (1: Excelente, 5: Muy mala)
  fatigue: number; // 1-5 scale (1: Ninguna, 5: Extrema)
  pain: number; // 1-5 scale (1: Ninguno, 5: Muy alto)
  stress: number; // 1-5 scale (1: Muy bajo, 5: Muy alto)
  mood: number; // 1-5 scale (1: Muy feliz, 5: Muy triste)
  sleepDetails: string; // free text
  additionalNotes: string; // free text
  behavior?: string; // free text: how they behaved today (habits, physical activity, food choices)
  energy?: number; // 1-5
  concentration?: number; // 1-5
  sleepState?: SleepState;
  spotting?: boolean;
  symptoms?: CycleSymptom[];
  /** What she marked. Clara de huevo is a description, not a fertility result. */
  cervicalFluid?: CervicalFluid;
  /** Chosen state. The analysis uses this instead of guessing a mood from the scales. */
  feltState?: FeltState;
  /** Word for energy. The 1–5 number stays in `energy`. Inquieta is not a high or low score. */
  energyFeel?: EnergyFeel;
  headache?: BodyLevel;
  bloating?: BodyLevel;
  breastSensitivity?: BodyLevel;
  pelvicCramps?: BodyLevel;
  hotFlashCount?: number;
  hotFlashIntensity?: number; // 1-3
  nightSweatCount?: number;
  nightSweatIntensity?: number; // 1-3
  aiAnalysis?: string; // Cache the Gemini analysis for this specific log
}

export interface PeriodRecord {
  id: string;
  startDate: string;
  endDate: string | null;
  volume: BleedingVolume | null;
  pain: number | null; // 0 nada, 1 leve, 2 moderado, 3 fuerte
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  createdAt?: number;
}

export type MenstrualPhase = 'Menstrual' | 'Folicular' | 'Ovulacion' | 'Lutea';

export type ActivitySyncStatus = 'pending' | 'synced' | 'changed' | 'error' | 'delete_pending';

export type ActivityImportance = 'alta' | 'media' | 'baja';
export type ActivityKind = 'trabajo' | 'movimiento' | 'cuidado' | 'descanso' | 'social' | 'tramite';
export type ActivityEffort = 'bajo' | 'medio' | 'alto';
export type ActivityPlanStatus = 'pendiente' | 'en_curso' | 'hecha' | 'pospuesta';

export interface ActivityStep {
  action: string;
  minutes: number;
  doneWhen: string;
}

export interface ScheduledActivity {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  reminderMinutes: number | null;
  notes: string;
  timeZone: string;
  syncStatus: ActivitySyncStatus;
  googleEventId: string | null;
  googleCalendarId: string | null;
  syncError: string | null;
  updatedAt: string;
  deadline: string | null;
  estimateMinutes: number | null;
  importance: ActivityImportance | null;
  kind: ActivityKind | null;
  effort: ActivityEffort | null;
  dependsOn: string | null;
  planStatus: ActivityPlanStatus;
  sortOrder: number | null;
  steps: ActivityStep[];
}

export interface PhaseInfo {
  name: string;
  badge: string;
  colorClass: string;
  bgHex: string;
  textHex: string;
  description: string;
  hormones: string;
  stats: {
    concentration: number;
    creativity: number;
    physicalEnergy: number;
  };
  tips: string[];
  productivity: string[];
}
