import type { DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../src/types';

/** Perfil base: 30 años, ciclo natural de 28 días, regla de 5 días que empezó el 1 de noviembre de 2026. */
export function makeProfile(patch: Partial<UserProfile> = {}): UserProfile {
  return {
    name: 'Prueba',
    age: 30,
    birthDate: '1996-05-10',
    weight: 60,
    height: 165,
    email: '',
    lastPeriodDate: '2026-11-01',
    periodLength: 5,
    cycleLength: 28,
    hormonalMethod: 'ninguna',
    specialSituation: 'ninguna',
    contraceptive: 'Ninguno',
    ...patch,
  };
}

export function makeLog(date: string, patch: Partial<DailyLog> = {}): DailyLog {
  return {
    date,
    sleepQuality: 3,
    fatigue: 3,
    pain: 1,
    stress: 3,
    mood: 3,
    sleepDetails: '',
    additionalNotes: '',
    ...patch,
  };
}

export function makePeriod(startDate: string, patch: Partial<PeriodRecord> = {}): PeriodRecord {
  return {
    id: `p-${startDate}`,
    startDate,
    endDate: null,
    volume: null,
    pain: null,
    ...patch,
  };
}

export function makeActivity(patch: Partial<ScheduledActivity> & Pick<ScheduledActivity, 'id' | 'title' | 'date'>): ScheduledActivity {
  return {
    startTime: '',
    endTime: '',
    reminderMinutes: null,
    notes: '',
    timeZone: 'America/Santiago',
    syncStatus: 'synced',
    googleEventId: null,
    googleCalendarId: null,
    syncError: null,
    updatedAt: '2026-11-17T12:00:00.000Z',
    deadline: null,
    estimateMinutes: null,
    importance: null,
    kind: null,
    effort: null,
    dependsOn: null,
    planStatus: 'pendiente',
    sortOrder: null,
    steps: [],
    completedAt: null,
    durationSource: null,
    ...patch,
  };
}

/** Registros diarios consecutivos que terminan el día anterior a `until`. */
export function dailyLogs(until: string, days: number, build: (index: number, date: string) => Partial<DailyLog>): Record<string, DailyLog> {
  const logs: Record<string, DailyLog> = {};
  for (let index = 1; index <= days; index += 1) {
    const date = new Date(`${until}T12:00:00`);
    date.setDate(date.getDate() - index);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    logs[iso] = makeLog(iso, build(index, iso));
  }
  return logs;
}
