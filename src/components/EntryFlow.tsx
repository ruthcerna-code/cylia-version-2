import React, { useState } from 'react';
import WelcomeScreen from './WelcomeScreen';

const SLIDES = [
  {
    mark: '01',
    title: 'Crea hábitos que sí se sostienen',
    text: 'Cyclia ordena tu día alrededor de tu ciclo, tu energía y una meta clara.',
  },
  {
    mark: '02',
    title: 'Mide el avance, no la perfección',
    text: 'Cada registro cuenta. El calendario muestra tu constancia y tu estado de ánimo.',
  },
];

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
  email,
  password,
  signUp,
  onEmailChange,
  onPasswordChange,
  onToggleSignUp,
  onGoogle,
  onAnonymous,
  onEmailSubmit,
}: {
  configured: boolean;
  processing: boolean;
  error: string;
  email: string;
  password: string;
  signUp: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleSignUp: () => void;
  onGoogle: () => void;
  onAnonymous: () => void;
  onEmailSubmit: (event: React.FormEvent) => void;
}) {
  const [step, setStep] = useState<'welcome' | 'intro' | 'auth'>('welcome');
  const [slide, setSlide] = useState(0);
  const current = SLIDES[slide];

  if (step === 'welcome') {
    return (
      <WelcomeScreen
        subtitle="Tu ciclo, tu energía, tu ritmo."
        body="Entiende cómo tu biología influye en tu energía, tu concentración y tu bienestar, día a día."
        primaryLabel="Comenzar"
        onPrimary={() => setStep('intro')}
        secondaryLabel={processing ? 'Abriendo…' : 'Ya tengo cuenta'}
        onSecondary={onGoogle}
        error={error}
        extra={<button type="button" onClick={() => setStep('auth')} className="cursor-pointer text-xs font-bold text-[#D2DDF8]">Entrar con correo o modo anónimo</button>}
      />
    );
  }

  if (step === 'intro') {
    const progress = slide === 0 ? 33 : 66;
    return (
      <div className="h-dvh flex justify-center" style={{ background: 'var(--perle)' }}>
        <div className="channel-frame !min-h-0 h-full flex flex-col">
          <header className="shrink-0" style={{ background: 'var(--perle)' }}>
            <div className="h-1.5 w-full" style={{ background: 'var(--perle-soft)' }}>
              <div className="h-full transition-all" style={{ width: `${progress}%`, background: 'var(--emeraude)' }} />
            </div>
            <div className="flex h-14 items-center justify-between px-5">
              <button
                type="button"
                onClick={() => (slide === 0 ? setStep('welcome') : setSlide(0))}
                className="cursor-pointer text-sm font-semibold"
                style={{ color: 'var(--emeraude)' }}
              >
                ← Atrás
              </button>
              <span className="text-xs font-semibold" style={{ color: 'var(--emeraude-deep)' }}>Paso {slide + 1} de 3</span>
            </div>
          </header>
          <main className="flex-1 overflow-y-auto px-5 pt-6">
            <h2 className="mb-6 font-serif text-3xl leading-tight" style={{ color: 'var(--emeraude)' }}>{current.title}</h2>
            <div className="rounded-[28px] p-8" style={{ background: 'var(--menthe)' }}>
              <p className="font-serif text-5xl" style={{ color: 'var(--emeraude)' }}>{current.mark}</p>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--emeraude-deep)' }}>{current.text}</p>
            </div>
          </main>
          <div className="shrink-0 px-5 pb-6 pt-3">
            <button
              type="button"
              onClick={() => (slide === 0 ? setSlide(1) : setStep('auth'))}
              className="btn-fucsia w-full cursor-pointer rounded-full py-4 text-base font-semibold"
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh flex justify-center" style={{ background: 'var(--perle)' }}>
    <div className="channel-frame !min-h-0 h-full flex flex-col">
      <header className="shrink-0" style={{ background: 'var(--perle)' }}>
        <div className="h-1.5 w-full" style={{ background: 'var(--perle-soft)' }}>
          <div className="h-full" style={{ width: '100%', background: 'var(--emeraude)' }} />
        </div>
        <div className="flex h-14 items-center justify-between px-5">
          <button type="button" onClick={() => { setSlide(1); setStep('intro'); }} className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--emeraude)' }}>← Atrás</button>
          <span className="text-xs font-semibold" style={{ color: 'var(--emeraude-deep)' }}>Paso 3 de 3</span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-5 pt-6 pb-8">
      <h1 className="font-serif text-4xl" style={{ color: 'var(--emeraude)' }}>Entra a Cyclia</h1>
      <p className="text-sm mt-2 mb-6" style={{ color: 'var(--emeraude-deep)' }}>
        El canal abre con tu cuenta de Google o en modo anónimo.
      </p>
      {!configured && (
        <p className="text-xs rounded-2xl p-3 mb-4" style={{ background: 'var(--menthe)', color: 'var(--emeraude)' }}>
          Faltan las claves de Supabase en el archivo .env.
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 rounded-2xl p-3 mb-4">{error}</p>}
      <button type="button" disabled={processing || !configured} onClick={onGoogle} className="btn-fucsia w-full rounded-full py-3.5 text-sm font-semibold cursor-pointer">
        {processing ? 'Abriendo…' : 'Continuar con Google'}
      </button>
      <button type="button" disabled={processing || !configured} onClick={onAnonymous} className="btn-emeraude w-full rounded-full py-3.5 text-sm font-semibold cursor-pointer mt-3">
        Entrar en modo anónimo
      </button>
      <form onSubmit={onEmailSubmit} className="mt-6 flex flex-col gap-3">
        <input value={email} onChange={(event) => onEmailChange(event.target.value)} type="email" required placeholder="Correo" className="rounded-2xl px-5 py-5 text-lg outline-none" style={{ background: 'var(--card)', color: 'var(--ink)', border: '2px solid var(--emeraude)' }} />
        <input value={password} onChange={(event) => onPasswordChange(event.target.value)} type="password" required minLength={6} placeholder="Contraseña" className="rounded-2xl px-5 py-5 text-lg outline-none" style={{ background: 'var(--card)', color: 'var(--ink)', border: '2px solid var(--emeraude)' }} />
        <button type="submit" disabled={processing || !configured} className="rounded-full py-3 text-sm font-semibold cursor-pointer" style={{ color: 'var(--emeraude)', border: '1px solid var(--emeraude)' }}>
          {signUp ? 'Crear cuenta' : 'Entrar con correo'}
        </button>
        <button type="button" onClick={onToggleSignUp} className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--fucsia)' }}>
          {signUp ? 'Ya tengo cuenta' : 'Crear cuenta con correo'}
        </button>
      </form>
      </main>
    </div>
    </div>
  );
}

export function RegionScreen({ onSelect }: { onSelect: (region: 'Chile' | 'Perú') => void }) {
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
    </Frame>
  );
}

export function ObjectivesScreen({ onSave }: { onSave: (goals: string[]) => void }) {
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
