import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_COLLECTIONS, deleteCollectionsTolerant, OPTIONAL_ACCOUNT_COLLECTIONS } from '../src/utils/tolerantDelete';

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });

describe('Borrado de la cuenta (deleteCollectionsTolerant)', () => {
  it('si todo funciona, borra en orden y no omite nada', async () => {
    const remove = vi.fn(async (_name: string) => undefined);
    const result = await deleteCollectionsTolerant(['a', 'b', 'c'], ['c'], remove);
    expect(remove.mock.calls.map(([name]) => name)).toEqual(['a', 'b', 'c']);
    expect(result.skipped).toEqual([]);
  });

  it('un permiso denegado en una colección opcional se omite y el borrado sigue', async () => {
    const remove = vi.fn(async (name: string) => { if (name === 'behavior') throw denied(); });
    const result = await deleteCollectionsTolerant(ACCOUNT_COLLECTIONS, OPTIONAL_ACCOUNT_COLLECTIONS, remove);
    expect(result.skipped).toEqual(['behavior']);
    // Después de behavior, igual intenta movement_days.
    expect(remove.mock.calls.map(([name]) => name)).toEqual(ACCOUNT_COLLECTIONS);
  });

  it('un permiso denegado en una colección obligatoria detiene el borrado', async () => {
    const remove = vi.fn(async (name: string) => { if (name === 'activities') throw denied(); });
    await expect(deleteCollectionsTolerant(ACCOUNT_COLLECTIONS, OPTIONAL_ACCOUNT_COLLECTIONS, remove)).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('otro error lo detiene aunque la colección sea opcional', async () => {
    const remove = vi.fn(async (name: string) => { if (name === 'behavior') throw Object.assign(new Error('sin conexión'), { code: 'unavailable' }); });
    await expect(deleteCollectionsTolerant(ACCOUNT_COLLECTIONS, OPTIONAL_ACCOUNT_COLLECTIONS, remove)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('nunca borra consentimientos ni solicitudes de datos', () => {
    expect(ACCOUNT_COLLECTIONS).not.toContain('consent_events');
    expect(ACCOUNT_COLLECTIONS).not.toContain('data_requests');
    expect(OPTIONAL_ACCOUNT_COLLECTIONS.every((name) => ACCOUNT_COLLECTIONS.includes(name))).toBe(true);
  });
});
