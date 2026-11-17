import { describe, expect, it } from 'vitest';
import {
  PLUS_FEATURES,
  PLUS_NOTICE_TITLE,
  plusNoticeSeen,
  plusNoticeText,
  rememberPlusNotice,
  type PlusFeature,
} from '../src/plus/plusFeatures';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

describe('Aviso de funciones Plus (src/plus/plusFeatures.ts)', () => {
  it('cubre las 6 funciones Plus construidas', () => {
    expect(Object.keys(PLUS_FEATURES).sort()).toEqual(['analisis_dia', 'chat_ia', 'cyclia_asiste', 'dia_dificil', 'patron_mensual', 'patron_propio']);
  });

  it('dice que la opción es de pago y que está activada temporalmente', () => {
    expect(PLUS_NOTICE_TITLE).toBe('La opción que estás probando es de pago');
    for (const feature of Object.keys(PLUS_FEATURES) as PlusFeature[]) {
      const text = plusNoticeText(feature);
      expect(text).toContain(PLUS_FEATURES[feature].name);
      expect(text).toMatch(/activada temporalmente/);
    }
  });

  it('después del OK no vuelve a aparecer para esa función en la sesión', () => {
    const store = memoryStore();
    expect(plusNoticeSeen('chat_ia', store)).toBe(false);
    rememberPlusNotice('chat_ia', store);
    expect(plusNoticeSeen('chat_ia', store)).toBe(true);
    // Cada función tiene su propio aviso.
    expect(plusNoticeSeen('dia_dificil', store)).toBe(false);
  });

  it('si el navegador bloquea el almacenamiento, el aviso vuelve a aparecer', () => {
    expect(plusNoticeSeen('chat_ia', null)).toBe(false);
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(() => rememberPlusNotice('chat_ia', broken)).not.toThrow();
    expect(plusNoticeSeen('chat_ia', broken)).toBe(false);
  });
});
