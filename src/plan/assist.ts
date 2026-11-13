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

