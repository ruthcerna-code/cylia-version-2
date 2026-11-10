import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ActivityImportance, ActivityPlanStatus, ActivityStep, BodyLevel, CervicalFluid, ChatMessage, CycleSymptom, DailyLog, EnergyFeel, FeltState, HormonalMethod, PeriodRecord, PerimenopauseMode, ScheduledActivity, SleepState, SpecialSituation, UserProfile } from './types';
import { compareActivities } from './utils/activities';
import { HORMONAL_LABELS, inferHormonalMethod, validateProfile } from './utils/profileFields';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SessionUser = {
  id: string;
  email?: string;
  isAnonymous: boolean;
};

export function toSessionUser(user: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
}): SessionUser {
  return {
    id: user.id,
    email: user.email || undefined,
    isAnonymous: Boolean(user.is_anonymous),
  };
}

type ProfileRow = {
  id: string;
  name: string;
  age: number;
  birth_date: string;
  weight: number;
  height: number;
  email: string;
  last_period_date: string;
  period_length: number;
  cycle_length: number;
  contraceptive: string;
  is_celiac: boolean;
  has_diabetes: boolean;
  has_obesity: boolean;
  has_depression: boolean;
  cycle_length_source?: string | null;
  cycle_reminders?: boolean | null;
  hormonal_method?: string | null;
  special_situation?: string | null;
  period_length_known?: boolean | null;
  cycle_length_known?: boolean | null;
  perimenopause_mode?: string | null;
};

type LogRow = {
  user_id: string;
  date: string;
  sleep_quality: number;
  fatigue: number;
  pain: number;
  stress: number;
  mood: number;
  sleep_details: string;
  additional_notes: string;
  behavior: string;
  ai_analysis: string | null;
  energy?: number | null;
  concentration?: number | null;
  sleep_state?: string | null;
  spotting?: boolean | null;
  symptoms?: string[] | null;
  hot_flash_count?: number | null;
  hot_flash_intensity?: number | null;
  night_sweat_count?: number | null;
  night_sweat_intensity?: number | null;
  cervical_fluid?: string | null;
  felt_state?: string | null;
  energy_feel?: string | null;
  headache_level?: string | null;
  bloating_level?: string | null;
  breast_sensitivity_level?: string | null;
  pelvic_cramp_level?: string | null;
};

const METHODS = ['ninguna', 'pastilla', 'diu_hormonal', 'implante', 'inyeccion', 'anillo_parche'] as const;
const SITUATIONS = ['ninguna', 'embarazo', 'posparto_lactancia', 'terapia_hormonal', 'sin_regla'] as const;
const PERI_MODES = ['off', 'offered', 'on'] as const;
const SLEEP_STATES = ['bien', 'regular', 'mal'] as const;
const FLUIDS = ['seco', 'pegajoso', 'cremoso', 'clara_de_huevo'] as const;
const FELT_STATES = ['Serena', 'Enfocada', 'Radiante', 'Reflexiva', 'Sensible'] as const;
const ENERGY_FEELS = ['baja', 'estable', 'radiante', 'inquieta'] as const;
const BODY_LEVELS = ['ninguno', 'leve', 'medio'] as const;

function oneOf<T extends string>(values: readonly T[], value: string | null | undefined): T | undefined {
  return values.includes(value as T) ? value as T : undefined;
}
const SYMPTOMS = ['colicos', 'dolor_cabeza', 'hinchazon', 'sensibilidad_mamaria', 'antojos', 'irritabilidad', 'bochornos', 'sudores_nocturnos', 'sequedad_vaginal'] as const;

function asMethod(value: string | null | undefined, contraceptive: string): HormonalMethod {
  return METHODS.includes(value as HormonalMethod) ? value as HormonalMethod : inferHormonalMethod(contraceptive);
}

function asSituation(value: string | null | undefined): SpecialSituation {
  return SITUATIONS.includes(value as SpecialSituation) ? value as SpecialSituation : 'ninguna';
}

function asPeri(value: string | null | undefined): PerimenopauseMode {
  return PERI_MODES.includes(value as PerimenopauseMode) ? value as PerimenopauseMode : 'off';
}

type MessageRow = {
  id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  created_at: number;
};

function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.');
  }
  return supabase;
}

function throwIfError(error: { message: string } | null, action: string) {
  if (!error) return;
  console.error(`Supabase ${action}:`, error.message);
  throw new Error(error.message);
}

export function authErrorMessage(error: { message?: string; code?: string }): string {
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();
  if (code === 'anonymous_provider_disabled' || message.includes('anonymous')) {
    return 'El acceso anónimo no está habilitado en Supabase. Actívalo en Authentication → Providers.';
  }
  return 'No se pudo iniciar sesión en Supabase.';
}

export async function signInAnonymously() {
  const client = requireClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(authErrorMessage(error));
}

function clearSupabaseBrowserSession() {
  const wipe = (storage: Storage) => {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith('sb-')) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  };
  try { wipe(localStorage); } catch { /* El navegador puede bloquear el almacenamiento. */ }
  try { wipe(sessionStorage); } catch { /* El navegador puede bloquear el almacenamiento. */ }
}

export async function signOut() {
  clearSupabaseBrowserSession();
  window.location.replace('/');
}

function profileToRow(userId: string, profile: UserProfile): ProfileRow {
  return {
    id: userId,
    name: profile.name,
    age: profile.age,
    birth_date: profile.birthDate,
    weight: profile.weight,
    height: profile.height,
    email: profile.email,
    last_period_date: profile.lastPeriodDate,
    period_length: profile.periodLength,
    cycle_length: profile.cycleLength,
    contraceptive: profile.contraceptive,
    is_celiac: Boolean(profile.isCeliac),
    has_diabetes: Boolean(profile.hasDiabetes),
    has_obesity: Boolean(profile.hasObesity),
    has_depression: Boolean(profile.hasDepression),
    cycle_length_source: profile.lengthSource === 'records' ? 'records' : 'manual',
    cycle_reminders: Boolean(profile.cycleReminders),
    hormonal_method: asMethod(profile.hormonalMethod, profile.contraceptive),
    special_situation: asSituation(profile.specialSituation),
    period_length_known: profile.periodLengthKnown !== false,
    cycle_length_known: profile.cycleLengthKnown !== false,
    perimenopause_mode: asPeri(profile.perimenopauseMode),
  };
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    name: row.name,
    age: row.age,
    birthDate: row.birth_date,
    weight: row.weight,
    height: row.height,
    email: row.email,
    lastPeriodDate: row.last_period_date,
    periodLength: row.period_length,
    cycleLength: row.cycle_length,
    contraceptive: asMethod(row.hormonal_method, row.contraceptive) === 'ninguna'
      ? (row.contraceptive || 'Ninguno')
      : HORMONAL_LABELS[asMethod(row.hormonal_method, row.contraceptive)],
    isCeliac: row.is_celiac,
    hasDiabetes: row.has_diabetes,
    hasObesity: row.has_obesity,
    hasDepression: row.has_depression,
    lengthSource: row.cycle_length_source === 'records' ? 'records' : 'manual',
    cycleReminders: Boolean(row.cycle_reminders),
    hormonalMethod: asMethod(row.hormonal_method, row.contraceptive),
    specialSituation: asSituation(row.special_situation),
    periodLengthKnown: row.period_length_known !== false,
    cycleLengthKnown: row.cycle_length_known !== false,
    perimenopauseMode: asPeri(row.perimenopause_mode),
  };
}

function logToRow(userId: string, log: DailyLog): LogRow {
  return {
    user_id: userId,
    date: log.date,
    sleep_quality: log.sleepQuality,
    fatigue: log.fatigue,
    pain: log.pain,
    stress: log.stress,
    mood: log.mood,
    sleep_details: log.sleepDetails ?? '',
    additional_notes: log.additionalNotes ?? '',
    behavior: log.behavior ?? '',
    ai_analysis: log.aiAnalysis ?? null,
    energy: log.energy ?? null,
    concentration: log.concentration ?? null,
    sleep_state: log.sleepState ?? null,
    spotting: log.spotting ?? null,
    symptoms: log.symptoms ?? [],
    hot_flash_count: log.hotFlashCount ?? null,
    hot_flash_intensity: log.hotFlashIntensity ?? null,
    night_sweat_count: log.nightSweatCount ?? null,
    night_sweat_intensity: log.nightSweatIntensity ?? null,
    cervical_fluid: log.cervicalFluid ?? null,
    felt_state: log.feltState ?? null,
    energy_feel: log.energyFeel ?? null,
    headache_level: log.headache ?? null,
    bloating_level: log.bloating ?? null,
    breast_sensitivity_level: log.breastSensitivity ?? null,
    pelvic_cramp_level: log.pelvicCramps ?? null,
  };
}

function rowToLog(row: LogRow): DailyLog {
  return {
    date: row.date,
    sleepQuality: row.sleep_quality,
    fatigue: row.fatigue,
    pain: row.pain,
    stress: row.stress,
    mood: row.mood,
    sleepDetails: row.sleep_details,
    additionalNotes: row.additional_notes,
    behavior: row.behavior,
    aiAnalysis: row.ai_analysis ?? undefined,
    energy: row.energy ?? undefined,
    concentration: row.concentration ?? undefined,
    sleepState: SLEEP_STATES.includes(row.sleep_state as SleepState) ? row.sleep_state as SleepState : undefined,
    spotting: row.spotting ?? undefined,
    symptoms: (row.symptoms ?? []).filter((item): item is CycleSymptom => SYMPTOMS.includes(item as CycleSymptom)),
    hotFlashCount: row.hot_flash_count ?? undefined,
    hotFlashIntensity: row.hot_flash_intensity ?? undefined,
    nightSweatCount: row.night_sweat_count ?? undefined,
    nightSweatIntensity: row.night_sweat_intensity ?? undefined,
    cervicalFluid: oneOf<CervicalFluid>(FLUIDS, row.cervical_fluid),
    feltState: oneOf<FeltState>(FELT_STATES, row.felt_state),
    energyFeel: oneOf<EnergyFeel>(ENERGY_FEELS, row.energy_feel),
    headache: oneOf<BodyLevel>(BODY_LEVELS, row.headache_level),
    bloating: oneOf<BodyLevel>(BODY_LEVELS, row.bloating_level),
    breastSensitivity: oneOf<BodyLevel>(BODY_LEVELS, row.breast_sensitivity_level),
    pelvicCramps: oneOf<BodyLevel>(BODY_LEVELS, row.pelvic_cramp_level),
  };
}

function messageToRow(userId: string, message: ChatMessage): MessageRow {
  return {
    id: message.id,
    user_id: userId,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    created_at: message.createdAt ?? Date.now(),
  };
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const client = requireClient();
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  throwIfError(error, 'fetchProfile');
  return data ? rowToProfile(data as ProfileRow) : null;
}

export async function saveProfile(userId: string, profile: UserProfile) {
  const problem = validateProfile(profile);
  if (problem) throw new Error(problem);
  const client = requireClient();
  const { error } = await client.from('profiles').upsert(profileToRow(userId, profile));
  throwIfError(error, 'saveProfile');
  await rememberPeriodStart(userId, profile.lastPeriodDate);
}

type PeriodRow = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  volume: PeriodRecord['volume'];
  pain: number | null;
};

function rowToPeriod(row: PeriodRow): PeriodRecord {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    volume: row.volume,
    pain: row.pain,
  };
}

export async function fetchPeriodRecords(userId: string): Promise<PeriodRecord[]> {
  const client = requireClient();
  const { data, error } = await client.from('period_records').select('*').eq('user_id', userId).order('start_date');
  if (isMissingTable(error)) return [];
  throwIfError(error, 'fetchPeriodRecords');
  return ((data || []) as PeriodRow[]).map(rowToPeriod);
}

export async function rememberPeriodStart(userId: string, startDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return;
  const client = requireClient();
  const existing = await client.from('period_records').select('id').eq('user_id', userId).eq('start_date', startDate).maybeSingle();
  if (isMissingTable(existing.error)) return;
  throwIfError(existing.error, 'rememberPeriodStart');
  if (existing.data) return;
  const { error } = await client.from('period_records').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    start_date: startDate,
    end_date: null,
    volume: null,
    pain: null,
  });
  if (isMissingTable(error)) return;
  throwIfError(error, 'rememberPeriodStart');
}

export async function fetchLogs(userId: string): Promise<Record<string, DailyLog>> {
  const client = requireClient();
  const { data, error } = await client.from('daily_logs').select('*').eq('user_id', userId);
  throwIfError(error, 'fetchLogs');
  const logs: Record<string, DailyLog> = {};
  for (const row of (data || []) as LogRow[]) {
    const log = rowToLog(row);
    logs[log.date] = log;
  }
  return logs;
}

export async function saveLogs(userId: string, logs: DailyLog[]) {
  if (logs.length === 0) return;
  const client = requireClient();
  for (let i = 0; i < logs.length; i += 100) {
    const rows = logs.slice(i, i + 100).map((log) => logToRow(userId, log));
    const { error } = await client.from('daily_logs').upsert(rows, { onConflict: 'user_id,date' });
    throwIfError(error, 'saveLogs');
  }
}

export async function fetchMessages(userId: string): Promise<ChatMessage[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('messages')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  throwIfError(error, 'fetchMessages');
  return ((data || []) as MessageRow[]).map(rowToMessage);
}

export async function saveMessage(userId: string, message: ChatMessage) {
  const client = requireClient();
  const { error } = await client.from('messages').upsert(messageToRow(userId, message));
  throwIfError(error, 'saveMessage');
}

export async function deleteMessages(userId: string) {
  const client = requireClient();
  const { error } = await client.from('messages').delete().eq('user_id', userId);
  throwIfError(error, 'deleteMessages');
}

function isMissingTable(error: { message: string } | null): boolean {
  if (!error) return false;
  return /schema cache|does not exist|could not find the table/i.test(error.message);
}

export async function deleteAccountData(userId: string) {
  const client = requireClient();
  const plans = await client.from('day_plans').delete().eq('user_id', userId);
  if (!isMissingTable(plans.error)) throwIfError(plans.error, 'deleteDayPlans');
  const activities = await client.from('scheduled_activities').delete().eq('user_id', userId);
  if (!isMissingTable(activities.error)) throwIfError(activities.error, 'deleteActivities');
  const connection = await client.from('calendar_connections').delete().eq('user_id', userId);
  if (!isMissingTable(connection.error)) throwIfError(connection.error, 'deleteCalendarConnection');
  const messages = await client.from('messages').delete().eq('user_id', userId);
  throwIfError(messages.error, 'deleteMessages');
  const periods = await client.from('period_records').delete().eq('user_id', userId);
  if (!isMissingTable(periods.error)) throwIfError(periods.error, 'deletePeriods');
  const logs = await client.from('daily_logs').delete().eq('user_id', userId);
  throwIfError(logs.error, 'deleteLogs');
  const profile = await client.from('profiles').delete().eq('id', userId);
  throwIfError(profile.error, 'deleteProfile');
}

const IMPORTANCE = ['alta', 'media', 'baja'] as const;
const PLAN_STATUS = ['pendiente', 'en_curso', 'hecha', 'pospuesta'] as const;

type ActivityRow = {
  id: string;
  user_id: string;
  title: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  reminder_minutes: number | null;
  notes: string;
  time_zone: string;
  sync_status: ScheduledActivity['syncStatus'];
  google_event_id: string | null;
  google_calendar_id: string | null;
  sync_error: string | null;
  updated_at: string;
  deadline?: string | null;
  estimate_minutes?: number | null;
  importance?: string | null;
  depends_on?: string | null;
  plan_status?: string | null;
  sort_order?: number | null;
  steps?: unknown;
};

function readSteps(value: unknown): ActivityStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { action?: unknown; minutes?: unknown; doneWhen?: unknown };
    if (typeof row.action !== 'string' || !row.action.trim()) return [];
    const minutes = Number(row.minutes);
    return [{
      action: row.action.trim(),
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 10,
      doneWhen: typeof row.doneWhen === 'string' ? row.doneWhen : '',
    }];
  });
}

function rowToActivity(row: ActivityRow): ScheduledActivity {
  return {
    id: row.id,
    title: row.title,
    date: row.activity_date,
    startTime: row.start_time ? row.start_time.slice(0, 5) : '',
    endTime: row.end_time ? row.end_time.slice(0, 5) : '',
    reminderMinutes: row.reminder_minutes,
    notes: row.notes || '',
    timeZone: row.time_zone,
    syncStatus: row.sync_status,
    googleEventId: row.google_event_id,
    googleCalendarId: row.google_calendar_id,
    syncError: row.sync_error,
    updatedAt: row.updated_at,
    deadline: row.deadline || null,
    estimateMinutes: row.estimate_minutes ?? null,
    importance: oneOf<ActivityImportance>(IMPORTANCE, row.importance) || null,
    dependsOn: row.depends_on || null,
    planStatus: oneOf<ActivityPlanStatus>(PLAN_STATUS, row.plan_status) || 'pendiente',
    sortOrder: row.sort_order ?? null,
    steps: readSteps(row.steps),
  };
}

export type ActivityDraft = {
  id?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  reminderMinutes: number | null;
  notes: string;
  timeZone: string;
  deadline?: string | null;
  estimateMinutes?: number | null;
  importance?: ActivityImportance | null;
  dependsOn?: string | null;
  planStatus?: ActivityPlanStatus;
  sortOrder?: number | null;
  steps?: ActivityStep[];
};

const localActivityKey = (userId: string) => `cyclia_activities_${userId}`;
let activityStoreIsLocal = false;

export function activitiesStoredOnThisDevice(): boolean {
  return activityStoreIsLocal;
}

function readLocalActivities(userId: string): ScheduledActivity[] {
  try {
    const raw = localStorage.getItem(localActivityKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScheduledActivity[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalActivities(userId: string, items: ScheduledActivity[]) {
  localStorage.setItem(localActivityKey(userId), JSON.stringify(items));
  activityStoreIsLocal = true;
}

function activityToRow(userId: string, activity: ScheduledActivity) {
  return {
    id: activity.id,
    user_id: userId,
    title: activity.title,
    activity_date: activity.date,
    start_time: activity.startTime || null,
    end_time: activity.endTime || null,
    reminder_minutes: activity.reminderMinutes,
    notes: activity.notes,
    time_zone: activity.timeZone,
    sync_status: activity.syncStatus,
    google_event_id: activity.googleEventId,
    google_calendar_id: activity.googleCalendarId,
    sync_error: activity.syncError,
    updated_at: activity.updatedAt,
    deadline: activity.deadline,
    estimate_minutes: activity.estimateMinutes,
    importance: activity.importance,
    depends_on: activity.dependsOn,
    plan_status: activity.planStatus,
    sort_order: activity.sortOrder,
    steps: activity.steps,
  };
}

function saveLocalActivity(userId: string, draft: ActivityDraft): ScheduledActivity {
  const items = readLocalActivities(userId);
  const existing = draft.id ? items.find((item) => item.id === draft.id) || null : null;
  const saved: ScheduledActivity = {
    id: existing?.id || draft.id || crypto.randomUUID(),
    title: draft.title.trim(),
    date: draft.date,
    startTime: draft.startTime,
    endTime: draft.endTime,
    reminderMinutes: draft.reminderMinutes,
    notes: draft.notes.trim(),
    timeZone: draft.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    syncStatus: 'synced',
    googleEventId: null,
    googleCalendarId: null,
    syncError: null,
    updatedAt: new Date().toISOString(),
    deadline: draft.deadline !== undefined ? draft.deadline : existing?.deadline ?? null,
    estimateMinutes: draft.estimateMinutes !== undefined ? draft.estimateMinutes : existing?.estimateMinutes ?? null,
    importance: draft.importance !== undefined ? draft.importance : existing?.importance ?? null,
    dependsOn: draft.dependsOn !== undefined ? draft.dependsOn : existing?.dependsOn ?? null,
    planStatus: draft.planStatus || existing?.planStatus || 'pendiente',
    sortOrder: draft.sortOrder !== undefined ? draft.sortOrder : existing?.sortOrder ?? null,
    steps: draft.steps || existing?.steps || [],
  };
  writeLocalActivities(userId, [...items.filter((item) => item.id !== saved.id), saved].sort(compareActivities));
  return saved;
}

export async function fetchActivities(userId: string): Promise<ScheduledActivity[]> {
  const client = requireClient();
  const { data, error } = await client
    .from('scheduled_activities')
    .select('*')
    .eq('user_id', userId);
  if (error && isMissingTable(error)) {
    activityStoreIsLocal = true;
    return readLocalActivities(userId).sort(compareActivities);
  }
  throwIfError(error, 'fetchActivities');
  activityStoreIsLocal = false;
  const remote = ((data || []) as ActivityRow[]).map(rowToActivity);
  const local = readLocalActivities(userId).filter((item) => !remote.some((row) => row.id === item.id));
  if (local.length) {
    const uploaded: ScheduledActivity[] = [];
    for (const item of local) {
      const insert = await client.from('scheduled_activities').upsert(activityToRow(userId, item));
      if (insert.error) return [...remote, ...local].sort(compareActivities);
      uploaded.push(item);
    }
    localStorage.removeItem(localActivityKey(userId));
    return [...remote, ...uploaded].sort(compareActivities);
  }
  localStorage.removeItem(localActivityKey(userId));
  return remote.sort(compareActivities);
}

export async function saveScheduledActivity(userId: string, draft: ActivityDraft): Promise<ScheduledActivity> {
  const client = requireClient();
  const now = new Date().toISOString();
  let existing: ActivityRow | null = null;
  if (draft.id) {
    const current = await client
      .from('scheduled_activities')
      .select('*')
      .eq('user_id', userId)
      .eq('id', draft.id)
      .maybeSingle();
    if (current.error && isMissingTable(current.error)) return saveLocalActivity(userId, draft);
    throwIfError(current.error, 'readActivity');
    existing = current.data as ActivityRow | null;
  }

  const row = {
    id: draft.id || crypto.randomUUID(),
    user_id: userId,
    title: draft.title.trim(),
    activity_date: draft.date,
    start_time: draft.startTime || null,
    end_time: draft.endTime || null,
    reminder_minutes: draft.reminderMinutes,
    notes: draft.notes.trim(),
    time_zone: draft.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    sync_status: 'synced' as const,
    google_event_id: null,
    google_calendar_id: null,
    sync_error: null,
    updated_at: now,
    deadline: draft.deadline !== undefined ? draft.deadline : existing?.deadline ?? null,
    estimate_minutes: draft.estimateMinutes !== undefined ? draft.estimateMinutes : existing?.estimate_minutes ?? null,
    importance: draft.importance !== undefined ? draft.importance : existing?.importance ?? null,
    depends_on: draft.dependsOn !== undefined ? draft.dependsOn : existing?.depends_on ?? null,
    plan_status: draft.planStatus || existing?.plan_status || 'pendiente',
    sort_order: draft.sortOrder !== undefined ? draft.sortOrder : existing?.sort_order ?? null,
    steps: draft.steps || readSteps(existing?.steps),
  };

  const { data, error } = await client
    .from('scheduled_activities')
    .upsert(row)
    .select('*')
    .single();
  if (error && isMissingTable(error)) return saveLocalActivity(userId, draft);
  throwIfError(error, 'saveActivity');
  activityStoreIsLocal = false;
  return rowToActivity(data as ActivityRow);
}

export async function deleteScheduledActivity(
  userId: string,
  activity: ScheduledActivity,
): Promise<ScheduledActivity | null> {
  const client = requireClient();
  const { error } = await client.from('scheduled_activities').delete().eq('user_id', userId).eq('id', activity.id);
  if (error && isMissingTable(error)) {
    writeLocalActivities(userId, readLocalActivities(userId).filter((item) => item.id !== activity.id));
    return null;
  }
  throwIfError(error, 'deleteActivity');
  activityStoreIsLocal = false;
  return null;
}

export function subscribeUserData(userId: string, onChange: () => void) {
  const client = requireClient();
  const channel = client
    .channel(`cyclia-${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_logs', filter: `user_id=eq.${userId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
