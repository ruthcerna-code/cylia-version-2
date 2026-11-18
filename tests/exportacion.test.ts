import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsentError, readExportBundle } from '../consentHttp';

type Reply = { status: number; body?: unknown };

/** Fake Firestore REST: answers by collection name, and by page token when there is one. */
function fakeFirestore(replies: Record<string, Reply | Reply[]>) {
  const fetchMock = vi.fn(async (url: string) => {
    const path = String(url).split('/documents/')[1] || '';
    const [resource, query = ''] = path.split('?');
    const name = resource.split('/')[2] ?? 'perfil';
    const page = new URLSearchParams(query).get('pageToken') ? 1 : 0;
    const entry = replies[name] ?? { status: 200, body: { documents: [] } };
    const reply = Array.isArray(entry) ? entry[page] : entry;
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const doc = (id: string, fields: Record<string, unknown>) => ({
  name: `projects/p/databases/(default)/documents/users/u/daily_logs/${id}`,
  fields,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Exportación de datos (readExportBundle)', () => {
  it('omite behavior y movement_days si Firestore no permite leerlas, sin fallar', async () => {
    fakeFirestore({
      perfil: { status: 404 },
      daily_logs: { status: 200, body: { documents: [doc('2026-11-17', { date: { stringValue: '2026-11-17' }, energy: { integerValue: '3' } })] } },
      behavior: { status: 403, body: { error: { status: 'PERMISSION_DENIED' } } },
      movement_days: { status: 403, body: { error: { status: 'PERMISSION_DENIED' } } },
    });
    const bundle = await readExportBundle('jwt', 'u');
    expect(bundle.profile).toBeNull();
    expect(bundle.dailyLogs).toEqual([{ id: '2026-11-17', date: '2026-11-17', energy: 3 }]);
    expect(bundle.behavior).toEqual([]);
    expect(bundle.movementDays).toEqual([]);
    expect([...bundle.omitted].sort()).toEqual(['behavior', 'movement_days']);
  });

  it('con todo legible, no omite nada', async () => {
    fakeFirestore({ perfil: { status: 404 } });
    const bundle = await readExportBundle('jwt', 'u');
    expect(bundle.omitted).toEqual([]);
  });

  it('si una colección obligatoria no se puede leer, la exportación falla con 500', async () => {
    fakeFirestore({ perfil: { status: 404 }, daily_logs: { status: 403 } });
    await expect(readExportBundle('jwt', 'u')).rejects.toMatchObject({ status: 500 });
    await expect(readExportBundle('jwt', 'u')).rejects.toBeInstanceOf(ConsentError);
  });

  it('lee todas las páginas de una colección', async () => {
    const fetchMock = fakeFirestore({
      perfil: { status: 404 },
      daily_logs: [
        { status: 200, body: { documents: [doc('2026-11-16', { date: { stringValue: '2026-11-16' } })], nextPageToken: 'pagina-2' } },
        { status: 200, body: { documents: [doc('2026-11-17', { date: { stringValue: '2026-11-17' } })] } },
      ],
    });
    const bundle = await readExportBundle('jwt', 'u');
    expect(bundle.dailyLogs.map((row) => row.date)).toEqual(['2026-11-16', '2026-11-17']);
    const logCalls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes('/daily_logs?'));
    expect(logCalls).toHaveLength(2);
    expect(logCalls[1]).toContain('pageToken=pagina-2');
  });
});
