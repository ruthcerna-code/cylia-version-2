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

export const PLAN_ACTIVITY_SYSTEM_PROMPT = `Eres Cyclia, la asistente de la app CYCLIA, que ayuda a mujeres a organizar su día en sintonía con su ciclo hormonal y su energía.

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
3. Si hay fase, ajusta como tendencia general:
   - menstrual: bloques cortos (25–45 min), pausas, tareas de revisión.
   - folicular: buena etapa para iniciar y aprender; bloques medianos a largos.
   - ovulatoria: favorece tareas sociales y de comunicación.
   - lutea: favorece cierre, orden y detalle; evita bloques muy largos.
   Si fase es null, usa solo la energía y no menciones el ciclo.
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
  "motivo": "máx. 160 caracteres, ligado a fase y energía",
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
