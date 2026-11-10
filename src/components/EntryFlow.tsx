import React, { useState } from 'react';
import { PrivacyAcceptance } from './LegalDrafts';

const GOALS = [
  { id: 'salud', title: 'Salud física', text: 'Energía, descanso y movimiento.' },
  { id: 'productividad', title: 'Productividad', text: 'Foco según tu fase del ciclo.' },
  { id: 'autoconocimiento', title: 'Autoconocimiento', text: 'Humor, síntomas y patrones.' },
  { id: 'bienestar', title: 'Bienestar diario', text: 'Un check-in corto y constante.' },
];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh justify-center bg-transparent">
      <div className="channel-frame flex flex-col px-6 py-8">{children}</div>
    </div>
  );
}

export function EntryFlow({
  configured,
  processing,
  error,
  username,
  password,
  entryNotice,
  onUsernameChange,
  onPasswordChange,
  onEnter,
  onContinue,
}: {
  configured: boolean;
  processing: boolean;
  error: string;
  username: string;
  password: string;
  entryNotice: '' | 'created' | 'calendar';
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onEnter: (event: React.FormEvent) => void;
  onContinue: () => void;
}) {
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [privacyError, setPrivacyError] = useState('');
  const acceptPrivacyOrWarn = () => {
    if (privacyAccepted) return true;
    setPrivacyError('Para entrar, marca que leíste la Política de privacidad.');
    return false;
  };

  return (
    <div className="h-dvh flex justify-center" style={{ background: 'var(--perle)' }}>
      <div className="channel-frame !min-h-0 h-full flex flex-col">
        <header className="shrink-0 px-5 pt-10">
          <p className="font-serif text-[15px] tracking-[0.18em]" style={{ color: 'var(--fucsia)' }}>CYCLIA</p>
          <h1 className="font-serif text-4xl" style={{ color: 'var(--emeraude)' }}>Entra a Cyclia</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--emeraude-deep)' }}>El usuario es tu correo. Si no existe, se crea la cuenta. Si ya existe, verás tu calendario.</p>
        </header>
        <main className="flex-1 overflow-y-auto px-5 pt-6 pb-8">
          {error && <p className="text-xs text-red-700 bg-red-50 rounded-2xl p-3 mb-4">{error}</p>}
          {!configured && <p className="text-xs rounded-2xl p-3 mb-4" style={{ background: 'var(--menthe)', color: 'var(--emeraude)' }}>Faltan las claves de Supabase en el archivo .env.</p>}
          <form onSubmit={(event) => { if (!acceptPrivacyOrWarn()) { event.preventDefault(); return; } onEnter(event); }} className="flex flex-col gap-3">
            <input value={username} onChange={(event) => onUsernameChange(event.target.value)} type="text" required autoComplete="username" placeholder="Usuario (correo)" className="min-h-12 rounded-2xl px-5 py-4 text-lg outline-none" style={{ background: 'var(--card)', color: 'var(--ink)', border: '2px solid var(--emeraude)' }} />
            <input value={password} onChange={(event) => onPasswordChange(event.target.value)} type="password" required minLength={4} autoComplete="current-password" placeholder="Contraseña" className="min-h-12 rounded-2xl px-5 py-4 text-lg outline-none" style={{ background: 'var(--card)', color: 'var(--ink)', border: '2px solid var(--emeraude)' }} />
            <PrivacyAcceptance checked={privacyAccepted} error={privacyError} onChange={(value) => { setPrivacyAccepted(value); if (value) setPrivacyError(''); }} />
            <button type="submit" disabled={processing || !configured || !privacyAccepted} className="btn-fucsia min-h-12 rounded-full py-3 text-sm font-semibold cursor-pointer disabled:opacity-50">
              {processing ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </main>
      </div>
      {entryNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(27,31,94,0.45)' }}>
          <div className="w-full max-w-sm rounded-[28px] bg-white p-6">
            <h2 className="font-serif text-3xl" style={{ color: 'var(--emeraude)' }}>{entryNotice === 'created' ? 'Se creó una cuenta nueva' : 'Mostraremos tu calendario'}</h2>
            <p className="mt-3 text-sm" style={{ color: 'var(--emeraude-deep)' }}>
              {entryNotice === 'created' ? 'Tu usuario y tu contraseña ya quedaron guardados. Continúa para completar el registro.' : 'Esta cuenta ya existe. Al continuar verás tu calendario.'}
            </p>
            <button type="button" onClick={onContinue} disabled={processing} className="btn-fucsia mt-6 min-h-12 w-full rounded-full py-3 text-sm font-semibold cursor-pointer disabled:opacity-50">Continuar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RegionScreen({ onSelect, onLeave }: { onSelect: (region: 'Chile' | 'Perú') => void; onLeave?: () => void }) {
  return (
    <Frame>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--emeraude)' }}>Región</p>
      <h1 className="font-serif text-4xl mt-6" style={{ color: 'var(--emeraude)' }}>¿Desde dónde usas Cyclia?</h1>
      <p className="text-sm mt-2 mb-8" style={{ color: 'var(--emeraude-deep)' }}>Elige Chile o Perú para personalizar el canal.</p>
      <div className="flex flex-col gap-3">
        {(['Chile', 'Perú'] as const).map((region) => (
          <button key={region} type="button" onClick={() => onSelect(region)} className="rounded-[24px] p-5 text-left cursor-pointer" style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
            <span className="block font-serif text-2xl" style={{ color: 'var(--emeraude)' }}>{region}</span>
            <span className="text-xs" style={{ color: 'var(--emeraude-deep)' }}>Continuar con esta región</span>
          </button>
        ))}
      </div>
      {onLeave && <button type="button" onClick={onLeave} className="mt-6 cursor-pointer text-xs font-bold" style={{ color: 'var(--emeraude)' }}>Entrar con otra cuenta</button>}
    </Frame>
  );
}

export function ObjectivesScreen({ onSave, onLeave }: { onSave: (goals: string[]) => void; onLeave?: () => void }) {
  const [selected, setSelected] = useState<string[]>(['bienestar']);
  const toggle = (id: string) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  return (
    <Frame>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--emeraude)' }}>Objetivos</p>
      <h1 className="font-serif text-4xl mt-4" style={{ color: 'var(--emeraude)' }}>Elige tu foco</h1>
      <div className="flex flex-col gap-3 my-6">
        {GOALS.map((goal) => {
          const active = selected.includes(goal.id);
          return (
            <button key={goal.id} type="button" onClick={() => toggle(goal.id)} className="rounded-[24px] p-4 text-left cursor-pointer" style={{ background: active ? 'var(--menthe)' : 'var(--card)', border: '1px solid var(--line)' }}>
              <span className="block font-semibold" style={{ color: 'var(--emeraude)' }}>{goal.title}</span>
              <span className="text-xs" style={{ color: 'var(--emeraude-deep)' }}>{goal.text}</span>
            </button>
          );
        })}
      </div>
      <button type="button" disabled={selected.length === 0} onClick={() => onSave(selected)} className="btn-fucsia mt-auto w-full rounded-full py-3.5 text-sm font-semibold cursor-pointer">Guardar</button>
      {onLeave && <button type="button" onClick={onLeave} className="mt-4 cursor-pointer text-xs font-bold" style={{ color: 'var(--emeraude)' }}>Entrar con otra cuenta</button>}
    </Frame>
  );
}

const MOODS = [
  { value: 1, icon: '😄', label: 'Muy feliz' },
  { value: 2, icon: '🙂', label: 'Bien' },
  { value: 3, icon: '😐', label: 'Neutral' },
  { value: 4, icon: '😔', label: 'Triste' },
  { value: 5, icon: '😢', label: 'Muy triste' },
];

const MOOD_TAGS = ['Sueño', 'Trabajo', 'Relaciones', 'Alimentación', 'Ejercicio', 'Mi ciclo'];

export function MoodGrid({ current, onSave, onBack, onFull }: { current?: number; onSave: (mood: number, tags: string[]) => void; onBack?: () => void; onFull?: () => void }) {
  const [selected, setSelected] = React.useState(current || 2);
  const [tags, setTags] = React.useState<string[]>([]);
  return (
    <div className="flex flex-col gap-3">
      {onBack && (
        <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Inicio</button>
      )}
      <h1 className="m-0 font-serif text-[34px] font-normal text-[#3A44C4]">¿Cómo te sientes?</h1>
      <p className="m-0 text-sm text-[#4A4F7A]">Tu elección actualiza el registro de hoy.</p>
      <section className="grid grid-cols-2 gap-2.5 rounded-[22px] bg-white p-3.5">
        {MOODS.map((mood) => {
          const on = selected === mood.value;
          return (
            <button
              key={mood.value}
              type="button"
              onClick={() => setSelected(mood.value)}
              className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] text-sm font-extrabold text-[#1B1F5E]"
              style={{ background: on ? '#F49A9E' : '#FFF6CF', border: `2px solid ${on ? '#E57F86' : '#F6E27F'}` }}
            >
              <span className="text-3xl">{mood.icon}</span>
              {mood.label}
            </button>
          );
        })}
      </section>
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-sm font-extrabold">¿Qué está influyendo hoy?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {MOOD_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setTags((currentTags) => currentTags.includes(tag) ? currentTags.filter((item) => item !== tag) : [...currentTags, tag])}
                className="min-h-10 cursor-pointer rounded-full px-3.5 text-[13px] font-bold text-[#1B1F5E]"
                style={{ background: on ? '#F49A9E' : '#FFF6CF', border: `1.5px solid ${on ? '#E57F86' : '#F6E27F'}` }}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>
      <button type="button" onClick={() => onSave(selected, tags)} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E]">Guardar en mi registro</button>
      {onFull && (
        <button type="button" onClick={onFull} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E]">Hacer el registro completo</button>
      )}
    </div>
  );
}
