import { z } from 'zod';
import type { ActivityEffort } from '../types';

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_TEXT = /^([01]\d|2[0-3]):[0-5]\d$/;

export const assistTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  texto: z.string().trim().min(1).max(800),
});

export const assistRequestSchema = z.object({
  /** Single description, kept for older clients. */
  texto: z.string().trim().min(1).max(800).optional(),
  /** The whole conversation with Cyclia, oldest first. */
  mensajes: z.array(assistTurnSchema).max(30).optional(),
  /** Her local date, so "el viernes" can be turned into a date. */
  hoy: z.string().regex(DATE_TEXT).optional(),
}).refine((value) => Boolean(value.texto) || Boolean(value.mensajes?.some((turn) => turn.role === 'user')), {
  message: 'Falta la descripción de la actividad.',
});

export type AssistRequest = z.infer<typeof assistRequestSchema>;
export type AssistTurn = z.infer<typeof assistTurnSchema>;

export type AssistAnalysis = {
  necesita_datos: boolean;
  pregunta: string | null;
  nombre: string;
  descripcion: string;
  pasos: string[];
  esfuerzo: ActivityEffort;
  esfuerzo_motivo: string;
  duracion_min: number;
  /** Day she mentioned, YYYY-MM-DD, or null. */
  fecha: string | null;
  /** Start time she mentioned, HH:MM, or null. */
  hora: string | null;
};

const EFFORTS: ActivityEffort[] = ['bajo', 'medio', 'alto'];

export const ASSIST_ACTIVITY_SYSTEM_PROMPT = `Eres Cyclia, la asistente de la app CYCLIA. Conversas con una persona sobre una actividad que quiere realizar. Tu tarea es entender el alcance de la actividad, ordenarla y estimar el trabajo. Lee toda la conversación: sus respuestas completan lo que dijo antes.

Si falta algo esencial para entender qué hay que hacer, o el alcance es demasiado vago para estimar el trabajo, no inventes la actividad. Haz una sola pregunta concreta y breve. No repitas una pregunta que ya respondió.

Cuando la información alcance:
- nombre: corto y claro
- descripcion: dos o tres frases, ordenadas
- pasos: entre 2 y 5 acciones concretas
- esfuerzo: bajo, medio o alto, según el trabajo descrito
- esfuerzo_motivo: una frase. Di que la estimación es orientativa
- duracion_min: múltiplo de 5, entre 10 y 480
- fecha: si la persona dijo qué día la hará, en formato AAAA-MM-DD, calculada desde la fecha de hoy que viene en la conversación. Si no lo dijo, null. No elijas un día por ella
- hora: si dijo a qué hora empezará, en formato HH:MM de 24 horas. Si no lo dijo, null

Si después de tu propuesta pide un cambio, devuelve la actividad completa con ese cambio.

Límites:
- Español neutro latinoamericano, cálido y breve.
- No des diagnósticos, tratamientos ni consejos médicos.
- No inventes datos de la persona.

Responde solo con este JSON:
{
  "necesita_datos": boolean,
  "pregunta": "una pregunta o null",
  "nombre": "string",
  "descripcion": "string",
  "pasos": ["string"],
  "esfuerzo": "bajo" | "medio" | "alto",
  "esfuerzo_motivo": "string",
  "duracion_min": number,
  "fecha": "AAAA-MM-DD o null",
  "hora": "HH:MM o null"
}`;

function weekdayOf(date: string): string {
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long' });
  } catch {
    return '';
  }
}

/** The conversation as Claude needs it: starting with her, with today's date on her first message. */
export function assistConversation(request: AssistRequest): Array<{ role: 'user' | 'assistant'; content: string }> {
  const turns: AssistTurn[] = request.mensajes?.length
    ? request.mensajes.slice(-30)
    : [{ role: 'user', texto: request.texto || '' }];
  const rows = turns.map((turn) => ({ role: turn.role, content: turn.texto.trim() })).filter((turn) => turn.content);
  while (rows.length && rows[0].role !== 'user') rows.shift();
  if (request.hoy && rows.length) {
    rows[0] = { ...rows[0], content: `Hoy es ${weekdayOf(request.hoy)} ${request.hoy}.\n\n${rows[0].content}` };
  }
  return rows;
}

/** Everything she wrote, for the local estimate when the AI is not available. */
export function assistUserText(request: AssistRequest): string {
  const fromChat = (request.mensajes || []).filter((turn) => turn.role === 'user').map((turn) => turn.texto.trim());
  return (fromChat.length ? fromChat.join('. ') : request.texto || '').slice(0, 800);
}

function roundDuration(value: number): number {
  const rounded = Math.round(value / 5) * 5;
  return Math.min(480, Math.max(10, rounded));
}

export function alignAssist(raw: unknown, today?: string): AssistAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const pregunta = typeof row.pregunta === 'string' ? row.pregunta.trim().slice(0, 240) : '';
  if (row.necesita_datos === true) {
    if (!pregunta) return null;
    return {
      necesita_datos: true,
      pregunta,
      nombre: '',
      descripcion: '',
      pasos: [],
      esfuerzo: 'medio',
      esfuerzo_motivo: '',
      duracion_min: 30,
      fecha: null,
      hora: null,
    };
  }
  // A day in the past or in another format is dropped: the app then proposes a free slot.
  const fecha = typeof row.fecha === 'string' && DATE_TEXT.test(row.fecha) && (!today || row.fecha >= today) ? row.fecha : null;
  const hora = typeof row.hora === 'string' && TIME_TEXT.test(row.hora) ? row.hora : null;
  const nombre = typeof row.nombre === 'string' ? row.nombre.trim().slice(0, 80) : '';
  const descripcion = typeof row.descripcion === 'string' ? row.descripcion.trim().slice(0, 500) : '';
  const pasos = (Array.isArray(row.pasos) ? row.pasos : [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 5)
    .map((item) => item.trim().slice(0, 120));
  const esfuerzo = EFFORTS.find((item) => item === row.esfuerzo) || null;
  const motivo = typeof row.esfuerzo_motivo === 'string' ? row.esfuerzo_motivo.trim().slice(0, 200) : '';
  const duracion = roundDuration(Number(row.duracion_min));
  if (!nombre || !descripcion || !esfuerzo || !motivo || pasos.length < 2 || !Number.isFinite(Number(row.duracion_min))) return null;
  return {
    necesita_datos: false,
    pregunta: null,
    nombre,
    descripcion,
    pasos,
    esfuerzo,
    esfuerzo_motivo: motivo,
    duracion_min: duracion,
    fecha,
    hora,
  };
}

const FILLER = new Set([
  'quiero', 'queremos', 'necesito', 'necesitamos', 'hacer', 'realizar', 'actividad',
  'una', 'un', 'el', 'la', 'los', 'las', 'de', 'del', 'al', 'en', 'con', 'para',
  'que', 'mi', 'mis', 'me', 'por', 'sobre', 'hoy', 'manana', 'mañana',
  'esfuerzo', 'bajo', 'medio', 'alto', 'poco', 'mucho', 'ligero', 'ligera', 'intenso', 'intensa',
  'hora', 'horas', 'minuto', 'minutos', 'min',
]);

export function aiKeyLooksUsable(key: string | undefined): boolean {
  const value = (key || '').trim().replace(/^["']|["']$/g, '');
  if (value.length < 20) return false;
  return !/^(my_|your_|xxxx|sk-ant-xxx)/i.test(value);
}

function statedMinutes(text: string): number | null {
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*h(?:oras?)?\b/i);
  const minutes = text.match(/(\d+)\s*min(?:utos?)?\b/i);
  const halfHour = /hora y media|media hora/i.test(text);
  let total = 0;
  if (hours) total += Math.round(Number(hours[1].replace(',', '.')) * 60);
  if (minutes) total += Number(minutes[1]);
  if (halfHour) total += 30;
  return total > 0 ? roundDuration(total) : null;
}

function statedEffort(text: string): ActivityEffort | null {
  if (/\b(alto|mucho|intensa|intenso|exigente|difícil|dificil)\b/i.test(text)) return 'alto';
  if (/\b(bajo|poco|ligera|ligero|suave|fácil|facil)\b/i.test(text)) return 'bajo';
  if (/\bmedio\b/i.test(text)) return 'medio';
  return null;
}

export function draftAssist(texto: string): AssistAnalysis {
  const raw = texto.trim().replace(/\s+/g, ' ');
  const words = raw.toLocaleLowerCase('es').split(/[^a-záéíóúüñ0-9]+/i).filter(Boolean);
  const meaningful = words.filter((word) => word.length > 2 && !FILLER.has(word) && !/^\d+$/.test(word));
  if (meaningful.length < 2) {
    return {
      necesita_datos: true,
      pregunta: '¿Qué quieres lograr con esa actividad y cuánto tiempo puedes dedicarle?',
      nombre: '',
      descripcion: '',
      pasos: [],
      esfuerzo: 'medio',
      esfuerzo_motivo: '',
      duracion_min: 30,
      fecha: null,
      hora: null,
    };
  }
  const nameSource = raw
    .replace(/^(quiero|necesito|vamos a|hay que)\s+(hacer|realizar|preparar)?\s*/i, '')
    .replace(/\b(esfuerzo\s+(bajo|medio|alto)|durante\s+\d+\s*(?:horas?|minutos?)|\d+(?:[.,]\d+)?\s*(?:horas?|minutos?)|hora y media|media hora)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,.\s]+|[,.\s]+$/g, '');
  const cleaned = nameSource || meaningful.join(' ');
  const nombre = (cleaned.charAt(0).toLocaleUpperCase('es') + cleaned.slice(1)).slice(0, 80);
  const minutes = statedMinutes(raw);
  const esfuerzo = statedEffort(raw) || (minutes !== null && minutes >= 180 ? 'alto' : minutes !== null && minutes <= 25 ? 'bajo' : 'medio');
  const duracion = minutes ?? (esfuerzo === 'alto' ? 120 : esfuerzo === 'bajo' ? 30 : 60);
  const corto = nombre.toLocaleLowerCase('es');
  return {
    necesita_datos: false,
    pregunta: null,
    nombre,
    descripcion: `${nombre}. Conviene partir el trabajo en pasos cortos y dejar un resultado que puedas revisar.`,
    pasos: [
      `Definir qué debe incluir ${corto}`,
      'Hacer la parte principal, de a una sección',
      'Revisar el resultado y dejarlo listo',
    ],
    esfuerzo,
    esfuerzo_motivo: 'La estimación es orientativa y se armó a partir de lo que escribiste.',
    duracion_min: duracion,
    fecha: null,
    hora: null,
  };
}

