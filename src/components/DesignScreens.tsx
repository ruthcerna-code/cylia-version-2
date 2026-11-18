import React, { useState } from 'react';
import type { MenstrualPhase, UserProfile } from '../types';
import { PHASE_DETAILS } from '../utils/cycle';
import { validateCycleLength, validatePeriodLength } from '../utils/profileFields';

const ORDER: MenstrualPhase[] = ['Menstrual', 'Folicular', 'Ovulacion', 'Lutea'];
const PHASE_BG: Record<MenstrualPhase, { bg: string; fg: string; label: string }> = {
  Menstrual: { bg: '#FF8243', fg: '#153E40', label: 'Menstrual' },
  Folicular: { bg: '#FFD3BC', fg: '#153E40', label: 'Folicular' },
  Ovulacion: { bg: '#FCE883', fg: '#153E40', label: 'Ovulatoria' },
  Lutea: { bg: '#069494', fg: '#FFFFFF', label: 'Lútea' },
};
const DOTS = ['#FF8243', '#FFD3BC', '#FCE883', '#069494', '#153E40'];

export function PhaseScreen({ current, onBack }: { current: MenstrualPhase; onBack: () => void }) {
  const [selected, setSelected] = useState<MenstrualPhase>(current);
  const info = PHASE_DETAILS[selected];
  const tone = PHASE_BG[selected];
  const blocks = [
    ['Referencia, no es una medición', info.hormones],
    ['Energía y ánimo', info.description],
    ['Productividad', info.productivity.join('. ')],
    ['Bienestar', info.tips[0]],
    ['Alimentación', info.tips[2] || info.tips[1]],
  ];
  return (
    <div className="-mx-4 -mt-4 flex flex-col">
      <header className="flex flex-col gap-2 px-5 pb-6 pt-8" style={{ background: tone.bg, color: tone.fg }}>
        <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold">← Inicio</button>
        <span className="text-[13px] font-extrabold tracking-wider">{selected === current ? 'HOY ESTÁS AQUÍ' : 'OTRA FASE'}</span>
        <h1 className="m-0 font-serif text-4xl font-normal">Fase {tone.label}</h1>
        <p className="m-0 text-[15px] leading-relaxed">{info.description}</p>
      </header>
      <div className="grid grid-cols-4 gap-1.5 px-4 py-3">
        {ORDER.map((phase) => {
          const on = phase === selected;
          return (
            <button key={phase} type="button" onClick={() => setSelected(phase)} className="min-h-11 cursor-pointer rounded-full text-[11px] font-extrabold text-[#153E40]" style={{ background: on ? '#FF8243' : '#FFF6CF', border: `1.5px solid ${on ? '#E56B28' : '#FCE883'}` }}>
              {PHASE_BG[phase].label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2.5 px-4 pb-6">
        {blocks.map(([title, text], index) => (
          <section key={title} className="rounded-[18px] bg-[#FFF8EE] p-4">
            <h2 className="m-0 flex items-center gap-2 text-[15px] font-extrabold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DOTS[index] }} />{title}</h2>
            <p className="mb-0 mt-1.5 text-sm leading-relaxed text-[#245456]">{text}</p>
          </section>
        ))}
        <p className="m-0 text-xs text-[#3E6466]">Información educativa y de bienestar. Ante síntomas persistentes, consulta a un profesional de salud.</p>
      </div>
    </div>
  );
}

export function ActivityScreen({
  phaseName,
  title,
  why,
  steps,
  notes,
  onBack,
  onAsk,
}: {
  phaseName: string;
  title: string;
  why: string;
  steps: string[];
  notes: string[];
  onBack: () => void;
  onAsk: () => void;
}) {
  return (
    <div className="-mx-4 -mt-4 flex flex-col">
      <header className="flex flex-col gap-2 bg-[#FFD3BC] px-5 pb-6 pt-8 text-[#153E40]">
        <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold">← Inicio</button>
        <span className="text-xs font-extrabold tracking-wider">ACTIVIDAD RECOMENDADA · {phaseName.toUpperCase()}</span>
        <h1 className="m-0 max-w-[300px] text-[26px] font-extrabold leading-tight">{title}</h1>
      </header>
      <div className="flex flex-col gap-2.5 px-4 py-4">
        <section className="rounded-[18px] bg-[#FFF8EE] p-4">
          <h2 className="m-0 text-[15px] font-extrabold">Por qué es adecuada para ti</h2>
          <p className="mb-0 mt-1.5 text-sm leading-relaxed text-[#245456]">{why}</p>
        </section>
        <section className="rounded-[18px] bg-[#FFF8EE] p-4">
          <h2 className="m-0 text-[15px] font-extrabold">Cómo hacerla</h2>
          <ol className="mb-0 mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[#245456]">
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>
        {notes.length > 0 && (
          <section className="rounded-[18px] bg-[#FFF8EE] p-4 text-sm leading-relaxed text-[#245456]">
            {notes.map((note) => <p key={note} className="m-0 mt-1 first:mt-0">{note}</p>)}
          </section>
        )}
        <section className="rounded-[18px] bg-[#FCE883] p-4">
          <h2 className="m-0 text-[15px] font-extrabold">Productividad sugerida para hoy</h2>
          <p className="mb-0 mt-1.5 text-sm">Usa la energía de esta fase para lo que más te cueste empezar.</p>
        </section>
        <button type="button" onClick={onAsk} className="flex h-[50px] cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-[15px] font-extrabold text-[#153E40]">Pedir otra opción a Cyclia</button>
      </div>
    </div>
  );
}

export function CycleDataScreen({
  profile,
  goals,
  onBack,
  onSave,
  onGoals,
}: {
  profile: UserProfile;
  goals: string[];
  onBack: () => void;
  onSave: (profile: UserProfile) => void;
  onGoals: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [lastPeriodDate, setLastPeriodDate] = useState(profile.lastPeriodDate);
  const [cycleLength, setCycleLength] = useState(String(profile.cycleLength));
  const [periodLength, setPeriodLength] = useState(String(profile.periodLength));
  const [flags, setFlags] = useState({
    isCeliac: Boolean(profile.isCeliac),
    hasDiabetes: Boolean(profile.hasDiabetes),
    hasObesity: Boolean(profile.hasObesity),
    hasDepression: Boolean(profile.hasDepression),
  });
  const chips: { key: keyof typeof flags; label: string }[] = [
    { key: 'isCeliac', label: 'Celiaquía' },
    { key: 'hasDiabetes', label: 'Diabetes' },
    { key: 'hasObesity', label: 'Obesidad' },
    { key: 'hasDepression', label: 'Depresión o ansiedad' },
  ];
  const [lengthError, setLengthError] = useState('');
  const field = 'h-[46px] rounded-xl border-[1.5px] border-[#E7D3C6] bg-[#F8F9FE] px-3 text-[15px] font-semibold text-[#153E40] outline-none';
  return (
    <div className="flex flex-col gap-3 pt-2">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#069494]">← Perfil</button>
      <h1 className="m-0 text-[26px] font-extrabold">Datos del ciclo y salud</h1>
      <p className="m-0 text-sm text-[#3E6466]">Con esto Cyclia calcula tu fase y personaliza sus recomendaciones.</p>
      <section className="flex flex-col gap-3 rounded-[20px] bg-[#FFF8EE] p-4">
        <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">Nombre<input className={field} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">Inicio del último periodo<input className={field} type="date" value={lastPeriodDate} onChange={(event) => setLastPeriodDate(event.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">Duración del ciclo<input className={field} type="number" min={21} max={45} value={cycleLength} onChange={(event) => setCycleLength(event.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">Duración del periodo<input className={field} type="number" min={1} max={10} value={periodLength} onChange={(event) => setPeriodLength(event.target.value)} /></label>
          <p className="m-0 text-[12px] font-semibold text-[#3E6466]">El ciclo va de 21 a 45 días. Si no se sabe, la primera predicción usa 28. La regla va de 1 a 10 días; si no se sabe, usa 5.</p>
          {lengthError && <p className="m-0 text-sm font-bold text-[#9C3B45]" role="alert">{lengthError}</p>}
        </div>
      </section>
      <section className="rounded-[20px] bg-[#FFF8EE] p-4">
        <h2 className="m-0 text-sm font-extrabold">Condiciones de salud <span className="font-semibold text-[#3E6466]">· opcional</span></h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => {
            const on = flags[chip.key];
            return (
              <button key={chip.key} type="button" onClick={() => setFlags((current) => ({ ...current, [chip.key]: !current[chip.key] }))} className="min-h-10 cursor-pointer rounded-full px-3.5 text-[13px] font-bold text-[#153E40]" style={{ background: on ? '#FF8243' : '#FFF6CF', border: `1.5px solid ${on ? '#E56B28' : '#FCE883'}` }}>{chip.label}</button>
            );
          })}
        </div>
      </section>
      <button type="button" onClick={onGoals} className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-[20px] bg-[#FFF8EE] px-4 text-left text-[15px] font-extrabold">
        Mis objetivos: {goals.length ? goals.join(', ') : 'sin elegir'} <span className="text-[#069494]">›</span>
      </button>
      <button
        type="button"
        onClick={() => {
          const cycleDays = Number(cycleLength);
          const periodDays = Number(periodLength);
          const error = validateCycleLength(cycleDays) || validatePeriodLength(periodDays);
          if (error) {
            setLengthError(error);
            return;
          }
          setLengthError('');
          onSave({ ...profile, name: name.trim() || profile.name, lastPeriodDate, cycleLength: cycleDays, periodLength: periodDays, cycleLengthKnown: true, periodLengthKnown: true, ...flags });
        }}
        className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-base font-extrabold text-[#153E40]"
      >
        Guardar cambios
      </button>
    </div>
  );
}

const GOAL_OPTIONS = [
  { id: 'salud', name: 'Salud física', sub: 'Energía, descanso y movimiento', dot: '#FF8243' },
  { id: 'productividad', name: 'Productividad', sub: 'Foco según tu energía de hoy', dot: '#069494' },
  { id: 'autoconocimiento', name: 'Autoconocimiento', sub: 'Humor, síntomas y patrones', dot: '#FFD3BC' },
  { id: 'bienestar', name: 'Bienestar diario', sub: 'Un registro corto y constante', dot: '#FCE883' },
];

export function GoalsScreen({ saved, onBack, onSave }: { saved: string[]; onBack: () => void; onSave: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(saved);
  return (
    <div className="flex flex-col gap-3 pt-2">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#069494]">← Perfil</button>
      <span className="text-xs font-extrabold tracking-wider text-[#3E6466]">OBJETIVOS</span>
      <h1 className="m-0 font-serif text-[34px] font-normal text-[#069494]">Elige tu foco</h1>
      <p className="m-0 text-sm text-[#3E6466]">Cyclia ajusta sus consejos a lo que más te importa. Puedes elegir más de uno.</p>
      {GOAL_OPTIONS.map((goal) => {
        const on = selected.includes(goal.id);
        return (
          <button key={goal.id} type="button" onClick={() => setSelected((current) => current.includes(goal.id) ? current.filter((id) => id !== goal.id) : [...current, goal.id])} className="flex min-h-[76px] cursor-pointer items-center gap-3 rounded-[18px] px-4 py-3 text-left" style={{ background: on ? '#FF8243' : '#FFF6CF', border: `2px solid ${on ? '#E56B28' : '#FCE883'}` }}>
            <span className="h-3.5 w-3.5 rounded-full" style={{ background: goal.dot }} />
            <span className="flex-1"><strong className="block text-base">{goal.name}</strong><span className="text-[13px] text-[#245456]">{goal.sub}</span></span>
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs text-white" style={{ borderColor: on ? '#E56B28' : '#FCE883', background: on ? '#153E40' : '#FFFFFF' }}>{on ? '✓' : ''}</span>
          </button>
        );
      })}
      <button type="button" onClick={() => onSave(selected)} className="mt-2 flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#FF8243] text-base font-extrabold text-[#153E40]">Guardar</button>
    </div>
  );
}

export function PrivacyClauses() {
  return (
    <section className="rounded-[20px] bg-[#FFD3BC] p-4 text-sm leading-relaxed text-[#153E40]">
      <h2 className="m-0 text-base font-extrabold">Cláusulas de privacidad</h2>
      <ul className="mb-0 mt-2 list-disc space-y-1.5 pl-4">
        <li>El borrador de privacidad describe los datos, las finalidades y lo que todavía está pendiente de revisión.</li>
        <li>Las filas de tu cuenta se leen con tu sesión. Eso no significa que ningún proveedor pueda acceder a la infraestructura.</li>
        <li>El asistente depende de una autorización aparte. Las actividades se guardan en Cyclia.</li>
        <li>Cyclia es educativa y no reemplaza a un profesional de salud.</li>
        <li>Desde Privacidad y datos puedes consultar decisiones, retirar autorizaciones y enviar solicitudes. Enviar una solicitud no borra la cuenta.</li>
      </ul>
    </section>
  );
}

export function PrivacyScreen({
  darkMode,
  onBack,
  onToggleDark,
  onExport,
  onDelete,
}: {
  darkMode: boolean;
  onBack: () => void;
  onToggleDark: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [reminders, setReminders] = useState(() => localStorage.getItem('cyclia_remind_log') !== '0');
  const [periodNotice, setPeriodNotice] = useState(() => localStorage.getItem('cyclia_remind_period') !== '0');
  const [phaseTip, setPhaseTip] = useState(() => localStorage.getItem('cyclia_remind_phase') === '1');
  const rows = [
    ['Recordatorio de registro', 'Todos los días a las 20:00', reminders, () => { setReminders((value) => { localStorage.setItem('cyclia_remind_log', value ? '0' : '1'); return !value; }); }],
    ['Aviso de próximo periodo', '2 días antes', periodNotice, () => { setPeriodNotice((value) => { localStorage.setItem('cyclia_remind_period', value ? '0' : '1'); return !value; }); }],
    ['Consejo de fase', 'Al comenzar cada fase', phaseTip, () => { setPhaseTip((value) => { localStorage.setItem('cyclia_remind_phase', value ? '0' : '1'); return !value; }); }],
    ['Modo oscuro', 'Colores de la app', darkMode, onToggleDark],
  ] as const;
  return (
    <div className="flex flex-col gap-3 pt-2">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#069494]">← Perfil</button>
      <h1 className="m-0 text-[26px] font-extrabold">Privacidad y notificaciones</h1>
      <span className="text-xs font-extrabold tracking-wider text-[#3E6466]">NOTIFICACIONES Y APARIENCIA</span>
      <section className="rounded-[20px] bg-[#FFF8EE] px-4">
        {rows.map(([name, sub, on, toggle], index) => (
          <div key={name} className="flex items-center gap-3 py-3" style={{ borderBottom: index < rows.length - 1 ? '1px solid #EAD9CE' : undefined }}>
            <span className="flex-1"><strong className="block text-[15px]">{name}</strong><span className="text-[13px] text-[#3E6466]">{sub}</span></span>
            <button type="button" aria-label={name} onClick={toggle} className="flex h-8 w-[52px] cursor-pointer items-center rounded-full p-[3px]" style={{ background: on ? '#FF8243' : '#E6D056', justifyContent: on ? 'flex-end' : 'flex-start' }}>
              <span className="h-[26px] w-[26px] rounded-full bg-[#FFF8EE] shadow" />
            </button>
          </div>
        ))}
      </section>
      <PrivacyClauses />
      <button type="button" onClick={onExport} className="flex h-[52px] cursor-pointer items-center justify-between rounded-[20px] bg-[#FFF8EE] px-4 text-[15px] font-extrabold">Exportar mis datos <span className="text-[#069494]">↓</span></button>
      <button type="button" onClick={onDelete} className="h-[50px] cursor-pointer rounded-full bg-[#FF8243] text-[15px] font-extrabold text-[#153E40]">Eliminar mi cuenta y mis datos</button>
    </div>
  );
}
