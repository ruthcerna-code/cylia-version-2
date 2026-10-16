import React, { useState } from 'react';
import { DailyLog } from '../types';
import { formatFriendlyDate } from '../utils/cycle';

interface DailyCheckinProps {
  dateStr: string;
  existingLog?: DailyLog;
  onSave: (log: DailyLog) => void;
  onClose: () => void;
}

const SCALE_LABELS = {
  sleep: ["Excelente", "Buena", "Regular", "Mala", "Muy mala"],
  fatigue: ["Ninguna", "Leve", "Moderada", "Alta", "Extrema"],
  pain: ["Ninguno", "Leve", "Moderado", "Alto", "Muy alto"],
  stress: ["Muy bajo", "Bajo", "Moderado", "Alto", "Muy alto"],
  mood: ["Muy feliz", "Bien", "Neutral", "Triste", "Muy triste"]
};

export default function DailyCheckin({ dateStr, existingLog, onSave, onClose }: DailyCheckinProps) {
  const [step, setStep] = useState<number>(1);
  const [sleepQuality, setSleepQuality] = useState<number>(existingLog?.sleepQuality || 2);
  const [fatigue, setFatigue] = useState<number>(existingLog?.fatigue || 1);
  const [pain, setPain] = useState<number>(existingLog?.pain || 1);
  const [stress, setStress] = useState<number>(existingLog?.stress || 3);
  const [mood, setMood] = useState<number>(existingLog?.mood || 2);
  const [sleepDetails, setSleepDetails] = useState<string>(existingLog?.sleepDetails || '');
  const [additionalNotes, setAdditionalNotes] = useState<string>(existingLog?.additionalNotes || '');
  const [behavior, setBehavior] = useState<string>(existingLog?.behavior || '');

  const handleNext = () => {
    if (step < 8) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = () => {
    const newLog: DailyLog = {
      date: dateStr,
      sleepQuality,
      fatigue,
      pain,
      stress,
      mood,
      sleepDetails: sleepDetails.trim(),
      additionalNotes: additionalNotes.trim(),
      behavior: behavior.trim(),
      aiAnalysis: existingLog?.aiAnalysis // Keep existing if it was analyzed
    };
    onSave(newLog);
  };

  const renderScaleButtons = (
    currentVal: number,
    setVal: (val: number) => void,
    labels: string[],
    colorScheme: 'sage' | 'amber' | 'coral'
  ) => {
    let activeBorderColor = 'border-[#F49A9E] bg-[#FFF6CF] text-[#1B1F5E]';
    let hoverColor = 'hover:bg-[#F5F6F8]';
    
    if (colorScheme === 'amber') {
      activeBorderColor = 'border-[#D97706] bg-[#FFFBEB] text-[#D97706]';
    } else if (colorScheme === 'coral') {
      activeBorderColor = 'border-red-400 bg-red-50 text-red-700';
    }

    return (
      <div className="flex flex-col gap-3">
        {labels.map((label, index) => {
          const optionVal = index + 1;
          const isActive = currentVal === optionVal;
          
          return (
            <button
              key={optionVal}
              onClick={() => setVal(optionVal)}
              className={`py-4 px-5 rounded-2xl border text-sm font-semibold transition-all text-left cursor-pointer flex justify-between items-center ${
                isActive ? activeBorderColor : `border-[#d7e6d4] bg-white text-[#3A3A35] ${hoverColor}`
              }`}
            >
              <span>{label}</span>
              <span className="text-xs font-mono opacity-60">Puntaje: {optionVal}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const getStepHeader = () => {
    switch (step) {
      case 1: return "¿Cómo dormiste anoche?";
      case 2: return "¿Qué nivel de fatiga tienes hoy?";
      case 3: return "¿Qué nivel de dolor muscular/cólicos tienes hoy?";
      case 4: return "¿Cómo describirías tu nivel de estrés hoy?";
      case 5: return "¿Cómo está tu estado de ánimo?";
      case 6: return "¿Cómo dormiste? Describe tu noche";
      case 7: return "¿Hay algo más que quieras comentar sobre cómo te sientes hoy?";
      case 8: return "¿Cómo te comportaste hoy en cuanto a tus hábitos y rutinas?";
      default: return "";
    }
  };

  const fieldClass = 'w-full h-44 rounded-2xl border-2 border-[#C9D3EF] bg-[#F8F9FE] px-5 py-5 text-lg font-medium leading-relaxed text-[#1B1F5E] outline-none focus:ring-4 focus:ring-[#3A44C4]/15';

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-[#F5F6F8]">
      <div className="channel-frame !min-h-0 flex h-dvh flex-col">
        <header className="shrink-0 bg-[#F5F6F8]">
          <div className="h-1.5 w-full bg-[#EFEFEF]">
            <div className="h-full bg-[#F49A9E] transition-all duration-300" style={{ width: `${(step / 8) * 100}%` }} />
          </div>
          <div className="flex h-14 items-center justify-between px-5">
            <button
              type="button"
              onClick={step === 1 ? onClose : handlePrev}
              className="cursor-pointer text-sm font-semibold text-[#3A44C4]"
            >
              ← Atrás
            </button>
            <span className="text-xs font-semibold text-[#1B4D3E]">Paso {step} de 8 · {formatFriendlyDate(dateStr)}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 pb-4 pt-6">
          <h2 className="mb-8 font-serif text-3xl leading-tight text-[#1B1F5E]">{getStepHeader()}</h2>
          {step === 1 && renderScaleButtons(sleepQuality, setSleepQuality, SCALE_LABELS.sleep, 'sage')}
          {step === 2 && renderScaleButtons(fatigue, setFatigue, SCALE_LABELS.fatigue, 'amber')}
          {step === 3 && renderScaleButtons(pain, setPain, SCALE_LABELS.pain, 'coral')}
          {step === 4 && renderScaleButtons(stress, setStress, SCALE_LABELS.stress, 'amber')}
          {step === 5 && renderScaleButtons(mood, setMood, SCALE_LABELS.mood, 'sage')}
          {step === 6 && (
            <textarea autoFocus value={sleepDetails} onChange={(e) => setSleepDetails(e.target.value)} placeholder="Ej. Me costó conciliar el sueño pero luego dormí profundo." className={fieldClass} />
          )}
          {step === 7 && (
            <textarea autoFocus value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Ej. Siento un poco de dolor lumbar, pero mi energía mental está bien." className={fieldClass} />
          )}
          {step === 8 && (
            <div className="space-y-4">
              <p className="text-sm text-[#1B4D3E]">Cuenta hábitos de hoy: movimiento, alimentación, agua o descanso.</p>
              <textarea autoFocus value={behavior} onChange={(e) => setBehavior(e.target.value)} placeholder="Ej. Caminé 20 minutos y me hidraté bien." className={fieldClass} />
            </div>
          )}
        </main>

        <div className="shrink-0 bg-[#F5F6F8] px-5 pb-6 pt-3">
          <button type="button" onClick={handleNext} className="btn-fucsia w-full cursor-pointer rounded-full py-4 text-base font-semibold">
            {step === 8 ? 'Guardar Registro' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
