import { supabase } from './supabase';

export type AccountRole = 'admin' | 'user';

export type ManagedAccount = {
  id: string;
  username: string;
  role: AccountRole;
  createdAt: string;
};

const TOKEN_KEY = 'cyclia_account_token';
const EXPIRES_KEY = 'cyclia_account_expires';
const BOUND_KEY = 'cyclia_account_bound';
const DAY_MS = 24 * 60 * 60 * 1000;

export function readAccountToken(): string {
  try {
    const currentTab = sessionStorage.getItem(TOKEN_KEY) || '';
    if (currentTab) return currentTab;
    const expires = Number(localStorage.getItem(EXPIRES_KEY) || 0);
    const stored = localStorage.getItem(TOKEN_KEY) || '';
    if (!stored || !Number.isFinite(expires) || expires <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRES_KEY);
      return '';
    }
    sessionStorage.setItem(TOKEN_KEY, stored);
    return stored;
  } catch {
    return '';
  }
}

export function accountSessionExpired(): boolean {
  try {
    return localStorage.getItem(BOUND_KEY) === '1' && !readAccountToken();
  } catch {
    return false;
  }
}

export function clearAccountSession() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
    localStorage.removeItem(BOUND_KEY);
  } catch {
    // El navegador puede bloquear el almacenamiento.
  }
}

function persistAccountToken(token: string, remember: boolean) {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(BOUND_KEY, '1');
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + DAY_MS));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRES_KEY);
  }
}

async function accountRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readAccountToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo completar la acción.');
  return body as T;
}

async function openAccountSession(path: string, payload: Record<string, string>, remember: boolean): Promise<{ username: string; role: AccountRole }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const failure = new Error(body.error || 'No se pudo iniciar sesión.') as Error & { code?: string };
    failure.code = typeof body.code === 'string' ? body.code : '';
    throw failure;
  }
  if (!supabase) throw new Error('Faltan las claves de Supabase en el archivo .env.');
  persistAccountToken(body.token, remember);
  const { error } = await supabase.auth.setSession({
    access_token: body.supabase.access_token,
    refresh_token: body.supabase.refresh_token,
  });
  if (error) {
    clearAccountSession();
    throw new Error(error.message);
  }
  return { username: body.username, role: body.role };
}

export function loginWithAccount(username: string, password: string, remember: boolean): Promise<{ username: string; role: AccountRole }> {
  return openAccountSession('/api/auth/login', { username, password }, remember);
}

export type PendingEntry = {
  created: boolean;
  remember: boolean;
  token: string;
  accessToken: string;
  refreshToken: string;
};

export async function beginEntry(username: string, password: string, remember: boolean): Promise<PendingEntry> {
  const email = username.includes('@');
  const response = await fetch(email ? '/api/auth/email' : '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(email ? { email: username, password } : { username, password }),
  });
  const raw = await response.text();
  let body: { error?: unknown; code?: unknown; created?: unknown; token?: unknown; username?: unknown; role?: unknown; supabase?: { access_token?: unknown; refresh_token?: unknown } } = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const serverError = typeof body.error === 'string' ? body.error : '';
    const serverCode = typeof body.code === 'string' && body.code ? body.code : String(response.status);
    const failure = new Error(serverError ? `${serverError} Código ${serverCode}.` : `No se pudo entrar. Código ${serverCode}.`) as Error & { code?: string };
    failure.code = serverCode;
    throw failure;
  }
  return {
    created: Boolean(body.created),
    remember,
    token: String(body.token || ''),
    accessToken: String(body.supabase?.access_token || ''),
    refreshToken: String(body.supabase?.refresh_token || ''),
  };
}

export async function finishAccountSession(pending: PendingEntry): Promise<void> {
  if (!supabase) throw new Error('Faltan las claves de Supabase en el archivo .env.');
  persistAccountToken(pending.token, pending.remember);
  const { error } = await supabase.auth.setSession({
    access_token: pending.accessToken,
    refresh_token: pending.refreshToken,
  });
  if (error) {
    clearAccountSession();
    throw new Error(error.message);
  }
}

export function confirmEmailCode(email: string, code: string, remember: boolean): Promise<{ username: string; role: AccountRole }> {
  return openAccountSession('/api/auth/confirm', { email, code }, remember);
}

export function loginWithEmail(email: string, password: string, remember: boolean): Promise<{ username: string; role: AccountRole }> {
  return openAccountSession('/api/auth/email', { email, password }, remember);
}

export async function requestProvisionalPassword(email: string): Promise<string> {
  const response = await fetch('/api/auth/provisional', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'No se pudo enviar la clave provisoria.');
  return String(body.message || 'Enviamos la clave provisoria a tu correo.');
}

export async function fetchAccountMe(supabaseUserId: string): Promise<{ username: string; role: AccountRole } | null | 'expired'> {
  if (!readAccountToken()) return accountSessionExpired() ? 'expired' : null;
  try {
    const body = await accountRequest<{ username: string; role: AccountRole; supabaseUserId: string }>('/api/auth/me');
    if (body.supabaseUserId !== supabaseUserId) {
      clearAccountSession();
      return 'expired';
    }
    return { username: body.username, role: body.role };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/expiró|ya no existe|no corresponde/i.test(message)) {
      clearAccountSession();
      return 'expired';
    }
    return null;
  }
}

let sessionSyncBound = false;

export function bindAccountSessionSync() {
  if (sessionSyncBound || !supabase) return;
  sessionSyncBound = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'TOKEN_REFRESHED' && event !== 'SIGNED_IN') return;
    const token = readAccountToken();
    if (!token || !session?.access_token || !session.refresh_token) return;
    void fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accessToken: session.access_token, refreshToken: session.refresh_token }),
    });
  });
}

export function listManagedAccounts(): Promise<{ users: ManagedAccount[] }> {
  return accountRequest('/api/admin/users');
}

export function createManagedAccount(username: string, password: string): Promise<{ user: ManagedAccount }> {
  return accountRequest('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export function deleteManagedAccount(id: string): Promise<{ ok: boolean }> {
  return accountRequest(`/api/admin/users/${id}`, { method: 'DELETE' });
}
