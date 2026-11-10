const NAME_TEXT = /^[\p{L}][\p{L} '\-.]{0,59}$/u;
const EMAIL_TEXT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function startOfToday(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function ageFromBirthDate(birthDate: string, today = startOfToday()): number | null {
  const born = parseDate(birthDate);
  if (!born || born > today) return null;
  let age = today.getFullYear() - born.getFullYear();
  const monthDiff = today.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) age -= 1;
  return age;
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (name.length < 2) return 'El nombre es texto y necesita al menos 2 letras.';
  if (!NAME_TEXT.test(name) || /\d/.test(name)) return 'El nombre solo acepta letras, espacios y guiones.';
  return null;
}

export function validateBirthDate(value: string): string | null {
  if (!value) return 'Primero elige la fecha de nacimiento.';
  const born = parseDate(value);
  if (!born) return 'La fecha de nacimiento no es válida.';
  if (born > startOfToday()) return 'La fecha de nacimiento no puede ser futura.';
  const age = ageFromBirthDate(value);
  if (age == null || age > 100) return 'La fecha de nacimiento debe corresponder a una edad de hasta 100 años.';
  if (age < 12) return 'La edad calculada debe ser de al menos 12 años.';
  return null;
}

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return null;
  if (!EMAIL_TEXT.test(email) || email.length > 120) return 'El correo debe tener un formato válido o quedar vacío.';
  return null;
}

export function validateWeight(value: number): string | null {
  if (!Number.isFinite(value) || value < 30 || value > 250) return 'El peso es un número entre 30 y 250 kg.';
  return null;
}

export function validateHeight(value: number): string | null {
  if (!Number.isFinite(value) || value < 100 || value > 250) return 'La estatura es un número entre 100 y 250 cm.';
  return null;
}

export function validatePeriodDate(value: string): string | null {
  const date = parseDate(value);
  if (!date) return 'Elige el primer día de la última menstruación.';
  if (date > startOfToday()) return 'La última menstruación no puede ser una fecha futura.';
  return null;
}

export const HORMONAL_METHODS = ['ninguna', 'pastilla', 'diu_hormonal', 'implante', 'inyeccion', 'anillo_parche'] as const;
export const SPECIAL_SITUATIONS = ['ninguna', 'embarazo', 'posparto_lactancia', 'terapia_hormonal', 'sin_regla'] as const;

export const HORMONAL_LABELS: Record<(typeof HORMONAL_METHODS)[number], string> = {
  ninguna: 'Ninguno',
  pastilla: 'Pastilla',
  diu_hormonal: 'DIU hormonal',
  implante: 'Implante',
  inyeccion: 'Inyección',
  anillo_parche: 'Anillo o parche',
};

export const SITUATION_LABELS: Record<(typeof SPECIAL_SITUATIONS)[number], string> = {
  ninguna: 'Ninguna',
  embarazo: 'Embarazo',
  posparto_lactancia: 'Posparto o lactancia',
  terapia_hormonal: 'Terapia hormonal de la menopausia',
  sin_regla: 'Ya no tengo regla',
};

export function inferHormonalMethod(value: string): (typeof HORMONAL_METHODS)[number] {
  const text = value.toLowerCase();
  if (/pastilla|pildora|píldora|oral/.test(text)) return 'pastilla';
  if (/diu/.test(text) && /hormonal|mirena|kyleena|levonorgestrel/.test(text)) return 'diu_hormonal';
  if (/implant/.test(text)) return 'implante';
  if (/inyec/.test(text)) return 'inyeccion';
  if (/anillo|parche/.test(text)) return 'anillo_parche';
  return 'ninguna';
}

export function validatePeriodLength(value: number): string | null {
  if (!Number.isInteger(value) || value < 1 || value > 10) return 'La menstruación es un número entero entre 1 y 10 días.';
  return null;
}

export function validateCycleLength(value: number): string | null {
  if (!Number.isInteger(value) || value < 21 || value > 45) return 'El ciclo es un número entero entre 21 y 45 días.';
  return null;
}

/** Days used to predict the cycle. Unknown or out of range stays at 28 until there is history. */
export function habitualCycleDays(value: number, known = true): number {
  if (known === false || validateCycleLength(value)) return 28;
  return value;
}

/** Days used to predict the period. Unknown or out of range stays at 5. */
export function habitualPeriodDays(value: number, known = true): number {
  if (known === false || validatePeriodLength(value)) return 5;
  return value;
}

export function validateContraceptive(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 80 || /\d{5,}/.test(text)) return 'El método anticonceptivo es un texto de hasta 80 caracteres.';
  return null;
}

export function validateProfile(profile: {
  name: string;
  age: number;
  birthDate: string;
  weight: number;
  height: number;
  email: string;
  lastPeriodDate: string;
  periodLength: number;
  cycleLength: number;
  periodLengthKnown?: boolean;
  cycleLengthKnown?: boolean;
  hormonalMethod?: string;
  specialSituation?: string;
  contraceptive: string;
}): string | null {
  const periodError = profile.periodLengthKnown === false
    ? (profile.periodLength === 5 ? null : 'Si no sabes cuánto dura la regla, se usan 5 días.')
    : validatePeriodLength(profile.periodLength);
  const cycleError = profile.cycleLengthKnown === false
    ? (profile.cycleLength === 28 ? null : 'Si no sabes cuánto dura el ciclo, se usan 28 días.')
    : validateCycleLength(profile.cycleLength);
  const methodError = profile.hormonalMethod && !HORMONAL_METHODS.includes(profile.hormonalMethod as (typeof HORMONAL_METHODS)[number])
    ? 'Elige un método anticonceptivo de la lista.'
    : null;
  const situationError = profile.specialSituation && !SPECIAL_SITUATIONS.includes(profile.specialSituation as (typeof SPECIAL_SITUATIONS)[number])
    ? 'Elige la situación que corresponde.'
    : null;
  return validateName(profile.name)
    || validateBirthDate(profile.birthDate)
    || (profile.age !== ageFromBirthDate(profile.birthDate) ? 'La edad debe ser el número calculado con la fecha de nacimiento.' : null)
    || validateWeight(profile.weight)
    || validateHeight(profile.height)
    || validateEmail(profile.email)
    || validatePeriodDate(profile.lastPeriodDate)
    || periodError
    || cycleError
    || methodError
    || situationError
    || validateContraceptive(profile.contraceptive);
}
