import React, { useEffect, useState } from 'react';
import type { ActivityDraft } from '../../firebase';
import type { DailyLog, PeriodRecord, ScheduledActivity, UserProfile } from '../../types';
import { analyzeCycle } from '../../utils/cycleModel';
import { overlappingActivity } from '../../utils/activities';
import { authBearer } from '../../consentApi';
import { PHASE_LABEL, energyBandFromLog, phaseApi } from '../../plan/dayContext';
import {
  type ActivityProposal,
  type EnergyBand,
  endClock,
  isPastSlot,
  localDate,
  roundDuration,
} from '../../plan/proposal';
import ProposalCard from './ProposalCard';

const PERIOD_NOTICE = 'Registra tu último período para que Cyclia ajuste tus actividades a tu ciclo';

function draftFromProposal(input: {
  title: string;
  notes: string;
  date: string;
  start: string;
  duration: number;
  source: 'cyclia' | 'manual';
  steps: string[];
}): ActivityDraft {
  return {
    title: input.title.trim(),
    date: input.date,
    startTime: input.start,
    endTime: endClock(input.start, input.duration),
    reminderMinutes: null,
    notes: input.notes.trim(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    estimateMinutes: input.duration,
    planStatus: 'pendiente',
    durationSource: input.source,
    completedAt: null,
    steps: input.steps.map((action) => ({ action, minutes: Math.max(10, Math.round(input.duration / Math.max(input.steps.length, 1))), doneWhen: '' })),
  };
}

export default function CreateActivitySheet({
  open,
  token,
  initialTitle,
  initialDate,
  profile,
  periods,
  logs,
  activities,
  assistantEnabled,
  onClose,
  onSaveActivity,
  onSaveEnergy,
  onOpenRegister,
  onAccepted,
}: {
  open: boolean;
  token: number;
  initialTitle: string;
  initialDate: string;
  profile: UserProfile;
  periods: PeriodRecord[];
  logs: Record<string, DailyLog>;
  activities: ScheduledActivity[];
  assistantEnabled: boolean;
  onClose: () => void;
  onSaveActivity: (draft: ActivityDraft) => Promise<ScheduledActivity | undefined>;
  onSaveEnergy: (date: string, band: EnergyBand) => Promise<void>;
  onOpenRegister: () => void;
  onAccepted: (date: string) => void;
}) {
  const today = localDate();
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState('');
  const [askedBand, setAskedBand] = useState<EnergyBand | ''>('');
  const [proposal, setProposal] = useState<ActivityProposal | null>(null);
  const [tries, setTries] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(false);
  const [manualMinutes, setManualMinutes] = useState(30);
  const [clash, setClash] = useState<{ name: string; time: string; duration: number; source: 'cyclia' | 'manual' } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setNotes('');
    setDate(initialDate < today ? today : initialDate);
    setStart('');
    setAskedBand('');
    setProposal(null);
    setTries(0);
    setBusy(false);
    setError('');
    setManual(false);
    setManualMinutes(30);
    setClash(null);
  }, [open, token, initialTitle, initialDate, today]);

  if (!open) return null;

  const view = analyzeCycle(profile, periods, date, logs);
  const phase = view.showPhases ? view.phase : null;
  const hasPeriod = Boolean(profile.lastPeriodDate);
  const storedBand = energyBandFromLog(logs[date]);
  const band = storedBand || askedBand || null;
  const ready = Boolean(title.trim() && date && start && !isPastSlot(date, start));
  const past = Boolean(date && start && isPastSlot(date, start));

  const requestProposal = async (previous: number | null) => {
    if (!ready || !band) return;
    setBusy(true);
    setError('');
    setManual(false);
    try {
      const tokenValue = await authBearer();
      const response = await fetch('/api/plan-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenValue}` },
        body: JSON.stringify({
          nombre: profile.name,
          actividad: title.trim(),
          notas: notes.trim() || null,
          fecha_inicio: date,
          hora_inicio: start,
          dia_ciclo: phase ? view.cycleDay : null,
          duracion_ciclo: phase ? view.averageLength : null,
          fase: phaseApi(phase),
          energia: band,
          propuesta_anterior_min: previous,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.proposal) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Cyclia no pudo armar una propuesta esta vez. Puedes intentarlo de nuevo.');
      }
      setProposal(data.proposal as ActivityProposal);
      setTries((current) => (previous == null ? 1 : current + 1));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cyclia no pudo armar una propuesta esta vez. Puedes intentarlo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (duration: number, source: 'cyclia' | 'manual', steps: string[]) => {
    const next = draftFromProposal({ title, notes, date, start, duration, source, steps });
    const hit = overlappingActivity(activities, { date, startTime: start, endTime: next.endTime, durationMinutes: duration });
    if (hit && !clash) {
      const hitEnd = hit.endTime || start;
      setClash({ name: hit.title, time: hitEnd, duration, source });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await onSaveActivity(next);
      if (!saved) throw new Error('No se pudo guardar la actividad.');
      onAccepted(date);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo guardar la actividad.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1B1F5E]/40" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crear-actividad-titulo"
        className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-[#E3F1FB] px-4 pb-8 pt-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#C9D3EF]" />
        <div className="mb-3 flex items-center justify-between">
          <h2 id="crear-actividad-titulo" className="m-0 text-xl font-extrabold text-[#1B1F5E]">Crear actividad</h2>
          <button type="button" onClick={onClose} className="flex h-11 cursor-pointer items-center px-2 text-sm font-extrabold text-[#3A44C4]">Cerrar</button>
        </div>
        <form className="flex flex-col gap-3" onSubmit={(event) => event.preventDefault()}>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            ¿Qué quieres hacer?
            <input value={title} onChange={(event) => setTitle(event.target.value)} required className="h-12 rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 text-base font-semibold outline-none" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
            Nota, si quieres
            <textarea value={notes} rows={2} onChange={(event) => setNotes(event.target.value)} className="resize-none rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 py-2 text-base font-semibold outline-none" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
              Día
              <input type="date" required min={today} value={date} onChange={(event) => setDate(event.target.value)} className="h-12 rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 text-base font-semibold outline-none" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-extrabold text-[#1B1F5E]">
              Hora de inicio
              <input type="time" required value={start} onChange={(event) => { setStart(event.target.value); setClash(null); }} className="h-12 rounded-2xl border-[1.5px] border-[#C9D3EF] bg-white px-3 text-base font-semibold outline-none" />
            </label>
          </div>
          {past && <p className="m-0 text-sm text-[#3B4070]">Elige hoy o un día que viene, con una hora que todavía no pasó.</p>}
          {phase ? (
            <p className="m-0 rounded-2xl bg-white px-3 py-3 text-sm font-bold text-[#1B1F5E]">
              Día {view.cycleDay} de {view.averageLength} · {PHASE_LABEL[phase]}
            </p>
          ) : hasPeriod ? (
            <p className="m-0 rounded-2xl bg-white px-3 py-3 text-sm leading-relaxed text-[#3B4070]">Cyclia no estima una fase para este día. Puedes planificar igual.</p>
          ) : (
            <p className="m-0 rounded-2xl bg-white px-3 py-3 text-sm leading-relaxed text-[#3B4070]">
              {PERIOD_NOTICE}{' '}
              <button type="button" onClick={onOpenRegister} className="cursor-pointer font-extrabold text-[#3A44C4] underline">Registro Salud</button>
            </p>
          )}
          {storedBand ? (
            <p className="m-0 text-sm text-[#3B4070]">Energía de este día: {storedBand === 'con_energia' ? 'con energía' : 'sin energía'}.</p>
          ) : (
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="p-0 text-sm font-extrabold text-[#1B1F5E]">¿Cómo está tu energía ese día?</legend>
              <div className="grid grid-cols-2 gap-2">
                {(['con_energia', 'sin_energia'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={askedBand === item}
                    onClick={() => {
                      setAskedBand(item);
                      void onSaveEnergy(date, item);
                    }}
                    className="flex h-12 cursor-pointer items-center justify-center rounded-full text-sm font-extrabold text-[#1B1F5E]"
                    style={{ background: askedBand === item ? '#F49A9E' : '#FFFFFF' }}
                  >
                    {item === 'con_energia' ? 'Con energía' : 'Sin energía'}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {!assistantEnabled && (
            <p className="m-0 text-sm leading-relaxed text-[#3B4070]">Pedir una propuesta queda en pausa hasta que autorices a Cyclia en Privacidad y datos. Puedes elegir la duración tú.</p>
          )}
          <button
            type="button"
            disabled={!ready || !band || busy || !assistantEnabled}
            onClick={() => { void requestProposal(null); }}
            className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#3A44C4] text-[15px] font-extrabold text-white disabled:opacity-50"
          >
            {busy ? 'Cyclia está mirando el día…' : 'Pedir propuesta a Cyclia'}
          </button>
          {error && <p className="m-0 text-sm text-[#3B4070]" role="alert">{error}</p>}
          {proposal && !manual && (
            <ProposalCard
              proposal={proposal}
              start={start}
              busy={busy}
              anotherLeft={tries < 3}
              onAccept={() => { void save(proposal.duracion_min, 'cyclia', proposal.pasos); }}
              onAnother={() => { void requestProposal(proposal.duracion_min); }}
              onAdjust={() => { setManual(true); setManualMinutes(proposal.duracion_min); }}
              onDiscard={() => setProposal(null)}
            />
          )}
          {(manual || !assistantEnabled || Boolean(error)) && (
            <label className="flex flex-col gap-1.5 rounded-[20px] bg-white p-4 text-sm font-extrabold text-[#1B1F5E]">
              Duración, de 10 a 240 minutos
              <input
                type="number"
                min={10}
                max={240}
                step={5}
                value={manualMinutes}
                onChange={(event) => setManualMinutes(roundDuration(Number(event.target.value) || 10))}
                className="h-12 rounded-2xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] px-3 text-base outline-none"
              />
              <span className="font-semibold text-[#4A4F7A]">Termina a las {start ? endClock(start, manualMinutes) : '—'}</span>
              <button type="button" disabled={!ready || busy} onClick={() => { void save(manualMinutes, 'manual', []); }} className="mt-1 flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E] disabled:opacity-50">
                Guardar con esta duración
              </button>
            </label>
          )}
          {clash && (
            <div className="flex flex-col gap-2 rounded-[20px] bg-white p-4" role="alert">
              <p className="m-0 text-sm leading-relaxed text-[#1B1F5E]">Se cruza con «{clash.name}». Puedes moverla a las {clash.time} o dejar la hora que elegiste.</p>
              <button type="button" className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-[#3A44C4] text-sm font-extrabold text-white" onClick={() => { setStart(clash.time); setClash(null); }}>
                Usar las {clash.time}
              </button>
              <button
                type="button"
                className="flex h-11 cursor-pointer items-center justify-center rounded-full bg-[#F8F9FE] text-sm font-extrabold text-[#1B1F5E]"
                onClick={() => { void save(clash.duration, clash.source, proposal?.pasos || []); }}
              >
                Dejar mi hora
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
