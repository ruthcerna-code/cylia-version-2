import { loadDayPlan, saveDayPlan } from '../firebase';
import type { EnergyFeel } from '../types';

export interface DaySettings {
  availableMinutes: number | null;
  reportedEnergy: number | null;
  reportedFeel: EnergyFeel | null;
}

const FEELS: EnergyFeel[] = ['baja', 'estable', 'radiante', 'inquieta'];
const EMPTY: DaySettings = { availableMinutes: null, reportedEnergy: null, reportedFeel: null };

function key(userId: string, date: string): string {
  return `cyclia_day_plan_${userId}_${date}`;
}

function readLocal(userId: string, date: string): DaySettings {
  try {
    const raw = localStorage.getItem(key(userId, date));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as DaySettings;
    return {
      availableMinutes: parsed.availableMinutes && parsed.availableMinutes > 0 ? parsed.availableMinutes : null,
      reportedEnergy: parsed.reportedEnergy ?? null,
      reportedFeel: parsed.reportedFeel && FEELS.includes(parsed.reportedFeel) ? parsed.reportedFeel : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function loadDaySettings(userId: string, date: string): Promise<DaySettings> {
  const local = readLocal(userId, date);
  try {
    const data = await loadDayPlan(userId, date);
    if (!data) return local;
    const feel = FEELS.find((item) => item === data.reportedFeel) || null;
    const minutes = Number(data.availableMinutes);
    return {
      availableMinutes: minutes > 0 ? minutes : local.availableMinutes,
      reportedEnergy: data.reportedEnergy == null ? local.reportedEnergy : Number(data.reportedEnergy),
      reportedFeel: feel || local.reportedFeel,
    };
  } catch {
    return local;
  }
}

export async function saveDaySettings(userId: string, date: string, settings: DaySettings): Promise<void> {
  localStorage.setItem(key(userId, date), JSON.stringify(settings));
  if (!settings.availableMinutes) return;
  try {
    await saveDayPlan(userId, date, settings.availableMinutes, settings.reportedEnergy, settings.reportedFeel);
  } catch (error) {
    console.error('No se pudo guardar el tiempo del día:', error);
  }
}
