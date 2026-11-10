import { supabase } from '../supabase';
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
  if (!supabase) return local;
  const { data, error } = await supabase
    .from('day_plans')
    .select('available_minutes, reported_energy, reported_energy_feel')
    .eq('user_id', userId)
    .eq('plan_date', date)
    .maybeSingle();
  if (error || !data) return local;
  const feel = FEELS.find((item) => item === data.reported_energy_feel) || null;
  return {
    availableMinutes: data.available_minutes > 0 ? data.available_minutes : local.availableMinutes,
    reportedEnergy: data.reported_energy ?? local.reportedEnergy,
    reportedFeel: feel || local.reportedFeel,
  };
}

export async function saveDaySettings(userId: string, date: string, settings: DaySettings): Promise<void> {
  localStorage.setItem(key(userId, date), JSON.stringify(settings));
  if (!supabase || !settings.availableMinutes) return;
  const { error } = await supabase.from('day_plans').upsert({
    user_id: userId,
    plan_date: date,
    available_minutes: settings.availableMinutes,
    buffer_minutes: 30,
    reported_energy: settings.reportedEnergy,
    reported_energy_feel: settings.reportedFeel,
    updated_at: new Date().toISOString(),
  });
  if (error && !/schema cache|day_plans|does not exist|could not find the table/i.test(error.message)) {
    console.error('No se pudo guardar el tiempo del día:', error.message);
  }
}
