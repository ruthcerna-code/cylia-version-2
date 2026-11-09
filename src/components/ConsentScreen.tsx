import React, { useId, useRef, useState } from 'react';
import { CONSENT_STATEMENTS, OPTIONAL_PURPOSES, PRIVACY_LOGIN_KEY, REQUIRED_PURPOSES, type ConsentPurpose } from '../consentCopy';
import { saveConsentDecisions, type ConsentStatus } from '../consentApi';
import DataRequestForm from './DataRequestForm';
import { DraftBanner, PrivacyDraft, PrivacySummary, TermsDraft } from './LegalDrafts';

type Checked = Record<ConsentPurpose, boolean>;

const EMPTY: Checked = {
  terms: false,
  privacy_notice: false,
  health_cycle: false,
  gemini_assistant: false,
  google_calendar: false,
};
const privacyReadAtLogin = () => {
  try {
    return sessionStorage.getItem(PRIVACY_LOGIN_KEY) === '1';
  } catch {
    return false;
  }
};

const FIELD_ERROR: Partial<Record<ConsentPurpose, string>> = {
  terms: 'Falta aceptar los Términos de uso.',
  privacy_notice: 'Falta la constancia de haber leído la Política de privacidad.',
  health_cycle: 'Falta tu autorización para tratar los datos de salud necesarios para esta función.',
};

function firstMissing(checked: Checked): ConsentPurpose | null {
  return REQUIRED_PURPOSES.find((purpose) => !checked[purpose]) || null;
}

export default function ConsentScreen({
  variant,
  onSaved,
  onExit,
}: {
  variant: 'new' | 'existing';
  onSaved: (status: ConsentStatus) => void;
  onExit: () => void;
}) {
  const baseId = useId();
  const [checked, setChecked] = useState<Checked>(() => ({ ...EMPTY, privacy_notice: privacyReadAtLogin() }));
  const [view, setView] = useState<'form' | 'policy' | 'terms' | 'support' | 'rights'>('form');
  const [errors, setErrors] = useState<ConsentPurpose[]>([]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const boxRefs = useRef<Partial<Record<ConsentPurpose, HTMLInputElement | null>>>({});

  const mark = (purpose: ConsentPurpose, value: boolean) => {
    setChecked((current) => ({ ...current, [purpose]: value }));
    setErrors((current) => current.filter((item) => item !== purpose));
  };

  const persist = async (decisions: { purpose: ConsentPurpose; action: 'accept' | 'reject' }[]) => {
    setSaving(true);
    setFormError('');
    try {
      const status = await saveConsentDecisions(variant === 'existing' ? 'existing_user' : 'new_user', decisions);
      return status;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No pudimos guardar tu decisión. Inténtalo nuevamente.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const continueWithDecisions = async () => {
    const missing = REQUIRED_PURPOSES.filter((purpose) => !checked[purpose]);
    if (missing.length > 0) {
      setErrors(missing);
      setFormError('Para continuar con el seguimiento de tu ciclo, completa las casillas obligatorias indicadas. Las opciones adicionales son voluntarias.');
      const first = firstMissing(checked);
      if (first) boxRefs.current[first]?.focus();
      return;
    }
    const decisions = [
      ...REQUIRED_PURPOSES.map((purpose) => ({ purpose, action: 'accept' as const })),
      ...OPTIONAL_PURPOSES.map((purpose) => ({ purpose, action: (checked[purpose] ? 'accept' : 'reject') as 'accept' | 'reject' })),
    ];
    const status = await persist(decisions);
    if (status?.requiredComplete) onSaved(status);
    else if (status) setFormError('No pudimos guardar tu decisión. Inténtalo nuevamente.');
  };

  const declineAndExit = async () => {
    const decisions = [...REQUIRED_PURPOSES, ...OPTIONAL_PURPOSES].map((purpose) => ({
      purpose,
      action: 'reject' as const,
    }));
    const status = await persist(decisions);
    if (status) onExit();
  };

  const checkbox = (purpose: ConsentPurpose, required: boolean) => {
    const inputId = `${baseId}-${purpose}`;
    const errorId = `${inputId}-error`;
    const invalid = errors.includes(purpose);
    return (
      <div className="rounded-[20px] bg-white p-4" key={purpose}>
        <label htmlFor={inputId} className="flex items-start gap-3 text-sm leading-relaxed">
          <input
            id={inputId}
            ref={(node) => { boxRefs.current[purpose] = node; }}
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-[#3A44C4]"
            checked={checked[purpose]}
            disabled={purpose === 'privacy_notice' && privacyReadAtLogin()}
            aria-required={required}
            aria-invalid={invalid}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(event) => mark(purpose, event.target.checked)}
          />
          <span>
            {purpose === 'privacy_notice' && privacyReadAtLogin() && <span className="mb-1 block text-[11px] font-extrabold tracking-wide text-[#3A44C4]">CONFIRMADA AL ENTRAR</span>}
            {required && !(purpose === 'privacy_notice' && privacyReadAtLogin()) && <span className="mb-1 block text-[11px] font-extrabold tracking-wide text-[#4A4F7A]">OBLIGATORIA PARA EL SEGUIMIENTO</span>}
            {!required && <span className="mb-1 block text-[11px] font-extrabold tracking-wide text-[#4A4F7A]">OPCIONAL</span>}
            {CONSENT_STATEMENTS[purpose]}
          </span>
        </label>
        {invalid && <p id={errorId} className="mb-0 mt-2 text-sm font-bold text-[#9C3B45]">{FIELD_ERROR[purpose]}</p>}
      </div>
    );
  };

  if (view !== 'form') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-4 px-4 py-6">
        <button type="button" onClick={() => setView('form')} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Volver a mis decisiones</button>
        {view === 'policy' && <PrivacyDraft />}
        {view === 'terms' && <TermsDraft />}
        {view === 'support' && (
          <section className="rounded-[20px] bg-white p-4 text-sm leading-relaxed">
            <h1 className="m-0 text-[26px] font-extrabold">Soporte</h1>
            <p>Cyclia IA no está disponible mientras falte su autorización. El contacto de privacidad y el canal de soporte todavía no están definidos.</p>
            <p className="mb-0">[PENDIENTE: correo de contacto para privacidad]</p>
          </section>
        )}
        {view === 'rights' && (
          <section className="rounded-[20px] bg-white p-4 text-sm leading-relaxed">
            <h1 className="m-0 text-[26px] font-extrabold">Solicitudes sobre tus datos</h1>
            <p>Puedes pedir acceso, corrección o eliminación sin tener que aceptar el seguimiento. Enviar la solicitud no borra la cuenta ni el historial.</p>
            <p>El procedimiento de respuesta está pendiente de definición. Enviar una solicitud no exige aceptar el seguimiento ni borra la cuenta.</p>
            <DataRequestForm />
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-4 px-4 py-6 pb-16">
      <DraftBanner />
      <h1 className="m-0 text-[28px] font-extrabold">Tu información, tus decisiones</h1>
      {variant === 'existing' && (
        <p className="m-0 text-sm font-bold leading-relaxed">Antes de continuar, revisa la información sobre el tratamiento de tus datos y registra tus decisiones.</p>
      )}
      <p className="m-0 text-sm leading-relaxed text-[#3B4070]">Para el seguimiento del ciclo hacen falta las casillas obligatorias. El asistente es aparte. Las actividades se guardan en Cyclia.</p>
      <PrivacySummary />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setView('policy')} className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]">Política de privacidad</button>
        <button type="button" onClick={() => setView('terms')} className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]">Términos de uso</button>
        <button type="button" onClick={() => setView('rights')} className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]">Solicitudes sobre tus datos</button>
        <button type="button" onClick={() => setView('support')} className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]">Soporte</button>
      </div>
      {formError && <p className="m-0 rounded-[16px] bg-white p-3 text-sm font-bold text-[#9C3B45]" role="alert">{formError}</p>}
      {checkbox('terms', true)}
      {checkbox('privacy_notice', true)}
      {checkbox('health_cycle', true)}
      {checkbox('gemini_assistant', false)}
      <button type="button" disabled={saving} onClick={() => { void continueWithDecisions(); }} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E] disabled:opacity-60">
        {saving ? 'Guardando…' : 'Guardar mis decisiones y continuar'}
      </button>
      <button type="button" disabled={saving} onClick={() => { void declineAndExit(); }} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-white text-[15px] font-extrabold text-[#1B1F5E] disabled:opacity-60">
        No aceptar y salir
      </button>
      <button type="button" onClick={onExit} className="mx-auto cursor-pointer text-sm font-extrabold text-[#3A44C4]">Cerrar sesión</button>
    </main>
  );
}
