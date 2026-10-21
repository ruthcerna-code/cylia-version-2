import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, DailyLog, ScheduledActivity, UserProfile } from './types';
import { compareActivities } from './utils/activities';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SessionUser = {
  id: string;
  email?: string;
  hasGoogle: boolean;
  hasEmailAccount: boolean;
  isAnonymous: boolean;
};

export function isGmailAddress(email?: string | null): boolean {
  const host = (email || '').trim().toLowerCase().split('@')[1] || '';
  return host === 'gmail.com' || host === 'googlemail.com';
}

export function canSeeRegisteredData(user: SessionUser): boolean {
  return user.hasGoogle || user.hasEmailAccount;
}

export function toSessionUser(user: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  identities?: { provider?: string }[] | null;
  app_metadata?: { provider?: string; providers?: string[] };
}): SessionUser {
  const providers = user.app_metadata?.providers || [];
  const identities = user.identities || [];
  const hasGoogle = providers.includes('google')
    || identities.some((identity) => identity.provider === 'google');
  const hasEmailIdentity = providers.includes('email')
    || identities.some((identity) => identity.provider === 'email');
  return {
    id: user.id,
    email: user.email || undefined,
    hasGoogle,
    hasEmailAccount: !user.is_anonymous && hasEmailIdentity && !isGmailAddress(user.email),
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
};

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
  if (message.includes('google') || message.includes('unsupported provider')) {
    return 'El acceso con Gmail no está habilitado en Supabase. Actívalo en Authentication → Sign In / Providers → Google.';
  }
  if (code === 'email_provider_disabled' || message.includes('email signups are disabled') || message.includes('provider is not enabled')) {
    return 'El acceso con correo no está habilitado en Supabase.';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (code === 'user_already_exists' || code === 'email_exists' || message.includes('already registered')) {
    return 'Este correo ya está registrado.';
  }
  if (code === 'weak_password' || message.includes('password')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (message.includes('email')) {
    return 'El correo electrónico no es válido.';
  }
  return 'No se pudo iniciar sesión en Supabase.';
}

export async function connectGoogle(linkExisting = false) {
  const client = requireClient();
  const options = {
    redirectTo: window.location.origin,
    queryParams: { prompt: 'select_account' },
    skipBrowserRedirect: true,
  };
  if (linkExisting) {
    const linked = await client.auth.linkIdentity({ provider: 'google', options });
    if (!linked.error && linked.data?.url) {
      window.location.assign(linked.data.url);
      return;
    }
    await client.auth.signOut();
  }
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options });
  if (error) throw new Error(authErrorMessage(error));
  if (!data?.url) {
    throw new Error('No se pudo abrir Gmail. Revisa que Google esté activo en Supabase.');
  }
  window.location.assign(data.url);
}

export async function signInWithGoogle() {
  await connectGoogle(false);
}

export async function signInAnonymously() {
  const client = requireClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(authErrorMessage(error));
}

function assertPasswordAccount(email: string) {
  if (isGmailAddress(email)) {
    throw new Error('Este correo es una cuenta de Gmail. Entra con el botón de Gmail.');
  }
}

export async function signInWithEmail(email: string, password: string) {
  assertPasswordAccount(email);
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  const sessionUser = data.user ? toSessionUser(data.user) : null;
  if (sessionUser?.hasGoogle && !sessionUser.hasEmailAccount) {
    await client.auth.signOut();
    throw new Error('Esta cuenta se creó con Gmail. Entra con el botón de Gmail.');
  }
}

export async function signUpWithEmail(email: string, password: string) {
  assertPasswordAccount(email);
  const client = requireClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw new Error(authErrorMessage(error));
  if (!data.session) {
    throw new Error('Cuenta creada. Revisa tu correo para confirmarla antes de entrar.');
  }
}

export async function signOut() {
  const client = requireClient();
  const { error } = await client.auth.signOut();
  throwIfError(error, 'signOut');
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
    contraceptive: row.contraceptive,
    isCeliac: row.is_celiac,
    hasDiabetes: row.has_diabetes,
    hasObesity: row.has_obesity,
    hasDepression: row.has_depression,
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
  const client = requireClient();
  const { error } = await client.from('profiles').upsert(profileToRow(userId, profile));
  throwIfError(error, 'saveProfile');
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
  const activities = await client.from('scheduled_activities').delete().eq('user_id', userId);
  if (!isMissingTable(activities.error)) throwIfError(activities.error, 'deleteActivities');
  const connection = await client.from('calendar_connections').delete().eq('user_id', userId);
  if (!isMissingTable(connection.error)) throwIfError(connection.error, 'deleteCalendarConnection');
  const messages = await client.from('messages').delete().eq('user_id', userId);
  throwIfError(messages.error, 'deleteMessages');
  const logs = await client.from('daily_logs').delete().eq('user_id', userId);
  throwIfError(logs.error, 'deleteLogs');
  const profile = await client.from('profiles').delete().eq('id', userId);
  throwIfError(profile.error, 'deleteProfile');
}

type ActivityRow = {
  id: string;
  user_id: string;
  title: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  reminder_minutes: number | null;
  notes: string;
  time_zone: string;
  sync_status: ScheduledActivity['syncStatus'];
  google_event_id: string | null;
  google_calendar_id: string | null;
  sync_error: string | null;
  updated_at: string;
};

function rowToActivity(row: ActivityRow): ScheduledActivity {
  return {
    id: row.id,
    title: row.title,
    date: row.activity_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    reminderMinutes: row.reminder_minutes,
    notes: row.notes || '',
    timeZone: row.time_zone,
    syncStatus: row.sync_status,
    googleEventId: row.google_event_id,
    googleCalendarId: row.google_calendar_id,
    syncError: row.sync_error,
    updatedAt: row.updated_at,
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
    start_time: activity.startTime,
    end_time: activity.endTime,
    reminder_minutes: activity.reminderMinutes,
    notes: activity.notes,
    time_zone: activity.timeZone,
    sync_status: activity.syncStatus,
    google_event_id: activity.googleEventId,
    google_calendar_id: activity.googleCalendarId,
    sync_error: activity.syncError,
    updated_at: activity.updatedAt,
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
    syncStatus: existing?.googleEventId ? 'changed' : 'pending',
    googleEventId: existing?.googleEventId ?? null,
    googleCalendarId: existing?.googleCalendarId ?? null,
    syncError: null,
    updatedAt: new Date().toISOString(),
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

  const hadGoogleEvent = Boolean(existing?.google_event_id);
  const syncStatus: ScheduledActivity['syncStatus'] = hadGoogleEvent ? 'changed' : 'pending';
  const row = {
    id: draft.id || crypto.randomUUID(),
    user_id: userId,
    title: draft.title.trim(),
    activity_date: draft.date,
    start_time: draft.startTime,
    end_time: draft.endTime,
    reminder_minutes: draft.reminderMinutes,
    notes: draft.notes.trim(),
    time_zone: draft.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    sync_status: syncStatus,
    google_event_id: existing?.google_event_id ?? null,
    google_calendar_id: existing?.google_calendar_id ?? null,
    sync_error: null,
    updated_at: now,
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
  if (!activity.googleEventId) {
    const { error } = await client.from('scheduled_activities').delete().eq('user_id', userId).eq('id', activity.id);
    if (error && isMissingTable(error)) {
      writeLocalActivities(userId, readLocalActivities(userId).filter((item) => item.id !== activity.id));
      return null;
    }
    throwIfError(error, 'deleteActivity');
    activityStoreIsLocal = false;
    return null;
  }

  const { data, error } = await client
    .from('scheduled_activities')
    .update({
      sync_status: 'delete_pending',
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', activity.id)
    .select('*')
    .single();
  if (error && isMissingTable(error)) {
    const updated = { ...activity, syncStatus: 'delete_pending' as const, syncError: null, updatedAt: new Date().toISOString() };
    const items = readLocalActivities(userId).map((item) => item.id === activity.id ? updated : item);
    writeLocalActivities(userId, items);
    return updated;
  }
  throwIfError(error, 'markActivityDeleted');
  activityStoreIsLocal = false;
  return rowToActivity(data as ActivityRow);
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
