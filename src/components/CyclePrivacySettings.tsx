import { useEffect, useState } from 'react';
import type { UserProfile } from '../types';
import { downloadOwnData } from '../dataExport';
import { validateCycleLength, validatePeriodLength } from '../utils/profileFields';

function wholeDays(value: string): number | null {
  const text = value.trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const number = Number(text);
  if (!Number.isSafeInteger(number)) return null;
  return number;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path fill="currentColor" d="M19.4 13a7.8 7.8 0 0 0 .1-1 7.8 7.8 0 0 0-.1-1l2.1-1.6a.6.6 0 0 0 .1-.8l-2-3.4a.6.6 0 0 0-.7-.3l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.6.6 0 0 0-.6-.5h-4a.6.6 0 0 0-.6.5L9.2 4.9a7.4 7.4 0 0 0-1.7 1l-2.5-1a.6.6 0 0 0-.7.3l-2 3.4a.6.6 0 0 0 .1.8L4.5 11a7.8 7.8 0 0 0-.1 1 7.8 7.8 0 0 0 .1 1l-2.1 1.6a.6.6 0 0 0-.1.8l2 3.4a.6.6 0 0 0 .7.3l2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6a.6.6 0 0 0 .6.5h4a.6.6 0 0 0 .6-.5l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1a.6.6 0 0 0 .7-.3l2-3.4a.6.6 0 0 0-.1-.8L19.4 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path fill="currentColor" d="M12 2 4 5.5v6.2c0 5 3.4 8.4 8 9.8 4.6-1.4 8-4.8 8-9.8V5.5L12 2zm0 2.2 6 2.5v4.9c0 3.8-2.5 6.7-6 7.9-3.5-1.2-6-4.1-6-7.9V6.7l6-2.5z" />
    </svg>
  );
}

export default function CyclePrivacySettings({
  profile,
  onBack,
  onManagePrivacy,
  onSave,
}: {
  profile: UserProfile;
  onBack: () => void;
  onManagePrivacy: () => void;
  onSave: (profile: UserProfile) => Promise<boolean>;
}) {
  const [cycleLength, setCycleLength] = useState(String(profile.cycleLength));
  const [periodLength, setPeriodLength] = useState(String(profile.periodLength));
  const [lengthSource, setLengthSource] = useState<'manual' | 'records'>(profile.lengthSource === 'records' ? 'records' : 'manual');
  const [cycleReminders, setCycleReminders] = useState(Boolean(profile.cycleReminders));
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  ));
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setCycleLength(String(profile.cycleLength));
    setPeriodLength(String(profile.periodLength));
    setLengthSource(profile.lengthSource === 'records' ? 'records' : 'manual');
    setCycleReminders(Boolean(profile.cycleReminders));
  }, [profile]);

  const cycleDays = wholeDays(cycleLength);
  const periodDays = wholeDays(periodLength);
  const fieldError = cycleDays === null || periodDays === null
    ? 'Escribe un número entero de días.'
    : validateCycleLength(cycleDays) || validatePeriodLength(periodDays) || '';
  const savedSource = profile.lengthSource === 'records' ? 'records' : 'manual';
  const dirty = cycleDays !== profile.cycleLength
    || periodDays !== profile.periodLength
    || lengthSource !== savedSource
    || cycleReminders !== Boolean(profile.cycleReminders);

  const toggleReminders = () => {
    const next = !cycleReminders;
    setCycleReminders(next);
    setStatus('idle');
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().then((result) => setPermission(result));
    }
  };

  const save = async () => {
    if (fieldError || cycleDays === null || periodDays === null) {
      setStatus('error');
      setMessage(fieldError);
      return;
    }
    setStatus('saving');
    setMessage('');
    const saved = await onSave({
      ...profile,
      cycleLength: cycleDays,
      periodLength: periodDays,
      lengthSource,
      cycleReminders,
    });
    if (!saved) {
      setStatus('error');
      setMessage('No pudimos guardar los ajustes. Tus registros no se modificaron.');
      return;
    }
    setStatus('success');
    setMessage(lengthSource === 'records'
      ? 'Preferencia guardada. Como todavía no hay varios ciclos observados, el calendario sigue usando la referencia manual.'
      : 'Ajustes guardados. El calendario y las estimaciones usan esta referencia.');
  };

  const exportFile = async () => {
    setExporting(true);
    setMessage('');
    try {
      await downloadOwnData();
      setConfirmExport(false);
      setStatus('success');
      setMessage('Archivo descargado. Contiene solo los datos de tu cuenta.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'No pudimos preparar tu archivo.');
    } finally {
      setExporting(false);
    }
  };

  const delivery = permission === 'denied'
    ? 'El navegador tiene los avisos bloqueados. Cyclia tampoco los programa todavía: esa integración está pendiente.'
    : permission === 'granted'
      ? 'El navegador permite avisos, pero Cyclia todavía no los programa. La integración está pendiente y no se envía ninguno.'
      : permission === 'default'
        ? 'Si activas la opción, el navegador puede pedir permiso. Cyclia todavía no programa avisos.'
        : 'Este navegador no ofrece avisos. La preferencia se puede guardar, pero no hay envío.';

  const fieldClass = 'h-12 rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-base font-semibold text-[#1B1F5E] outline-none';

  return (
    <div className="flex flex-col gap-4 pb-24 pt-2">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Perfil</button>
      <section className="rounded-[24px] border border-[#E7ECFB] bg-white p-5 shadow-[0_8px_24px_rgba(27,31,94,0.06)]">
        <div className="flex items-center gap-3 text-[#3A44C4]">
          <GearIcon />
          <p className="m-0 text-[13px] font-extrabold uppercase tracking-wide">Configuración personal</p>
        </div>
        <h1 className="m-0 mt-3 text-[26px] font-extrabold leading-tight text-[#1B1F5E]">Ajustes del ciclo y privacidad</h1>

        <div className="mt-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold text-[#1B1F5E]">
            Duración promedio del ciclo — días
            <input className={fieldClass} inputMode="numeric" aria-describedby="cycle-help" value={cycleLength} onChange={(event) => { setCycleLength(event.target.value); setStatus('idle'); }} />
            <span id="cycle-help" className="text-[12px] font-semibold leading-snug text-[#4A4F7A]">De 21 a 45 días. Si no hay historial, la primera predicción usa 28.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold text-[#1B1F5E]">
            Duración promedio de la menstruación — días
            <input className={fieldClass} inputMode="numeric" aria-describedby="period-help" value={periodLength} onChange={(event) => { setPeriodLength(event.target.value); setStatus('idle'); }} />
            <span id="period-help" className="text-[12px] font-semibold leading-snug text-[#4A4F7A]">De 1 a 10 días. Si no se sabe, la primera predicción usa 5.</span>
          </label>
        </div>
        {fieldError && <p className="m-0 mt-3 text-sm font-semibold text-[#9A3B45]" role="alert">{fieldError}</p>}

        <fieldset className="mt-4 rounded-2xl bg-[#F8F9FE] p-3">
          <legend className="px-1 text-[13px] font-extrabold text-[#1B1F5E]">Origen del valor</legend>
          <p className="m-0 text-[12px] font-semibold leading-snug text-[#4A4F7A]">
            En uso: referencia manual de {profile.cycleLength} y {profile.periodLength} días. Cyclia guarda un solo inicio de referencia, así que todavía no hay un promedio calculado a partir de varios ciclos.
          </p>
          <label className="mt-3 flex items-start gap-2 text-sm font-bold text-[#1B1F5E]">
            <input type="radio" name="length-source" checked={lengthSource === 'manual'} onChange={() => { setLengthSource('manual'); setStatus('idle'); }} />
            Usar el valor que escribo
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm font-bold text-[#1B1F5E]">
            <input type="radio" name="length-source" checked={lengthSource === 'records'} onChange={() => { setLengthSource('records'); setStatus('idle'); }} />
            Usar promedio de mis registros
          </label>
          {lengthSource === 'records' && (
            <p className="m-0 mt-2 text-[12px] font-semibold leading-snug text-[#4A4F7A]">
              No hay historial suficiente. Al guardar, el valor escrito se conserva y las estimaciones siguen la referencia manual.
            </p>
          )}
        </fieldset>

        <div className="mt-4 flex items-start justify-between gap-3 border-t border-[#E7ECFB] pt-4">
          <div>
            <h2 className="m-0 text-[15px] font-extrabold text-[#1B1F5E]">Recordatorios del ciclo</h2>
            <p className="m-0 mt-1 text-[13px] leading-snug text-[#4A4F7A]">Recibe avisos sobre las fechas estimadas de tu ciclo.</p>
            <p className="m-0 mt-1 text-[12px] font-semibold leading-snug text-[#4A4F7A]">{delivery}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Recordatorios del ciclo"
            aria-checked={cycleReminders}
            onClick={toggleReminders}
            className="mt-1 h-7 w-12 shrink-0 cursor-pointer rounded-full p-1"
            style={{ background: cycleReminders ? '#3A44C4' : '#C9D3EF' }}
          >
            <span className="block h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: cycleReminders ? 'translateX(20px)' : 'translateX(0)' }} />
          </button>
        </div>

        <div className="mt-4 flex items-start gap-3 border-t border-[#E7ECFB] pt-4">
          <span className="mt-0.5 text-[#3A44C4]"><ShieldIcon /></span>
          <div className="flex-1">
            <h2 className="m-0 text-[15px] font-extrabold text-[#1B1F5E]">Privacidad y control de tus datos</h2>
            <p className="m-0 mt-1 text-[13px] leading-snug text-[#4A4F7A]">Consulta cómo se utiliza tu información y administra tus permisos.</p>
            <button type="button" onClick={onManagePrivacy} className="mt-2 cursor-pointer text-sm font-extrabold text-[#3A44C4]">Gestionar privacidad</button>
          </div>
        </div>

        {confirmExport && (
          <div className="mt-4 rounded-2xl bg-[#FFF6CF] p-3" role="dialog" aria-label="Confirmación de exportación">
            <p className="m-0 text-sm font-semibold text-[#1B1F5E]">Este archivo contiene información personal y de salud. Guárdalo en un lugar de confianza.</p>
            <p className="m-0 mt-2 text-[13px] text-[#4A4F7A]">Incluye lo que ya está guardado en tu cuenta. Los cambios de esta pantalla entran cuando usas Guardar ajustes.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={exporting} onClick={() => void exportFile()} className="h-10 flex-1 cursor-pointer rounded-full bg-[#1B1F5E] text-sm font-extrabold text-white disabled:opacity-60">{exporting ? 'Preparando…' : 'Descargar'}</button>
              <button type="button" disabled={exporting} onClick={() => setConfirmExport(false)} className="h-10 flex-1 cursor-pointer rounded-full bg-white text-sm font-extrabold text-[#1B1F5E]">Cancelar</button>
            </div>
          </div>
        )}

        <p className="m-0 mt-4 min-h-5 text-sm font-semibold text-[#4A4F7A]" role="status">
          {status === 'saving' ? 'Guardando ajustes…' : dirty && status !== 'error' ? 'Hay cambios sin guardar.' : message}
        </p>

        <div className="mt-2 flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <button type="button" onClick={() => setConfirmExport(true)} className="h-12 cursor-pointer rounded-full bg-[#F4F6FD] px-4 text-sm font-extrabold text-[#1B1F5E]">Exportar mis datos en JSON</button>
          <button type="button" disabled={!dirty || status === 'saving' || Boolean(fieldError)} onClick={() => void save()} className="h-12 cursor-pointer rounded-full bg-[#F49A9E] px-5 text-sm font-extrabold text-[#1B1F5E] disabled:opacity-50">Guardar ajustes</button>
        </div>
      </section>
    </div>
  );
}
