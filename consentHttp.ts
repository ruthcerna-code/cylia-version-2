import type { Request } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CONSENT_STATEMENTS,
  CONSENT_VERSION,
  REQUIRED_PURPOSES,
  type ConsentAction,
  type ConsentPurpose,
  type ConsentSource,
  isConsentAction,
  isConsentPurpose,
  isConsentSource,
} from './src/consentCopy';

export class ConsentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function supabaseEnv() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new ConsentError(500, 'Supabase no está configurado en el servidor.');
  return { url, key };
}

export function userClient(jwt: string): SupabaseClient {
  const { url, key } = supabaseEnv();
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireSession(req: Request) {
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new ConsentError(401, 'Inicia sesión para continuar.');
  const { url, key } = supabaseEnv();
  const authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.getUser(jwt);
  if (error || !data.user) throw new ConsentError(401, 'La sesión no es válida. Vuelve a entrar.');
  return { client: userClient(jwt), userId: data.user.id, jwt };
}

export async function assertConsent(client: SupabaseClient, purpose: ConsentPurpose) {
  const { data, error } = await client.rpc('has_consent', { requested_purpose: purpose });
  if (error) {
    console.error('[Consentimiento] No se pudo verificar:', error.message);
    throw new ConsentError(503, 'No pudimos verificar tu autorización. Inténtalo nuevamente.');
  }
  if (data !== true) {
    throw new ConsentError(403, 'Falta una autorización vigente para esta función.');
  }
}

export async function assertConsentFromRequest(req: Request, purpose: ConsentPurpose) {
  const { client } = await requireSession(req);
  await assertConsent(client, purpose);
}

type ConsentRow = {
  id: number;
  purpose: ConsentPurpose;
  action: ConsentAction;
  policy_version: string;
  statement_text: string;
  source: ConsentSource;
  created_at: string;
};

export async function readConsentRows(client: SupabaseClient): Promise<ConsentRow[]> {
  const { data, error } = await client
    .from('consent_events')
    .select('id, purpose, action, policy_version, statement_text, source, created_at')
    .order('id', { ascending: true });
  if (error) {
    console.error('[Consentimiento] No se pudo leer:', error.message);
    throw new ConsentError(503, 'No pudimos leer tus decisiones. Inténtalo nuevamente.');
  }
  return (data || []) as ConsentRow[];
}

export function summarizeConsent(rows: ConsentRow[]) {
  const current = rows.filter((row) => row.policy_version === CONSENT_VERSION);
  const latest: Partial<Record<ConsentPurpose, ConsentAction>> = {};
  for (const row of current) {
    if (isConsentPurpose(row.purpose) && isConsentAction(row.action)) latest[row.purpose] = row.action;
  }
  const requiredComplete = REQUIRED_PURPOSES.every((purpose) => latest[purpose] === 'accept');
  return {
    version: CONSENT_VERSION,
    draft: true,
    requiredComplete,
    purposes: latest,
    statements: CONSENT_STATEMENTS,
  };
}

export function decisionsFromBody(body: unknown): { purpose: ConsentPurpose; action: ConsentAction }[] {
  const entries = (body as { decisions?: unknown })?.decisions;
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 8) {
    throw new ConsentError(400, 'La decisión enviada no es válida.');
  }
  return entries.map((entry) => {
    const purpose = String((entry as { purpose?: string })?.purpose || '');
    const action = String((entry as { action?: string })?.action || '');
    if (!isConsentPurpose(purpose) || !isConsentAction(action)) {
      throw new ConsentError(400, 'La decisión enviada no es válida.');
    }
    return { purpose, action };
  });
}

export function sourceFromBody(body: unknown): ConsentSource {
  const source = String((body as { source?: string })?.source || '');
  if (!isConsentSource(source)) throw new ConsentError(400, 'El origen de la decisión no es válido.');
  return source;
}
