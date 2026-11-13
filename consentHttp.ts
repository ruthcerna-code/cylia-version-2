import dotenv from 'dotenv';
import type { Request } from 'express';

dotenv.config();
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
} from './src/consentCopy.js';

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'cyclia-mvp';

function firebaseApiKey(): string {
  const key = process.env.VITE_FIREBASE_API_KEY?.trim();
  if (!key) throw new ConsentError(500, 'Falta VITE_FIREBASE_API_KEY en el servidor.');
  return key;
}

export class ConsentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type ConsentRow = {
  id: string;
  purpose: ConsentPurpose;
  action: ConsentAction;
  policy_version: string;
  statement_text: string;
  source: ConsentSource;
  created_at: string;
};

type FirestoreValue = { stringValue?: string; integerValue?: string; booleanValue?: boolean; nullValue?: null; mapValue?: { fields?: Record<string, FirestoreValue> }; arrayValue?: { values?: FirestoreValue[] } };
type FirestoreDoc = { name?: string; fields?: Record<string, FirestoreValue>; createTime?: string };

function fieldString(fields: Record<string, FirestoreValue> | undefined, name: string): string {
  return fields?.[name]?.stringValue || '';
}

function decodeDoc(doc: FirestoreDoc): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    if (value.stringValue !== undefined) out[key] = value.stringValue;
    else if (value.integerValue !== undefined) out[key] = Number(value.integerValue);
    else if (value.booleanValue !== undefined) out[key] = value.booleanValue;
    else if (value.nullValue !== undefined) out[key] = null;
  }
  out.id = doc.name?.split('/').pop() || '';
  return out;
}

async function firestore(jwt: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function requireSession(req: Request) {
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new ConsentError(401, 'Inicia sesión para continuar.');
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: jwt }),
  });
  const body = await lookup.json().catch(() => ({}));
  const userId = body?.users?.[0]?.localId;
  if (!lookup.ok || typeof userId !== 'string') throw new ConsentError(401, 'La sesión no es válida. Vuelve a entrar.');
  return { userId, jwt };
}

export async function readConsentRows(jwt: string, userId: string): Promise<ConsentRow[]> {
  const response = await firestore(jwt, `users/${userId}/consent_events`);
  if (response.status === 404) return [];
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[Consentimiento] No se pudo leer:', body?.error?.message || response.status);
    throw new ConsentError(503, 'No pudimos leer tus decisiones. Inténtalo nuevamente.');
  }
  return ((body.documents || []) as FirestoreDoc[]).map((doc) => {
    const data = decodeDoc(doc);
    return {
      id: String(data.id || ''),
      purpose: data.purpose as ConsentPurpose,
      action: data.action as ConsentAction,
      policy_version: String(data.policyVersion || ''),
      statement_text: String(data.statementText || ''),
      source: data.source as ConsentSource,
      created_at: doc.createTime || new Date().toISOString(),
    };
  });
}

export async function writeConsent(jwt: string, userId: string, purpose: ConsentPurpose, action: ConsentAction, source: ConsentSource) {
  const response = await firestore(jwt, `users/${userId}/consent_events`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        purpose: { stringValue: purpose },
        action: { stringValue: action },
        source: { stringValue: source },
        policyVersion: { stringValue: CONSENT_VERSION },
        statementText: { stringValue: CONSENT_STATEMENTS[purpose] },
      },
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('[Consentimiento] No se pudo guardar:', body?.error?.message || response.status);
    throw new ConsentError(500, 'No pudimos guardar tu decisión. Inténtalo nuevamente.');
  }
}

export async function writeDataRequest(jwt: string, userId: string, kind: string, detail: string) {
  const response = await firestore(jwt, `users/${userId}/data_requests`, {
    method: 'POST',
    body: JSON.stringify({
      fields: {
        kind: { stringValue: kind },
        detail: { stringValue: detail },
      },
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('[Datos] No se pudo registrar la solicitud:', body?.error?.message || response.status);
    throw new ConsentError(500, 'No pudimos guardar tu solicitud. Inténtalo nuevamente.');
  }
}

async function readCollection(jwt: string, userId: string, name: string): Promise<Record<string, unknown>[]> {
  const response = await firestore(jwt, `users/${userId}/${name}`);
  if (response.status === 404) return [];
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ConsentError(500, 'No pudimos preparar tu archivo. Inténtalo nuevamente.');
  return ((body.documents || []) as FirestoreDoc[]).map(decodeDoc);
}

export async function readExportBundle(jwt: string, userId: string) {
  const profileResponse = await firestore(jwt, `users/${userId}`);
  const profileBody = profileResponse.status === 404 ? {} : await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok && profileResponse.status !== 404) {
    throw new ConsentError(500, 'No pudimos preparar tu archivo. Inténtalo nuevamente.');
  }
  const profile = profileResponse.ok ? decodeDoc(profileBody as FirestoreDoc) : null;
  const [dailyLogs, activities, messages, dataRequests, periodRecords, focusDocs] = await Promise.all([
    readCollection(jwt, userId, 'daily_logs'),
    readCollection(jwt, userId, 'activities'),
    readCollection(jwt, userId, 'messages'),
    readCollection(jwt, userId, 'data_requests'),
    readCollection(jwt, userId, 'period_records'),
    readCollection(jwt, userId, 'focus'),
  ]);
  return { profile, dailyLogs, activities, messages, dataRequests, periodRecords, focus: focusDocs[0]?.payload ?? null };
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

export async function assertConsentFromRequest(req: Request, purpose: ConsentPurpose) {
  const { jwt, userId } = await requireSession(req);
  const rows = await readConsentRows(jwt, userId);
  const summary = summarizeConsent(rows);
  if (summary.purposes[purpose] !== 'accept') {
    throw new ConsentError(403, 'Falta una autorización vigente para esta función.');
  }
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
