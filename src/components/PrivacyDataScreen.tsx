import { useEffect, useState } from 'react';
import { CONSENT_STATEMENTS, type ConsentPurpose } from '../consentCopy';
import { fetchConsentHistory, saveConsentDecisions, type ConsentEvent, type ConsentStatus } from '../consentApi';
import DataRequestForm from './DataRequestForm';
import { PrivacyDraft, TermsDraft } from './LegalDrafts';

const WITHDRAW_EFFECT: Partial<Record<ConsentPurpose, string>> = {
  health_cycle: 'Si retiras la autorización de salud, el seguimiento del ciclo, los registros nuevos y las estimaciones dejan de estar disponibles. El historial que ya existe no se borra por este retiro.',
  gemini_assistant: 'Si retiras la autorización del asistente, el análisis del registro y Cyclia IA dejan de enviarse a Google Gemini. El seguimiento del ciclo sigue disponible.',
};

const PURPOSE_LABEL: Record<ConsentPurpose, string> = {
  terms: 'Términos de uso',
  privacy_notice: 'Constancia de lectura',
  health_cycle: 'Datos de salud del ciclo',
  gemini_assistant: 'Asistente de inteligencia artificial',
  google_calendar: 'Google Calendar, integración retirada',
};

export default function PrivacyDataScreen({
  status,
  onBack,
  onChanged,
  backLabel = 'Perfil',
}: {
  status: ConsentStatus;
  onBack: () => void;
  onChanged: (status: ConsentStatus) => void;
  backLabel?: string;
}) {
  const [view, setView] = useState<'home' | 'policy' | 'terms'>('home');
  const [events, setEvents] = useState<ConsentEvent[]>([]);
  const [error, setError] = useState('');
  const [pendingWithdraw, setPendingWithdraw] = useState<ConsentPurpose | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchConsentHistory().then((body) => {
      if (!cancelled) setEvents(body.events);
    }).catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    return () => { cancelled = true; };
  }, [status.version, status.requiredComplete, status.purposes.health_cycle, status.purposes.gemini_assistant]);

  const decide = async (purpose: ConsentPurpose, action: 'accept' | 'withdraw') => {
    setBusy(true);
    setError('');
    try {
      const next = await saveConsentDecisions('privacy_settings', [{ purpose, action }]);
      onChanged(next);
      setPendingWithdraw(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar tu decisión. Inténtalo nuevamente.');
    } finally {
      setBusy(false);
    }
  };

  if (view !== 'home') {
    return (
      <div className="flex flex-col gap-3 pt-2">
        <button type="button" onClick={() => setView('home')} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Privacidad y datos</button>
        {view === 'policy' ? <PrivacyDraft /> : <TermsDraft />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← {backLabel}</button>
      <h1 className="m-0 text-[26px] font-extrabold">Privacidad y datos</h1>
      <p className="m-0 text-sm text-[#3B4070]">Las decisiones vigentes corresponden a la versión {status.version}. Este flujo está en revisión y no declara cumplimiento jurídico.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setView('policy')} className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]">Política de privacidad</button>
        <button type="button" onClick={() => setView('terms')} className="min-h-11 cursor-pointer rounded-full bg-white px-4 text-sm font-extrabold text-[#3A44C4]">Términos de uso</button>
      </div>
      {error && <p className="m-0 rounded-[16px] bg-white p-3 text-sm font-bold text-[#9C3B45]" role="alert">{error}</p>}
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Decisiones vigentes</h2>
        <ul className="mb-0 mt-2 list-none space-y-2 p-0 text-sm">
          {(['terms', 'privacy_notice', 'health_cycle', 'gemini_assistant'] as const).map((purpose) => (
            <li key={purpose}>
              <strong>{PURPOSE_LABEL[purpose]}:</strong> {status.purposes[purpose] === 'accept' ? 'autorizada' : status.purposes[purpose] === 'withdraw' ? 'retirada' : status.purposes[purpose] === 'reject' ? 'rechazada' : 'sin decisión en esta versión'}
            </li>
          ))}
        </ul>
      </section>
      {(['health_cycle', 'gemini_assistant'] as const).map((purpose) => (
        <section key={purpose} className="rounded-[20px] bg-white p-4 text-sm">
          <h2 className="m-0 text-base font-extrabold">{PURPOSE_LABEL[purpose]}</h2>
          <p>{CONSENT_STATEMENTS[purpose]}</p>
          {status.purposes[purpose] === 'accept' ? (
            <>
              {pendingWithdraw === purpose && <p className="font-bold">{WITHDRAW_EFFECT[purpose]}</p>}
              {pendingWithdraw === purpose ? (
                <button type="button" disabled={busy} onClick={() => { void decide(purpose, 'withdraw'); }} className="min-h-11 cursor-pointer rounded-full bg-[#F49A9E] px-4 font-extrabold text-[#1B1F5E] disabled:opacity-60">Confirmar retiro</button>
              ) : (
                <button type="button" onClick={() => setPendingWithdraw(purpose)} className="min-h-11 cursor-pointer rounded-full bg-[#F6E27F] px-4 font-extrabold text-[#1B1F5E]">Retirar autorización</button>
              )}
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => { void decide(purpose, 'accept'); }} className="min-h-11 cursor-pointer rounded-full bg-[#A9C4F0] px-4 font-extrabold text-[#1B1F5E] disabled:opacity-60">Autorizar esta opción</button>
          )}
        </section>
      ))}
      <DataRequestForm />
      {events.length > 0 && (
        <section className="rounded-[20px] bg-white p-4 text-sm">
          <h2 className="m-0 text-base font-extrabold">Historial de decisiones</h2>
          <ul className="mb-0 mt-2 list-none space-y-2 p-0">
            {[...events].reverse().map((event) => (
              <li key={event.id}>
                <strong>{PURPOSE_LABEL[event.purpose] || (event.purpose === 'google_calendar' ? 'Google Calendar, integración retirada' : event.purpose)}</strong> · {event.action} · {new Date(event.created_at).toLocaleString('es-CL')} · versión {event.policy_version}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
