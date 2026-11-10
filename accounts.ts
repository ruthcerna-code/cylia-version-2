import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { gmailConfigured, sendConfirmationCode, sendProvisionalPassword } from './mail';

const ADMIN_USERNAME = 'administrador';
const ADMIN_PASSWORD = '1234';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type Role = 'admin' | 'user';

type Account = {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  supabaseUserId: string;
  refreshToken: string;
  createdAt: string;
};

type AccountFile = { users: Account[] };

type TokenPayload = { sub: string; role: Role; exp: number; username?: string; supabaseUserId?: string };

function dataDir(): string {
  return path.join(process.cwd(), 'data');
}

function accountsPath(): string {
  return path.join(dataDir(), 'accounts.json');
}

function secretPath(): string {
  return path.join(dataDir(), 'session-secret');
}

function readAccounts(): AccountFile {
  if (process.env.VERCEL) return { users: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(accountsPath(), 'utf8')) as AccountFile;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeAccounts(file: AccountFile) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const target = accountsPath();
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(file, null, 2));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.renameSync(temp, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error;
      const until = Date.now() + 40;
      while (Date.now() < until) { /* Windows puede tener el archivo un instante. */ }
    }
  }
  fs.copyFileSync(temp, target);
  try { fs.rmSync(temp, { force: true }); } catch { /* El temporal puede quedar si el archivo sigue ocupado. */ }
}

function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const existing = fs.readFileSync(secretPath(), 'utf8').trim();
    if (existing) return existing;
    const created = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath(), created, { mode: 0o600 });
    return created;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EROFS' && code !== 'EPERM') throw error;
    const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();
    if (!key) throw new Error('Falta SESSION_SECRET en el servidor.');
    return crypto.createHash('sha256').update(`cyclia-session:${key}`).digest('hex');
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function normalizeUsername(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function assertCredentials(username: string, password: string) {
  if (username.includes('@')) assertEmail(username);
  else if (!/^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/.test(username)) {
    throw new Error('El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo. También puede ser un correo.');
  }
  assertPassword(password);
}

function assertPassword(password: string) {
  if (password.length < 4 || password.length > 72) {
    throw new Error('La contraseña debe tener entre 4 y 72 caracteres.');
  }
}

function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new Error('Ingresa un correo válido.');
  }
}

function provisionalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join('');
}

const provisionalSentAt = new Map<string, number>();

type PendingSignup = {
  email: string;
  passwordHash: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
};

function pendingPath(): string {
  return path.join(dataDir(), 'pending-signups.json');
}

function readPending(): PendingSignup[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(pendingPath(), 'utf8')) as PendingSignup[];
    const now = Date.now();
    return Array.isArray(parsed) ? parsed.filter((item) => item.expiresAt > now) : [];
  } catch {
    return [];
  }
}

function writePending(items: PendingSignup[]) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const now = Date.now();
  fs.writeFileSync(pendingPath(), JSON.stringify(items.filter((item) => item.expiresAt > now), null, 2));
}

function confirmationCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function signToken(account: Account): string {
  const body = Buffer.from(JSON.stringify({
    sub: account.id,
    role: account.role,
    exp: Date.now() + TOKEN_TTL_MS,
    username: account.username,
    supabaseUserId: account.supabaseUserId,
  } satisfies TokenPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function readToken(header: string | undefined): TokenPayload | null {
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    if (!payload?.sub || (payload.role !== 'admin' && payload.role !== 'user') || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function requireAccount(req: Request, res: Response): Account | null {
  const payload = readToken(req.header('authorization'));
  if (!payload) {
    res.status(401).json({ error: 'La sesión de administración expiró. Vuelve a entrar.' });
    return null;
  }
  const account = readAccounts().users.find((item) => item.id === payload.sub);
  if (account) return account;
  if (payload.role === 'user' && payload.username && payload.supabaseUserId) {
    return {
      id: payload.sub,
      username: payload.username,
      passwordHash: '',
      role: 'user',
      supabaseUserId: payload.supabaseUserId,
      refreshToken: '',
      createdAt: '',
    };
  }
  res.status(401).json({ error: 'Esta cuenta ya no existe.' });
  return null;
}

function supabaseEnv(): { url: string; key: string } {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el archivo .env.');
  }
  return { url, key };
}

function supabaseAuth() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function anonymousDisabled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /anonymous/i.test(message);
}

function passwordTooShort(message: string): boolean {
  return /password/i.test(message) && /6|least|short|weak|characters/i.test(message);
}

async function provisionEmailAuth(email: string, password: string): Promise<{ supabaseUserId: string; refreshToken: string; accessToken: string }> {
  if (password.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }
  const auth = supabaseAuth();
  const signUp = await auth.auth.signUp({ email, password });
  const createdSession = signUp.data.session;
  const createdUser = signUp.data.user;
  if (createdSession && createdUser) {
    return {
      supabaseUserId: createdUser.id,
      refreshToken: createdSession.refresh_token,
      accessToken: createdSession.access_token,
    };
  }
  const signIn = await auth.auth.signInWithPassword({ email, password });
  if (signIn.data.session && signIn.data.user) {
    return {
      supabaseUserId: signIn.data.user.id,
      refreshToken: signIn.data.session.refresh_token,
      accessToken: signIn.data.session.access_token,
    };
  }
  const message = signIn.error?.message || signUp.error?.message || '';
  if (passwordTooShort(message)) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  if (/not confirmed|confirm/i.test(message) || (createdUser && !createdSession)) {
    throw new Error('La cuenta quedó creada, pero Supabase pide confirmar el correo antes de entrar. En Authentication desactiva Confirm email.');
  }
  if (/invalid login|invalid credentials|already registered|already exists/i.test(message)) {
    throw new Error('No reconocemos esa clave.');
  }
  throw new Error(message || 'No se pudo crear la cuenta.');
}

async function openEmailAuth(email: string, password: string): Promise<{ supabaseUserId: string; refreshToken: string; accessToken: string } | null> {
  const { data, error } = await supabaseAuth().auth.signInWithPassword({ email, password });
  if (data.session && data.user) {
    return {
      supabaseUserId: data.user.id,
      refreshToken: data.session.refresh_token,
      accessToken: data.session.access_token,
    };
  }
  const message = error?.message || '';
  if (/not confirmed|confirm/i.test(message)) {
    throw new Error('La cuenta quedó creada, pero Supabase pide confirmar el correo antes de entrar. En Authentication desactiva Confirm email.');
  }
  return null;
}

async function provisionSupabaseUser(): Promise<{ supabaseUserId: string; refreshToken: string; accessToken: string }> {
  try {
    const { data, error } = await supabaseAuth().auth.signInAnonymously();
    if (error || !data.session || !data.user) {
      throw new Error(error?.message || 'Supabase no devolvió una sesión anónima.');
    }
    return {
      supabaseUserId: data.user.id,
      refreshToken: data.session.refresh_token,
      accessToken: data.session.access_token,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'fetch failed' || message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      throw new Error('No se pudo conectar con Supabase. Revisa VITE_SUPABASE_URL.');
    }
    throw error;
  }
}

async function openSupabaseSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; supabaseUserId: string }> {
  const { data, error } = await supabaseAuth().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    throw new Error('No se pudo abrir la sesión guardada de esta cuenta.');
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    supabaseUserId: data.user.id,
  };
}

function publicAccount(account: Account) {
  return {
    id: account.id,
    username: account.username,
    role: account.role,
    createdAt: account.createdAt,
  };
}

async function attachSupabase(account: Account): Promise<{ accessToken: string; refreshToken: string }> {
  if (!account.refreshToken) {
    const created = await provisionSupabaseUser();
    account.supabaseUserId = created.supabaseUserId;
    account.refreshToken = created.refreshToken;
    return { accessToken: created.accessToken, refreshToken: created.refreshToken };
  }
  const session = await openSupabaseSession(account.refreshToken);
  if (session.supabaseUserId !== account.supabaseUserId) {
    throw new Error('La sesión guardada no corresponde a esta cuenta.');
  }
  account.refreshToken = session.refreshToken;
  return { accessToken: session.accessToken, refreshToken: session.refreshToken };
}

export async function ensureAdminAccount() {
  const file = readAccounts();
  let admin = file.users.find((account) => account.username === ADMIN_USERNAME);
  if (!admin) {
    admin = {
      id: crypto.randomUUID(),
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      role: 'admin',
      supabaseUserId: '',
      refreshToken: '',
      createdAt: new Date().toISOString(),
    };
    file.users.push(admin);
    writeAccounts(file);
    console.log('[Cuentas] Usuario administrador listo.');
  }
  if (admin.refreshToken) return;
  try {
    await attachSupabase(admin);
    writeAccounts(file);
    console.log('[Cuentas] Usuario administrador vinculado a Supabase.');
  } catch (error) {
    console.error('[Cuentas] La cuenta administrador existe, pero Supabase no está disponible:', error);
  }
}

async function sendAccountSession(
  res: Response,
  file: AccountFile,
  account: Account,
  created = false,
  ready?: { accessToken: string; refreshToken: string },
) {
  let session = ready;
  if (!session) {
    try {
      session = await attachSupabase(account);
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      console.error('[Cuentas] No se pudo abrir la sesión:', detail);
      res.status(503).json({
        error: detail || 'La cuenta es válida, pero Supabase no está disponible. Revisa VITE_SUPABASE_URL.',
        code: 'supabase_session',
      });
      return;
    }
  }
  try {
    writeAccounts(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EROFS' && code !== 'ENOENT' && code !== 'EPERM') throw error;
  }
  res.status(created ? 201 : 200).json({
    token: signToken(account),
    username: account.username,
    role: account.role,
    created,
    supabaseUserId: account.supabaseUserId,
    supabase: { access_token: session.accessToken, refresh_token: session.refreshToken },
  });
}

export function registerAccountRoutes(app: Express) {
  app.post('/api/auth/login', async (req, res) => {
    try {
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || '').trim();
      const file = readAccounts();
      const account = file.users.find((item) => item.username === username);
      if (!account || !verifyPassword(password, account.passwordHash)) {
        const emailAccount = Boolean(account && username.includes('@'));
        res.status(401).json(account
          ? {
            error: emailAccount
              ? 'No reconocemos esa clave.'
              : 'No reconocemos esa clave. Esta cuenta usa la contraseña con la que se creó.',
            code: emailAccount ? 'unrecognized' : 'unrecognized_local',
          }
          : { error: 'Usuario o contraseña incorrectos.', code: 'unknown_user' });
        return;
      }
      await sendAccountSession(res, file, account);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/provisional', async (req, res) => {
    const email = normalizeUsername(req.body?.email || req.body?.username);
    let createdId = '';
    let previousHash = '';
    try {
      assertEmail(email);
      if (!gmailConfigured()) {
        res.status(503).json({ error: 'Falta GMAIL_USER y GMAIL_APP_PASSWORD en el servidor para enviar la clave.' });
        return;
      }
      const lastSent = provisionalSentAt.get(email) || 0;
      if (Date.now() - lastSent < 60_000) {
        res.status(429).json({ error: 'Espera un minuto antes de pedir otra clave.' });
        return;
      }
      const file = readAccounts();
      const existing = file.users.find((item) => item.username === email);
      if (existing?.role === 'admin') {
        res.status(400).json({ error: 'La cuenta de administración no usa clave provisoria.' });
        return;
      }
      const password = provisionalPassword();
      if (existing) {
        previousHash = existing.passwordHash;
        existing.passwordHash = hashPassword(password);
        writeAccounts(file);
      } else {
        const session = await provisionSupabaseUser();
        const created: Account = {
          id: crypto.randomUUID(),
          username: email,
          passwordHash: hashPassword(password),
          role: 'user',
          supabaseUserId: session.supabaseUserId,
          refreshToken: session.refreshToken,
          createdAt: new Date().toISOString(),
        };
        createdId = created.id;
        file.users.push(created);
        writeAccounts(file);
      }
      await sendProvisionalPassword(email, password);
      provisionalSentAt.set(email, Date.now());
      res.json({ ok: true, message: 'Enviamos la clave provisoria a tu correo. Entra con ella.' });
    } catch (error) {
      if (createdId || previousHash) {
        const file = readAccounts();
        if (createdId) file.users = file.users.filter((item) => item.id !== createdId);
        const restored = previousHash ? file.users.find((item) => item.username === email) : undefined;
        if (restored && previousHash) restored.passwordHash = previousHash;
        writeAccounts(file);
      }
      const message = error instanceof Error ? error.message : 'No se pudo enviar la clave provisoria.';
      const status = /Falta GMAIL/.test(message) ? 503 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/auth/email', async (req, res) => {
    try {
      const email = normalizeUsername(req.body?.email || req.body?.username);
      const password = String(req.body?.password || '').trim();
      assertEmail(email);
      assertPassword(password);
      const file = readAccounts();
      const existing = file.users.find((item) => item.username === email);
      if (existing) {
        if (!verifyPassword(password, existing.passwordHash)) {
          res.status(401).json({ error: 'No reconocemos esa clave.', code: 'unrecognized' });
          return;
        }
        const cloud = await openEmailAuth(email, password);
        if (cloud) {
          existing.supabaseUserId = cloud.supabaseUserId;
          existing.refreshToken = cloud.refreshToken;
          await sendAccountSession(res, file, existing, false, cloud);
          return;
        }
        await sendAccountSession(res, file, existing, false);
        return;
      }
      const returning = await openEmailAuth(email, password);
      if (returning) {
        const account: Account = {
          id: returning.supabaseUserId,
          username: email,
          passwordHash: '',
          role: 'user',
          supabaseUserId: returning.supabaseUserId,
          refreshToken: returning.refreshToken,
          createdAt: new Date().toISOString(),
        };
        res.status(200).json({
          token: signToken(account),
          username: account.username,
          role: account.role,
          created: false,
          supabaseUserId: account.supabaseUserId,
          supabase: { access_token: returning.accessToken, refresh_token: returning.refreshToken },
        });
        return;
      }
      let session: { supabaseUserId: string; refreshToken: string; accessToken: string };
      try {
        session = await provisionSupabaseUser();
      } catch (error) {
        if (!anonymousDisabled(error)) throw error;
        session = await provisionEmailAuth(email, password);
      }
      const createdAccount: Account = {
        id: crypto.randomUUID(),
        username: email,
        passwordHash: hashPassword(password),
        role: 'user',
        supabaseUserId: session.supabaseUserId,
        refreshToken: session.refreshToken,
        createdAt: new Date().toISOString(),
      };
      file.users.push(createdAccount);
      try {
        writeAccounts(file);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'EROFS' && code !== 'ENOENT' && code !== 'EPERM') throw error;
      }
      await sendAccountSession(res, file, createdAccount, true, {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la cuenta.';
      const status = /Falta GMAIL|Supabase no está disponible|No se pudo conectar con Supabase/.test(message) ? 503 : 400;
      const code = /confirmar el correo/.test(message)
        ? 'email_confirm'
        : /al menos 6/.test(message)
          ? 'password_short'
          : /anónimo|anonymous/i.test(message)
            ? 'anonymous_disabled'
            : status === 503
              ? 'supabase_down'
              : 'auth_failed';
      res.status(status).json({ error: message, code });
    }
  });

  app.post('/api/auth/confirm', async (req, res) => {
    try {
      const email = normalizeUsername(req.body?.email || req.body?.username);
      const code = String(req.body?.code || '').trim();
      assertEmail(email);
      if (!/^\d{6}$/.test(code)) {
        res.status(400).json({ error: 'El código tiene 6 números.' });
        return;
      }
      const pending = readPending();
      const signup = pending.find((item) => item.email === email);
      if (!signup) {
        res.status(400).json({ error: 'Pide el código de nuevo. Este ya no está vigente.' });
        return;
      }
      if (!verifyPassword(code, signup.codeHash)) {
        res.status(401).json({ error: 'Ese código no coincide.' });
        return;
      }
      const file = readAccounts();
      const existing = file.users.find((item) => item.username === email);
      if (existing) {
        writePending(pending.filter((item) => item.email !== email));
        await sendAccountSession(res, file, existing);
        return;
      }
      const session = await provisionSupabaseUser();
      const created: Account = {
        id: crypto.randomUUID(),
        username: email,
        passwordHash: signup.passwordHash,
        role: 'user',
        supabaseUserId: session.supabaseUserId,
        refreshToken: session.refreshToken,
        createdAt: new Date().toISOString(),
      };
      file.users.push(created);
      writeAccounts(file);
      writePending(pending.filter((item) => item.email !== email));
      res.status(201).json({
        token: signToken(created),
        username: created.username,
        role: created.role,
        supabaseUserId: created.supabaseUserId,
        supabase: { access_token: session.accessToken, refresh_token: session.refreshToken },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo confirmar el correo.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/auth/me', (req, res) => {
    const account = requireAccount(req, res);
    if (!account) return;
    res.json({
      username: account.username,
      role: account.role,
      supabaseUserId: account.supabaseUserId,
    });
  });

  app.post('/api/auth/session', async (req, res) => {
    const account = requireAccount(req, res);
    if (!account) return;
    const accessToken = String(req.body?.accessToken || '');
    const refreshToken = String(req.body?.refreshToken || '');
    if (!accessToken || !refreshToken) {
      res.status(400).json({ error: 'Falta la sesión que hay que guardar.' });
      return;
    }
    const { data, error } = await supabaseAuth().auth.getUser(accessToken);
    if (error || data.user?.id !== account.supabaseUserId) {
      res.status(401).json({ error: 'La sesión no corresponde a esta cuenta.' });
      return;
    }
    const file = readAccounts();
    const stored = file.users.find((item) => item.id === account.id);
    if (!stored) {
      res.json({ ok: true });
      return;
    }
    stored.refreshToken = refreshToken;
    try {
      writeAccounts(file);
    } catch (error) {
      console.error('No se pudieron guardar las cuentas:', error);
      res.status(500).json({ error: 'No se pudo guardar la sesión en este equipo.' });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/admin/users', (req, res) => {
    const account = requireAccount(req, res);
    if (!account) return;
    if (account.role !== 'admin') {
      res.status(403).json({ error: 'Solo la administración puede ver las cuentas.' });
      return;
    }
    res.json({ users: readAccounts().users.map(publicAccount) });
  });

  app.post('/api/admin/users', async (req, res) => {
    const actor = requireAccount(req, res);
    if (!actor) return;
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Solo la administración puede crear cuentas.' });
      return;
    }
    try {
      const username = normalizeUsername(req.body?.username);
      const password = String(req.body?.password || '');
      assertCredentials(username, password);
      const file = readAccounts();
      if (file.users.some((item) => item.username === username)) {
        res.status(409).json({ error: 'Ese usuario ya existe.' });
        return;
      }
      let session: { supabaseUserId: string; refreshToken: string; accessToken: string };
      try {
        session = username.includes('@')
          ? await provisionEmailAuth(username, password)
          : await provisionSupabaseUser();
      } catch (error) {
        if (!username.includes('@') && anonymousDisabled(error)) {
          res.status(400).json({ error: 'En este servidor la cuenta nueva tiene que ser un correo.' });
          return;
        }
        throw error;
      }
      const created: Account = {
        id: crypto.randomUUID(),
        username,
        passwordHash: hashPassword(password),
        role: 'user',
        supabaseUserId: session.supabaseUserId,
        refreshToken: session.refreshToken,
        createdAt: new Date().toISOString(),
      };
      file.users.push(created);
      writeAccounts(file);
      res.status(201).json({ user: publicAccount(created) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la cuenta.';
      res.status(400).json({ error: message });
    }
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    const actor = requireAccount(req, res);
    if (!actor) return;
    if (actor.role !== 'admin') {
      res.status(403).json({ error: 'Solo la administración puede eliminar cuentas.' });
      return;
    }
    const file = readAccounts();
    const target = file.users.find((item) => item.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'No se encontró esa cuenta.' });
      return;
    }
    if (target.role === 'admin' || target.id === actor.id) {
      res.status(400).json({ error: 'La cuenta de administración no se puede eliminar.' });
      return;
    }
    file.users = file.users.filter((item) => item.id !== target.id);
    writeAccounts(file);
    res.json({ ok: true });
  });
}
