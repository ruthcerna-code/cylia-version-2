import React, { useState } from 'react';
import type { BodyLevel, CervicalFluid, CycleSymptom, DailyLog, EnergyFeel, FeltState, SleepState } from '../types';
import type { ActivitySuggestion } from '../utils/activities';

const SCALES = [
  { key: 'energy', label: 'Energía', hint: '1 muy baja · 5 muy alta' },
  { key: 'concentration', label: 'Concentración', hint: '1 poca · 5 mucha' },
  { key: 'fatigue', label: 'Cansancio', hint: '1 nada · 5 mucho' },
  { key: 'mood', label: 'Ánimo', hint: '1 muy bien · 5 muy triste' },
  { key: 'stress', label: 'Estrés', hint: '1 bajo · 5 alto' },
  { key: 'sleepQuality', label: 'Sueño', hint: '1 excelente · 5 muy malo' },
  { key: 'pain', label: 'Dolor físico', hint: '1 nada · 5 mucho' },
] as const;

const FLUIDS: Array<{ value: CervicalFluid; label: string }> = [
  { value: 'seco', label: 'Seco' },
  { value: 'pegajoso', label: 'Pegajoso' },
  { value: 'cremoso', label: 'Cremoso' },
  { value: 'clara_de_huevo', label: 'Clara de huevo' },
];

const MOODS: Array<{ value: FeltState; label: string }> = [
  { value: 'Serena', label: '🌙 Serena' },
  { value: 'Enfocada', label: '🎯 Enfocada' },
  { value: 'Radiante', label: '✨ Radiante' },
  { value: 'Reflexiva', label: '🌿 Reflexiva' },
  { value: 'Sensible', label: '💗 Sensible' },
];

const STEP_COPY = [
  'Elige el ánimo que más se parece a este día.',
  'La energía que elijas mueve el número de más abajo.',
  'Toca lo que notes. Ninguno también es una respuesta.',
  'Ahora los números. En energía, 5 es mucha. En cansancio y dolor, 5 es peor.',
  'Una frase alcanza. Después puedes ver tu gráfica.',
];

const ENERGIES: Array<{ value: EnergyFeel; label: string; score: number }> = [
  { value: 'baja', label: '🔋 Baja', score: 2 },
  { value: 'estable', label: '🌿 Estable', score: 3 },
  { value: 'radiante', label: '🌟 Radiante', score: 5 },
  { value: 'inquieta', label: '🌬️ Inquieta', score: 3 },
];

const LEVELS: Array<{ value: BodyLevel; label: string }> = [
  { value: 'ninguno', label: 'Ninguno' },
  { value: 'leve', label: 'Leve' },
  { value: 'medio', label: 'Medio' },
];

const BODY: Array<{ key: 'headache' | 'bloating' | 'breastSensitivity' | 'pelvicCramps'; label: string; code: CycleSymptom }> = [
  { key: 'headache', label: 'Dolor de cabeza', code: 'dolor_cabeza' },
  { key: 'bloating', label: 'Retención / hinchazón', code: 'hinchazon' },
  { key: 'breastSensitivity', label: 'Sensibilidad mamaria', code: 'sensibilidad_mamaria' },
  { key: 'pelvicCramps', label: 'Cólicos pélvicos', code: 'colicos' },
];

const SYMPTOMS: Array<{ label: string; code?: CycleSymptom }> = [
  { label: 'Antojos', code: 'antojos' },
  { label: 'Irritabilidad', code: 'irritabilidad' },
  { label: 'Sequedad vaginal', code: 'sequedad_vaginal' },
  { label: 'Bochornos', code: 'bochornos' },
  { label: 'Sudores nocturnos', code: 'sudores_nocturnos' },
  { label: 'Ninguno' },
];

export default function DesignRegister({
  dateStr,
  dateLabel,
  phaseLabel,
  cycleDay,
  showVasomotor = false,
  existing,
  onSave,
  onSaveAndAnalyze,
  suggestion,
  onSchedule,
}: {
  dateStr: string;
  dateLabel: string;
  phaseLabel: string;
  cycleDay: number;
  showVasomotor?: boolean;
  existing?: DailyLog;
  onSave: (log: DailyLog) => void;
  onSaveAndAnalyze: (log: DailyLog) => void;
  suggestion?: ActivitySuggestion | null;
  onSchedule?: (title: string) => void;
}) {
  const [values, setValues] = useState({
    fatigue: existing?.fatigue || 3,
    mood: existing?.mood || 3,
    stress: existing?.stress || 3,
    sleepQuality: existing?.sleepQuality || 3,
    pain: existing?.pain || 1,
    energy: existing?.energy || 3,
    concentration: existing?.concentration || 3,
  });
  const [symptoms, setSymptoms] = useState<string[]>(() => SYMPTOMS.filter((item) => item.code && existing?.symptoms?.includes(item.code)).map((item) => item.label));
  const [fluid, setFluid] = useState<CervicalFluid | ''>(existing?.cervicalFluid || '');
  const [felt, setFelt] = useState<FeltState | ''>(existing?.feltState || '');
  const [energyFeel, setEnergyFeel] = useState<EnergyFeel | ''>(existing?.energyFeel || '');
  const levelFrom = (key: (typeof BODY)[number]['key'], code: CycleSymptom): BodyLevel => existing?.[key] || (existing?.symptoms?.includes(code) ? 'leve' : 'ninguno');
  const [body, setBody] = useState<Record<(typeof BODY)[number]['key'], BodyLevel>>({
    headache: levelFrom('headache', 'dolor_cabeza'),
    bloating: levelFrom('bloating', 'hinchazon'),
    breastSensitivity: levelFrom('breastSensitivity', 'sensibilidad_mamaria'),
    pelvicCramps: levelFrom('pelvicCramps', 'colicos'),
  });
  const [spotting, setSpotting] = useState(Boolean(existing?.spotting));
  const [sleepDetails, setSleepDetails] = useState(existing?.sleepDetails || '');
  const [behavior, setBehavior] = useState(existing?.behavior || '');
  const [notes, setNotes] = useState(existing?.additionalNotes || '');
  const [step, setStep] = useState(0);

  const buildLog = (): DailyLog => {
    const symptomLine = symptoms.length ? `Síntomas: ${symptoms.join(', ')}` : '';
    const extra = [notes.trim(), symptomLine].filter(Boolean).join('\n');
    const sleepState: SleepState = values.sleepQuality <= 2 ? 'bien' : values.sleepQuality === 3 ? 'regular' : 'mal';
    const codes = SYMPTOMS.flatMap((item) => item.code && symptoms.includes(item.label) ? [item.code] : []);
    BODY.forEach((item) => {
      if (body[item.key] !== 'ninguno') codes.push(item.code);
    });
    return {
      date: dateStr,
      fatigue: values.fatigue,
      mood: values.mood,
      stress: values.stress,
      sleepQuality: values.sleepQuality,
      pain: values.pain,
      energy: values.energy,
      concentration: values.concentration,
      sleepState,
      spotting,
      symptoms: codes,
      cervicalFluid: fluid || undefined,
      feltState: felt || undefined,
      energyFeel: energyFeel || undefined,
      headache: body.headache,
      bloating: body.bloating,
      breastSensitivity: body.breastSensitivity,
      pelvicCramps: body.pelvicCramps,
      hotFlashCount: existing?.hotFlashCount,
      hotFlashIntensity: existing?.hotFlashIntensity,
      nightSweatCount: existing?.nightSweatCount,
      nightSweatIntensity: existing?.nightSweatIntensity,
      sleepDetails: sleepDetails.trim(),
      behavior: behavior.trim(),
      additionalNotes: extra,
      aiAnalysis: existing?.aiAnalysis,
    };
  };

  const toggleSymptom = (name: string) => {
    setSymptoms((current) => {
      if (name === 'Ninguno') return current.includes('Ninguno') ? [] : ['Ninguno'];
      const without = current.filter((item) => item !== 'Ninguno' && item !== name);
      return current.includes(name) ? without : [...without, name];
    });
  };

  return (
    <div className="flex flex-col gap-3 pb-4">
      <header className="flex flex-col gap-1 px-1 pt-6">
        <span className="font-serif text-[15px] tracking-[0.18em] text-[#3A44C4]">CYCLIA</span>
        <h1 className="m-0 text-[28px] font-extrabold text-[#1B1F5E]">¿Cómo estás hoy?</h1>
        <p className="m-0 text-sm text-[#4A4F7A]">{dateLabel} · Día {cycleDay} · {phaseLabel}</p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {STEP_COPY.map((_, index) => (
            <span key={index} className="h-2 flex-1 rounded-full" style={{ background: index <= step ? '#F49A9E' : '#E1E5F5' }} />
          ))}
        </div>
        <p className="m-0 text-[13px] font-extrabold text-[#3A44C4]">Paso {step + 1} de {STEP_COPY.length}. {STEP_COPY[step]}</p>
      </header>
      {step === 0 && <section className="flex flex-col gap-4 rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Estado anímico</h2>
        <div className="flex flex-col gap-2">
          {MOODS.map((item) => (
            <Choice key={item.value} selected={felt === item.value} onClick={() => setFelt((current) => current === item.value ? '' : item.value)}>{item.label}</Choice>
          ))}
        </div>
      </section>}
      {step === 1 && <section className="flex flex-col gap-4 rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Nivel de energía</h2>
        <div className="grid grid-cols-2 gap-2">
          {ENERGIES.map((item) => (
            <Choice
              key={item.value}
              selected={energyFeel === item.value}
              onClick={() => {
                const next = energyFeel === item.value ? '' : item.value;
                setEnergyFeel(next);
                if (next) setValues((current) => ({ ...current, energy: item.score }));
              }}
            >
              {item.label}
            </Choice>
          ))}
        </div>
        <p className="m-0 text-[12px] leading-relaxed text-[#4A4F7A]">Inquieta no es energía alta ni baja.</p>
      </section>}
      {step === 2 && <section className="flex flex-col gap-4 rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Indicadores de hoy</h2>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="p-0 text-sm font-extrabold">Fluido cervical</legend>
          <div className="grid grid-cols-2 gap-2">
            {FLUIDS.map((item) => (
              <Choice key={item.value} selected={fluid === item.value} onClick={() => setFluid((current) => current === item.value ? '' : item.value)}>{item.label}</Choice>
            ))}
          </div>
          <p className="m-0 text-[12px] leading-relaxed text-[#4A4F7A]">Clara de huevo es una descripción. Muchas mujeres la asocian con días fértiles. Cyclia no calcula fertilidad.</p>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="p-0 text-sm font-extrabold">Sensaciones</legend>
          {BODY.map((item) => (
            <div key={item.key} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold text-[#3B4070]">{item.label}</span>
              <div className="grid grid-cols-3 gap-1.5">
                {LEVELS.map((level) => (
                  <Choice key={level.value} selected={body[item.key] === level.value} onClick={() => setBody((current) => ({ ...current, [item.key]: level.value }))}>{level.label}</Choice>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      </section>}
      {step === 3 && <section className="flex flex-col gap-4 rounded-[20px] bg-white p-4">
        {SCALES.map((scale) => (
          <fieldset key={scale.key} className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="p-0 text-sm font-extrabold">{scale.label} <span className="font-semibold text-[#4A4F7A]">· {scale.hint}</span></legend>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = values[scale.key] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setValues((current) => ({ ...current, [scale.key]: value }));
                      if (scale.key === 'energy') {
                        setEnergyFeel((current) => {
                          const match = ENERGIES.find((item) => item.value === current);
                          return match && match.score === value ? current : '';
                        });
                      }
                    }}
                    className="h-11 cursor-pointer rounded-xl text-[15px] font-extrabold text-[#1B1F5E]"
                    style={{ background: selected ? '#F49A9E' : '#FFF6CF', border: `1.5px solid ${selected ? '#E57F86' : '#F6E27F'}` }}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </section>}
      {step === 4 && <>
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-sm font-extrabold">Otros síntomas</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SYMPTOMS.filter((item) => showVasomotor || (item.code !== 'bochornos' && item.code !== 'sudores_nocturnos')).map((item) => {
            const name = item.label;
            const selected = symptoms.includes(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleSymptom(name)}
                className="min-h-10 cursor-pointer rounded-full px-3.5 text-[13px] font-bold text-[#1B1F5E]"
                style={{ background: selected ? '#F49A9E' : '#FFF6CF', border: `1.5px solid ${selected ? '#E57F86' : '#F6E27F'}` }}
              >
                {name}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setSpotting((current) => !current)} className="mt-3 min-h-10 cursor-pointer rounded-full px-3.5 text-[13px] font-bold text-[#1B1F5E]" style={{ background: spotting ? '#F49A9E' : '#FFF6CF', border: `1.5px solid ${spotting ? '#E57F86' : '#F6E27F'}` }}>
          {spotting ? 'Manchado o sangrado fuera de la regla' : 'Sin manchado fuera de la regla'}
        </button>
      </section>
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        {([
          { label: '¿Cómo dormiste?', value: sleepDetails, set: setSleepDetails, placeholder: 'Ej.: 7 horas, me desperté una vez' },
          { label: 'Hábitos de hoy', value: behavior, set: setBehavior, placeholder: 'Ej.: caminé 30 min, mucho café' },
          { label: 'Notas para Cyclia', value: notes, set: setNotes, placeholder: 'Algo que quieras que Cyclia tenga en cuenta' },
        ] satisfies { label: string; value: string; set: (next: string) => void; placeholder: string }[]).map((field) => (
          <label key={field.label} className="flex flex-col gap-1.5 text-sm font-extrabold">
            {field.label}
            <textarea
              rows={2}
              value={field.value}
              placeholder={field.placeholder}
              onChange={(event) => field.set(event.target.value)}
              className="resize-none rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] p-2.5 text-sm font-normal text-[#1B1F5E] outline-none"
            />
          </label>
        ))}
      </section>
      </>}
      <div className="flex gap-2">
        {step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)} className="h-12 flex-1 cursor-pointer rounded-full border border-[#C9D3EF] bg-white text-[15px] font-extrabold text-[#1B1F5E]">Atrás</button>}
        {step < 4 && <button type="button" onClick={() => setStep((current) => current + 1)} className="h-12 flex-1 cursor-pointer rounded-full bg-[#3A44C4] text-[15px] font-extrabold text-white">Siguiente</button>}
      </div>
      {step === 4 && <button type="button" onClick={() => onSaveAndAnalyze(buildLog())} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E]">Guardar y ver mi gráfica</button>}
      {step === 4 && <button type="button" onClick={() => onSave(buildLog())} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E]">Solo guardar</button>}
      {suggestion && onSchedule && (
        <section className="flex flex-col gap-2 rounded-[20px] bg-white p-4" aria-labelledby="schedule-suggestion">
          <h2 id="schedule-suggestion" className="m-0 text-base font-extrabold">Agendar una actividad para mí</h2>
          <p className="m-0 text-sm text-[#3B4070]">Sugerencia opcional: <strong className="text-[#1B1F5E]">{suggestion.title}</strong></p>
          <p className="m-0 text-sm text-[#3B4070]">{suggestion.note}</p>
          <button type="button" onClick={() => onSchedule(suggestion.title)} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Agendar una actividad para mí</button>
        </section>
      )}
      <p className="m-0 px-1 text-[12px] leading-relaxed text-[#4A4F7A]">Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
    </div>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="flex min-h-12 cursor-pointer items-center justify-between gap-2 rounded-2xl px-3 text-left text-[15px] font-extrabold"
      style={{ background: selected ? '#1B1F5E' : '#F8F9FE', color: selected ? '#FFFFFF' : '#1B1F5E', border: `1.5px solid ${selected ? '#1B1F5E' : '#E1E5F5'}` }}
    >
      <span>{children}</span>
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  );
}
