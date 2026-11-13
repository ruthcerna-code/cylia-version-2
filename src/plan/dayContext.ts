import type { DailyLog, MenstrualPhase } from '../types';
import type { EnergyBand, PlanPhase } from './proposal';

const PHASE_API: Record<MenstrualPhase, PlanPhase> = {
  Menstrual: 'menstrual',
  Folicular: 'folicular',
  Ovulacion: 'ovulatoria',
  Lutea: 'lutea',
};

export const PHASE_DOT: Record<MenstrualPhase, string> = {
  Menstrual: '#F49A9E',
  Folicular: '#A9C4F0',
  Ovulacion: '#F6E27F',
  Lutea: '#3A44C4',
};

export const PHASE_LABEL: Record<MenstrualPhase, string> = {
  Menstrual: 'Menstrual',
  Folicular: 'Folicular',
  Ovulacion: 'Ovulatoria',
  Lutea: 'Lútea',
};

export function phaseApi(phase: MenstrualPhase | null): PlanPhase | null {
  return phase ? PHASE_API[phase] : null;
}

export function energyBandFromLog(log?: DailyLog | null): EnergyBand | null {
  if (!log) return null;
  if (log.energyBand === 'con_energia' || log.energyBand === 'sin_energia') return log.energyBand;
  if (log.energyFeel === 'baja' || (log.energy != null && log.energy <= 2)) return 'sin_energia';
  if (log.energy != null && log.energy >= 3) return 'con_energia';
  if (log.energyFeel === 'estable' || log.energyFeel === 'radiante') return 'con_energia';
  return null;
}

export function energyIcon(band: EnergyBand | null): string {
  if (band === 'sin_energia') return '🌙';
  if (band === 'con_energia') return '⚡';
  return '';
}
