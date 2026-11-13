/**
 * Textos canónicos del flujo de consentimiento.
 * Cambiar CONSENT_VERSION solo si cambia la finalidad o el alcance.
 * Una corrección editorial que no modifique estos textos no debe cambiar la versión:
 * si cambia, la aplicación vuelve a pedir la decisión. No convierte el uso anterior en autorización.
 */
export const CONSENT_VERSION = '2026-11-borrador-1';
export const PRIVACY_LOGIN_KEY = 'cyclia_privacy_read';

export function privacyAcceptedAtLogin(): boolean {
  try {
    return sessionStorage.getItem(PRIVACY_LOGIN_KEY) === '1' || localStorage.getItem(PRIVACY_LOGIN_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberPrivacyAcceptance(accepted: boolean): void {
  try {
    if (accepted) {
      sessionStorage.setItem(PRIVACY_LOGIN_KEY, '1');
      localStorage.setItem(PRIVACY_LOGIN_KEY, '1');
    } else {
      sessionStorage.removeItem(PRIVACY_LOGIN_KEY);
      localStorage.removeItem(PRIVACY_LOGIN_KEY);
    }
  } catch {
    // El navegador puede bloquear el almacenamiento.
  }
}

export const CONSENT_PURPOSES = ['terms', 'privacy_notice', 'health_cycle', 'gemini_assistant', 'google_calendar'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentAction = 'accept' | 'reject' | 'withdraw';
export type ConsentSource = 'new_user' | 'existing_user' | 'privacy_settings';

export const REQUIRED_PURPOSES = ['terms', 'privacy_notice', 'health_cycle'] as const satisfies readonly ConsentPurpose[];
export const OPTIONAL_PURPOSES = ['gemini_assistant'] as const satisfies readonly ConsentPurpose[];

export const CONSENT_STATEMENTS: Record<ConsentPurpose, string> = {
  terms: 'Acepto los Términos de uso de Cyclia.',
  privacy_notice: 'He leído la Política de privacidad, donde se explica cómo se trata mi información y cómo ejercer mis derechos.',
  health_cycle: 'Autorizo expresamente a [PENDIENTE: responsable del tratamiento] a tratar los datos de salud que decida registrar, incluidos mis registros menstruales, síntomas, ánimo y datos del perfil de ciclo, para guardar mi historial, mostrar el seguimiento de mi ciclo y generar estimaciones de los próximos ciclos, según el borrador de Política de privacidad. Puedo retirar esta autorización desde Privacidad y datos. Esta autorización no cubre el asistente de inteligencia artificial.',
  gemini_assistant: 'Autorizo, de forma opcional, a que Cyclia envíe a Google Gemini los datos de mi perfil, mis registros y los mensajes que yo escriba, solo para generar el análisis del registro y las respuestas de Cyclia IA. Puedo rechazar esta opción y seguir usando el seguimiento del ciclo. Esta casilla no autoriza entrenar modelos de inteligencia artificial.',
  google_calendar: 'Autorizo, de forma opcional, a conectar Google Calendar para enviar las actividades que yo sincronice desde Cyclia. Puedo rechazar esta opción y guardar actividades solo dentro de Cyclia.',
};

export function isConsentPurpose(value: string): value is ConsentPurpose {
  return (CONSENT_PURPOSES as readonly string[]).includes(value);
}

export function isConsentAction(value: string): value is ConsentAction {
  return value === 'accept' || value === 'reject' || value === 'withdraw';
}

export function isConsentSource(value: string): value is ConsentSource {
  return value === 'new_user' || value === 'existing_user' || value === 'privacy_settings';
}
