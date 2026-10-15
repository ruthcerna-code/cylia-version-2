import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatMessage, DailyLog, UserProfile } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export type SessionUser = { id: string; email?: string; hasGoogle: boolean; isAnonymous: boolean };

export function toSessionUser(user: {
  id: string;
  email?: string | null;
  is_anonymous?: boolean;
  identities?: { provider?: string }[] | null;
  app_metadata?: { provider?: string; providers?: string[] };
}): SessionUser {
  const providers = user.app_metadata?.providers || [];
  const hasGoogle = providers.includes('google')
    || (user.identities || []).some((identity) => identity.provider === 'google');
  return {
    id: user.id,
    email: user.email || undefined,
    hasGoogle,
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
  };
  if (linkExisting) {
    const linked = await client.auth.linkIdentity({ provider: 'google', options });
    if (!linked.error) return;
  }
  const { error } = await client.auth.signInWithOAuth({ provider: 'google', options });
  if (error) throw new Error(error.message || 'No se pudo abrir Gmail.');
}

export async function signInWithGoogle() {
  await connectGoogle(false);
}

export async function signInAnonymously() {
  const client = requireClient();
  const { error } = await client.auth.signInAnonymously();
  if (error) throw new Error(authErrorMessage(error));
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(authErrorMessage(error));
}

export async function signUpWithEmail(email: string, password: string) {
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

export async function deleteAccountData(userId: string) {
  const client = requireClient();
  const messages = await client.from('messages').delete().eq('user_id', userId);
  throwIfError(messages.error, 'deleteMessages');
  const logs = await client.from('daily_logs').delete().eq('user_id', userId);
  throwIfError(logs.error, 'deleteLogs');
  const profile = await client.from('profiles').delete().eq('id', userId);
  throwIfError(profile.error, 'deleteProfile');
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
