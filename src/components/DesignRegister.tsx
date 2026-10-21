import React, { useState } from 'react';
import type { DailyLog } from '../types';
import type { ActivitySuggestion } from '../utils/activities';

const SCALES = [
  { key: 'fatigue', label: 'Cansancio', hint: '1 nada · 5 mucho' },
  { key: 'mood', label: 'Ánimo', hint: '1 muy bien · 5 muy triste' },
  { key: 'stress', label: 'Estrés', hint: '1 bajo · 5 alto' },
  { key: 'sleepQuality', label: 'Sueño', hint: '1 excelente · 5 muy malo' },
  { key: 'pain', label: 'Dolor físico', hint: '1 nada · 5 mucho' },
] as const;

const SYMPTOMS = ['Cólicos', 'Hinchazón', 'Dolor de cabeza', 'Sensibilidad mamaria', 'Antojos', 'Acné', 'Cansancio', 'Ninguno'];

export default function DesignRegister({
  dateStr,
  dateLabel,
  phaseLabel,
  cycleDay,
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
  });
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [sleepDetails, setSleepDetails] = useState(existing?.sleepDetails || '');
  const [behavior, setBehavior] = useState(existing?.behavior || '');
  const [notes, setNotes] = useState(existing?.additionalNotes || '');

  const buildLog = (): DailyLog => {
    const symptomLine = symptoms.length ? `Síntomas: ${symptoms.join(', ')}` : '';
    const extra = [notes.trim(), symptomLine].filter(Boolean).join('\n');
    return {
      date: dateStr,
      fatigue: values.fatigue,
      mood: values.mood,
      stress: values.stress,
      sleepQuality: values.sleepQuality,
      pain: values.pain,
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
      </header>
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-4">
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
                    onClick={() => setValues((current) => ({ ...current, [scale.key]: value }))}
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
      </section>
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-sm font-extrabold">Síntomas</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {SYMPTOMS.map((name) => {
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
      </section>
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        {[
          ['¿Cómo dormiste?', sleepDetails, setSleepDetails, 'Ej.: 7 horas, me desperté una vez'],
          ['Hábitos de hoy', behavior, setBehavior, 'Ej.: caminé 30 min, mucho café'],
          ['Notas para Cyclia', notes, setNotes, 'Algo que quieras que Cyclia tenga en cuenta'],
        ].map(([label, value, setter, placeholder]) => (
          <label key={String(label)} className="flex flex-col gap-1.5 text-sm font-extrabold">
            {label}
            <textarea
              rows={2}
              value={String(value)}
              placeholder={String(placeholder)}
              onChange={(event) => (setter as (next: string) => void)(event.target.value)}
              className="resize-none rounded-xl border-[1.5px] border-[#C9D3EF] bg-[#F8F9FE] p-2.5 text-sm font-normal text-[#1B1F5E] outline-none"
            />
          </label>
        ))}
      </section>
      <button type="button" onClick={() => onSaveAndAnalyze(buildLog())} className="flex h-[52px] cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-base font-extrabold text-[#1B1F5E]">Guardar y analizar</button>
      <button type="button" onClick={() => onSave(buildLog())} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-[15px] font-extrabold text-[#1B1F5E]">Solo guardar</button>
      {suggestion && onSchedule && (
        <section className="flex flex-col gap-2 rounded-[20px] bg-white p-4" aria-labelledby="schedule-suggestion">
          <h2 id="schedule-suggestion" className="m-0 text-base font-extrabold">Agendar una actividad para mí</h2>
          <p className="m-0 text-sm text-[#3B4070]">Sugerencia opcional: <strong className="text-[#1B1F5E]">{suggestion.title}</strong></p>
          <p className="m-0 text-sm text-[#3B4070]">{suggestion.note}</p>
          <button type="button" onClick={() => onSchedule(suggestion.title)} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E]">Agendar una actividad para mí</button>
        </section>
      )}
    </div>
  );
}
