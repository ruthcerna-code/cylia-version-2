import { z } from 'zod';
import type { ActivityEffort } from '../types';

export const assistRequestSchema = z.object({
  texto: z.string().trim().min(1).max(800),
});

export type AssistRequest = z.infer<typeof assistRequestSchema>;

export type AssistAnalysis = {
  necesita_datos: boolean;
  pregunta: string | null;
  nombre: string;
  descripcion: string;
  pasos: string[];
  esfuerzo: ActivityEffort;
  esfuerzo_motivo: string;
  duracion_min: number;
};

const EFFORTS: ActivityEffort[] = ['bajo', 'medio', 'alto'];

export const ASSIST_ACTIVITY_SYSTEM_PROMPT = `Eres Cyclia, la asistente de la app CYCLIA. Una persona describe una actividad y el esfuerzo que quiere dedicarle. Tu tarea es ordenar esa actividad y estimar el trabajo. No elijas fecha ni hora: el calendario lo resuelve la app.

Si falta algo esencial para entender qué hay que hacer, o el texto es demasiado vago para estimar el trabajo, no inventes la actividad. Pide un solo dato concreto.

Si la información alcanza:
- nombre: corto y claro
- descripcion: dos o tres frases, ordenadas
- pasos: entre 2 y 5 acciones concretas
- esfuerzo: bajo, medio o alto, según el trabajo descrito
- esfuerzo_motivo: una frase. Di que la estimación es orientativa
- duracion_min: múltiplo de 5, entre 10 y 480

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
  "duracion_min": number
}`;

function roundDuration(value: number): number {
  const rounded = Math.round(value / 5) * 5;
  return Math.min(480, Math.max(10, rounded));
}

export function alignAssist(raw: unknown): AssistAnalysis | null {
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
    };
  }
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
  };
}

const FILLER = new Set([
  'quiero', 'queremos', 'necesito', 'necesitamos', 'hacer', 'realizar', 'actividad',
  'una', 'un', 'el', 'la', 'los', 'las', 'de', 'del', 'al', 'en', 'con', 'para',
  'que', 'mi', 'mis', 'me', 'por', 'sobre', 'hoy', 'manana', 'mañana',
  'esfuerzo', 'bajo', 'medio', 'alto', 'poco', 'mucho', 'ligero', 'ligera', 'intenso', 'intensa',
  'hora', 'horas', 'minuto', 'minutos', 'min',
]);

export function geminiKeyLooksUsable(key: string | undefined): boolean {
  const value = (key || '').trim().replace(/^["']|["']$/g, '');
  if (value.length < 20) return false;
  return !/^(my_gemini_api_key|your_|xxxx)/i.test(value);
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
  };
}

