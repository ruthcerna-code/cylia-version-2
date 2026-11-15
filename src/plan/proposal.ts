import { z } from 'zod';

export const ENERGY_BANDS = ['con_energia', 'sin_energia'] as const;
export type EnergyBand = (typeof ENERGY_BANDS)[number];

export const PLAN_PHASES = ['menstrual', 'folicular', 'ovulatoria', 'lutea'] as const;
export type PlanPhase = (typeof PLAN_PHASES)[number];

export const planRequestSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  actividad: z.string().trim().min(1).max(200),
  notas: z.string().trim().max(500).optional().nullable(),
  fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
  dia_ciclo: z.number().int().min(1).max(400).nullable(),
  duracion_ciclo: z.number().int().min(1).max(90).nullable(),
  fase: z.enum(PLAN_PHASES).nullable(),
  energia: z.enum(ENERGY_BANDS),
  propuesta_anterior_min: z.number().int().min(10).max(240).optional().nullable(),
});

export type PlanRequest = z.infer<typeof planRequestSchema>;

export const proposalSchema = z.object({
  duracion_min: z.number().int().min(10).max(240),
  hora_termino: z.string().regex(/^\d{2}:\d{2}$/),
  motivo: z.string().trim().min(1).max(160),
  pasos: z.array(z.string().trim().min(1).max(80)).max(3).default([]),
  aviso: z.string().trim().max(160).nullable().optional(),
  dividir_en_bloques: z.boolean(),
});

export type ActivityProposal = z.infer<typeof proposalSchema>;

export const PLAN_ACTIVITY_SYSTEM_PROMPT = `Eres Cyclia, la asistente de la app CYCLIA, que ayuda a mujeres a organizar su día según la energía que tienen hoy, con su ciclo como contexto.

Tu tarea: proponer CUÁNTO TIEMPO dedicar a una actividad. La usuaria ya eligió el día y la hora de inicio; no los cambies. Ella decidirá si acepta.

Datos que recibes:
- nombre: nombre de la usuaria
- actividad: texto libre
- notas: opcional
- fecha_inicio, hora_inicio
- dia_ciclo y duracion_ciclo: números, o null si no hay datos de período
- fase: menstrual | folicular | ovulatoria | lutea | null
- energia: con_energia | sin_energia
- propuesta_anterior_min: opcional (si rechazó una propuesta, ofrece una distinta)

Cómo decidir la duración:
1. Estima el tiempo razonable para la actividad en condiciones normales.
2. Ajusta según la energía: sin_energia → reduce entre 25% y 50% o divide en bloques con pausa; con_energia → mantén o amplía hasta 25% si la actividad lo amerita.
3. La fase no cambia la duración. Es solo contexto: si fase no es null, puedes mencionarla en una frase del motivo, como algo que "muchas mujeres reportan", sin presentarla como causa ni como regla. Si la energía que ella marcó no coincide con lo que suele reportarse en esa fase, manda la energía.
   Si fase es null, no menciones el ciclo.
4. Mínimo 10 min, máximo 240 min por bloque. Redondea a múltiplos de 5.

Tono y límites:
- Español neutro latinoamericano, cálido y breve, como el resto de la app. Sin culpa ni presión.
- Habla de tendencias ("muchas mujeres reportan", "suele"), nunca de diagnósticos ni consejos médicos.
- Si la actividad es exigente y energia = sin_energia, sugiere dividirla, pero no la desaconsejes.
- No inventes datos de la usuaria.

Responde SOLO con este JSON, sin texto adicional:
{
  "duracion_min": number,
  "hora_termino": "HH:MM",
  "motivo": "máx. 160 caracteres, ligado a la actividad y a la energía",
  "pasos": ["máx. 3 pasos cortos, opcional"],
  "aviso": "texto corto o null",
  "dividir_en_bloques": boolean
}`;

const CYCLE_WORDS = /ciclo|fase|menstrual|folicular|ovulator|l[úu]tea|regla|hormonal/i;

export function clockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function roundDuration(value: number): number {
  const rounded = Math.round(value / 5) * 5;
  return Math.min(240, Math.max(10, rounded));
}

export function endClock(start: string, durationMin: number): string {
  const base = clockMinutes(start) ?? 0;
  return formatClock(base + durationMin);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('sin json');
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function alignProposal(raw: unknown, horaInicio: string, fase: PlanPhase | null): ActivityProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as { duracion_min?: unknown; motivo?: unknown; pasos?: unknown; aviso?: unknown; dividir_en_bloques?: unknown };
  const duration = roundDuration(Number(row.duracion_min));
  const motivo = (typeof row.motivo === 'string' ? row.motivo.trim() : '').slice(0, 160);
  if (!fase && CYCLE_WORDS.test(motivo)) return null;
  const pasos = (Array.isArray(row.pasos) ? row.pasos : [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3)
    .map((item) => item.trim().slice(0, 80));
  const aviso = typeof row.aviso === 'string' && row.aviso.trim() ? row.aviso.trim().slice(0, 160) : null;
  const parsed = proposalSchema.safeParse({
    duracion_min: duration,
    hora_termino: endClock(horaInicio, duration),
    motivo,
    pasos,
    aviso,
    dividir_en_bloques: Boolean(row.dividir_en_bloques),
  });
  return parsed.success ? parsed.data : null;
}

export function isPastSlot(date: string, time: string, now = new Date()): boolean {
  const today = localDate(now);
  if (date < today) return true;
  if (date > today) return false;
  const minutes = clockMinutes(time);
  if (minutes == null) return true;
  return minutes < now.getHours() * 60 + now.getMinutes();
}

export function localDate(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mondayOf(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  const weekday = date.getDay();
  const shift = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + shift);
  return localDate(date);
}

export function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function monthLabel(dateStr: string): string {
  const label = new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const PHASE_REPORT: Record<PlanPhase, string> = {
  menstrual: 'Muchas mujeres reportan más descanso en estos días.',
  folicular: 'Muchas mujeres reportan más foco en estos días.',
  ovulatoria: 'Muchas mujeres reportan un ánimo más abierto en estos días.',
  lutea: 'Muchas mujeres reportan un ritmo más lento en estos días.',
};

function statedBlock(text: string): number | null {
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\b/i);
  const minutes = text.match(/(\d+)\s*min(?:utos?)?\b/i);
  const halfHour = /hora y media|media hora/i.test(text);
  let total = 0;
  if (hours) total += Math.round(Number(hours[1].replace(',', '.')) * 60);
  if (minutes) total += Number(minutes[1]);
  if (halfHour) total += 30;
  return total > 0 ? total : null;
}

function baseMinutes(text: string): number {
  if (/proyecto|mudanza|informe largo/.test(text)) return 120;
  if (/escrib|redact|informe|manual|presentaci/.test(text)) return 75;
  if (/estudi|leer|clase|curso/.test(text)) return 60;
  if (/reuni[oó]n|junta/.test(text)) return 45;
  if (/entren|ejercicio|camin|yoga|limpi|orden|cocin|compr/.test(text)) return 40;
  if (/correo|mail|mensaje|llamada|recado/.test(text)) return 20;
  return 45;
}

export function draftProposal(input: PlanRequest): ActivityProposal {
  const text = `${input.actividad} ${input.notas || ''}`.toLocaleLowerCase('es');
  const named = statedBlock(text);
  const base = named ?? baseMinutes(text);
  const low = input.energia === 'sin_energia';
  let minutes = roundDuration(low ? base * 0.65 : !named && base >= 75 ? base * 1.2 : base);
  const previous = input.propuesta_anterior_min == null ? null : roundDuration(input.propuesta_anterior_min);
  if (previous != null && previous === minutes) {
    const shifted = low ? minutes - 15 : minutes + 15;
    minutes = roundDuration(shifted === minutes ? minutes + (low ? 15 : -15) : shifted);
  }
  const title = input.actividad.trim().slice(0, 28);
  const energyLine = low
    ? `Sin energía, ${minutes} min alcanzan para ${title}, con pausa si hace falta.`
    : `Con energía, ${minutes} min quedan bien para ${title}.`;
  const mismatch = Boolean(input.fase) && (
    (low && (input.fase === 'folicular' || input.fase === 'ovulatoria'))
    || (!low && (input.fase === 'menstrual' || input.fase === 'lutea'))
  );
  const parts = [energyLine];
  if (input.fase && mismatch && `${energyLine} Manda la energía que marcaste. ${PHASE_REPORT[input.fase]}`.length <= 160) {
    parts.push('Manda la energía que marcaste.');
  }
  if (input.fase) parts.push(PHASE_REPORT[input.fase]);
  let motivo = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (motivo.length > 160) motivo = energyLine.slice(0, 160);
  const proposal = alignProposal({
    duracion_min: minutes,
    motivo,
    pasos: [
      `Empezar ${title}`,
      low ? 'Hacer un tramo y pausar si el cuerpo lo pide' : 'Hacer el tramo principal',
      'Cerrar y anotar lo que quede pendiente',
    ],
    aviso: low ? 'Si se alarga, pártala en otro bloque. No hace falta dejarla.' : null,
    dividir_en_bloques: low && base >= 45,
  }, input.hora_inicio, input.fase);
  if (!proposal) {
    return {
      duracion_min: minutes,
      hora_termino: endClock(input.hora_inicio, minutes),
      motivo: energyLine.slice(0, 160),
      pasos: [`Empezar ${title}`.slice(0, 80), 'Cerrar lo empezado'],
      aviso: null,
      dividir_en_bloques: false,
    };
  }
  return proposal;
}
