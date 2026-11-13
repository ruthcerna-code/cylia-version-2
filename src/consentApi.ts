import type { ConsentAction, ConsentPurpose, ConsentSource } from './consentCopy';
import { currentIdToken } from './firebase';

export type ConsentStatus = {
  version: string;
  draft: boolean;
  requiredComplete: boolean;
  purposes: Partial<Record<ConsentPurpose, ConsentAction>>;
};

export type ConsentEvent = {
  id: number;
  purpose: ConsentPurpose;
  action: ConsentAction;
  policy_version: string;
  statement_text: string;
  source: ConsentSource;
  created_at: string;
};

async function authHeaders(): Promise<HeadersInit> {
  const token = await currentIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(path, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'No pudimos guardar tu decisión. Inténtalo nuevamente.') as Error & { missing?: string[] };
    error.missing = body.missing;
    throw error;
  }
  return body as T;
}

export function fetchConsentStatus(): Promise<ConsentStatus> {
  return request<ConsentStatus>('/api/consent/status');
}

export function fetchConsentHistory(): Promise<{ events: ConsentEvent[] }> {
  return request('/api/consent/history');
}

export function saveConsentDecisions(source: ConsentSource, decisions: { purpose: ConsentPurpose; action: ConsentAction }[]): Promise<ConsentStatus> {
  return request<ConsentStatus>('/api/consent/decisions', {
    method: 'POST',
    body: JSON.stringify({ source, decisions }),
  });
}

export function submitDataRequest(kind: 'access' | 'correction' | 'deletion' | 'other', detail: string): Promise<{ ok: boolean }> {
  return request('/api/data-requests', {
    method: 'POST',
    body: JSON.stringify({ kind, detail }),
  });
}

export async function authBearer(): Promise<string> {
  return currentIdToken();
}
