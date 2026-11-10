import React, { useState } from 'react';
import { OPTIONAL_PURPOSES, REQUIRED_PURPOSES, type ConsentPurpose } from '../consentCopy';
import { saveConsentDecisions, type ConsentStatus } from '../consentApi';
import DataRequestForm from './DataRequestForm';
import { DraftBanner, PrivacyDraft, TermsDraft } from './LegalDrafts';

export default function ConsentScreen({
  variant,
  onSaved,
  onExit,
}: {
  variant: 'new' | 'existing';
  onSaved: (status: ConsentStatus) => void;
  onExit: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [view, setView] = useState<'form' | 'policy' | 'terms' | 'support' | 'rights'>('form');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

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
    if (!accepted) {
      setFormError('Para continuar, marca la casilla.');
      return;
    }
    const decisions = [
      ...REQUIRED_PURPOSES.map((purpose) => ({ purpose, action: 'accept' as const })),
      ...OPTIONAL_PURPOSES.map((purpose) => ({ purpose, action: 'reject' as const })),
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
      <p className="m-0 text-sm leading-relaxed text-[#3B4070]">El asistente queda aparte y puedes autorizarlo después, en Privacidad y datos.</p>
      {formError && <p className="m-0 rounded-[16px] bg-white p-3 text-sm font-bold text-[#9C3B45]" role="alert">{formError}</p>}
      <label className="flex items-start gap-3 rounded-[20px] bg-[#FFF6CF] p-4 text-sm leading-relaxed text-[#1B1F5E]">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[#3A44C4]"
          checked={accepted}
          aria-invalid={Boolean(formError) && !accepted}
          onChange={(event) => {
            setAccepted(event.target.checked);
            if (event.target.checked) setFormError('');
          }}
        />
        <span>
          Acepto los{' '}
          <button type="button" className="cursor-pointer font-extrabold text-[#3A44C4] underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setView('terms'); }}>Términos de uso</button>
          {' '}y la{' '}
          <button type="button" className="cursor-pointer font-extrabold text-[#3A44C4] underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setView('policy'); }}>Política de privacidad</button>
          , incluido el uso de los datos de mi ciclo para el seguimiento.
        </span>
      </label>
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
