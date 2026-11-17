/**
 * Cyclia Plus: paid features that are temporarily on for everyone.
 * Before each one is used, the app tells her it is a paid option and waits for her OK.
 * When the Plus plan exists, this is where each feature will check the plan instead.
 */

export const PLUS_FEATURES = {
  dia_dificil: {
    name: 'Hoy es un día difícil',
    detail: 'Reorganiza tu día en lo que se mantiene, lo que se acorta y lo que puede esperar.',
  },
  patron_propio: {
    name: 'Tu patrón propio',
    detail: 'Muestra lo que dicen tus registros sobre tu ciclo, tu sueño y tu energía.',
  },
  cyclia_asiste: {
    name: 'Cyclia te asiste',
    detail: 'La IA ordena tu actividad en pasos y estima el esfuerzo y el tiempo.',
  },
  analisis_dia: {
    name: 'Análisis del día con IA',
    detail: 'Un comentario de la IA sobre tu registro de cada día.',
  },
  chat_ia: {
    name: 'Chat Cyclia IA',
    detail: 'Responde tus preguntas sobre tu ciclo y tu día.',
  },
  patron_mensual: {
    name: 'Tu patrón del mes',
    detail: 'Cada mes, la IA estudia tus registros y te cuenta qué patrón presentas.',
  },
} as const;

export type PlusFeature = keyof typeof PLUS_FEATURES;

export const PLUS_NOTICE_TITLE = 'La opción que estás probando es de pago';

export function plusNoticeText(feature: PlusFeature): string {
  return `«${PLUS_FEATURES[feature].name}» es parte de Cyclia Plus. Por ahora está activada temporalmente para que la pruebes sin costo.`;
}

/**
 * How often the notice appears for each feature.
 * 'session': once per feature until she closes the app. 'always': every time she uses it.
 */
export const PLUS_NOTICE_REPEAT: 'session' | 'always' = 'session';

const KEY_PREFIX = 'cyclia_plus_aviso_';

type SimpleStorage = Pick<Storage, 'getItem' | 'setItem'>;

function sessionStore(): SimpleStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** True when she already gave her OK for this feature in this session. */
export function plusNoticeSeen(feature: PlusFeature, store: SimpleStorage | null = sessionStore()): boolean {
  if (PLUS_NOTICE_REPEAT === 'always' || !store) return false;
  try {
    return store.getItem(`${KEY_PREFIX}${feature}`) === '1';
  } catch {
    return false;
  }
}

export function rememberPlusNotice(feature: PlusFeature, store: SimpleStorage | null = sessionStore()): void {
  if (PLUS_NOTICE_REPEAT === 'always' || !store) return;
  try {
    store.setItem(`${KEY_PREFIX}${feature}`, '1');
  } catch {
    // Storage can be blocked; the notice then appears again next time.
  }
}
