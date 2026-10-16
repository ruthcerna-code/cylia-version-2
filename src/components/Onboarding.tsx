import React, { useState } from 'react';
import { UserProfile } from '../types';
import WelcomeScreen from './WelcomeScreen';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
  accountEmail?: string;
  gmailConnected?: boolean;
  gmailError?: string;
  onConnectGoogle?: () => void;
}

const FIELD_CLASS =
  'w-full bg-[#F8F9FE] border-2 border-[#C9D3EF] rounded-2xl px-5 py-5 text-lg font-medium text-[#1B1F5E] outline-none transition focus:border-[#3A44C4] focus:ring-4 focus:ring-[#3A44C4]/15';

export default function Onboarding({ onComplete, accountEmail, gmailConnected, gmailError, onConnectGoogle }: OnboardingProps) {
  // Load existing profile from localStorage to pre-populate if they are starting over
  const getStoredProfile = (): UserProfile | null => {
    try {
      const stored = localStorage.getItem('cyclia_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const initialProfile = getStoredProfile();

  const [step, setStep] = useState<number>(0);
  const [name, setName] = useState(initialProfile?.name || '');
  const [age, setAge] = useState<number | ''>(initialProfile?.age || '');
  const [birthDate, setBirthDate] = useState(initialProfile?.birthDate || '');
  const [weight, setWeight] = useState<number | ''>(initialProfile?.weight || '');
  const [height, setHeight] = useState<number | ''>(initialProfile?.height || '');
  const [email, setEmail] = useState(initialProfile?.email || accountEmail || '');
  const [lastPeriodDate, setLastPeriodDate] = useState(initialProfile?.lastPeriodDate || '');
  const [periodLength, setPeriodLength] = useState<number | ''>(initialProfile?.periodLength || '');
  const [cycleLength, setCycleLength] = useState<number | ''>(initialProfile?.cycleLength || '');
  const [hasContraceptive, setHasContraceptive] = useState<boolean | null>(
    initialProfile ? initialProfile.contraceptive !== 'Ninguno' : null
  );
  const [contraceptiveName, setContraceptiveName] = useState(
    initialProfile && initialProfile.contraceptive !== 'Ninguno' ? initialProfile.contraceptive : ''
  );
  const [isCeliac, setIsCeliac] = useState(initialProfile?.isCeliac || false);
  const [hasDiabetes, setHasDiabetes] = useState(initialProfile?.hasDiabetes || false);
  const [hasObesity, setHasObesity] = useState(initialProfile?.hasObesity || false);
  const [hasDepression, setHasDepression] = useState(initialProfile?.hasDepression || false);
  const [error, setError] = useState('');

  const nextStep = () => {
    setError('');
    
    // Perform validations before moving to next steps
    if (step === 1 && !name.trim()) {
      setError('Por favor, ingresa tu nombre.');
      return;
    }
    if (step === 2) {
      if (age === '' || isNaN(Number(age))) {
        setError('Por favor, ingresa una edad válida.');
        return;
      }
      if (Number(age) < 12) {
        setError('La edad registrada debe ser de al menos 12 años.');
        return;
      }
    }
    if (step === 3 && !birthDate) {
      setError('Por favor, selecciona tu fecha de nacimiento.');
      return;
    }
    if (step === 4 && (weight === '' || Number(weight) <= 0)) {
      setError('Por favor, ingresa tu peso en kg.');
      return;
    }
    if (step === 5 && (height === '' || Number(height) <= 0)) {
      setError('Por favor, ingresa tu estatura en cm.');
      return;
    }
    if (step === 6) {
      // Email is optional, can be empty, but if provided, must look like email
      if (email.trim() && !email.includes('@')) {
        setError('Por favor, ingresa un correo electrónico válido o déjalo vacío.');
        return;
      }
    }
    if (step === 7 && !lastPeriodDate) {
      setError('Por favor, selecciona una fecha válida.');
      return;
    }
    if (step === 8) {
      if (periodLength === '' || isNaN(Number(periodLength))) {
        setError('Por favor, ingresa la duración.');
        return;
      }
      const pNum = Number(periodLength);
      if (pNum < 2 || pNum > 10) {
        setError('La duración de la menstruación debe estar entre 2 y 10 días.');
        return;
      }
    }
    if (step === 9) {
      if (cycleLength === '' || isNaN(Number(cycleLength))) {
        setError('Por favor, ingresa la duración.');
        return;
      }
      const cNum = Number(cycleLength);
      if (cNum < 21 || cNum > 40) {
        setError('La duración del ciclo promedio debe estar entre 21 y 40 días.');
        return;
      }
    }
    if (step === 10 && hasContraceptive === null) {
      setError('Por favor, selecciona una opción.');
      return;
    }
    if (step === 11 && hasContraceptive && !contraceptiveName.trim()) {
      setError('Por favor, indica qué método utilizas.');
      return;
    }

    // Go to next step
    if (step === 10 && !hasContraceptive) {
      setStep(12);
    } else if (step === 11) {
      setStep(12);
    } else if (step === 12) {
      handleFinish(hasContraceptive ? contraceptiveName : 'Ninguno');
    } else {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setError('');
    if (step > 0) {
      if (step === 12) {
        if (!hasContraceptive) {
          setStep(10);
        } else {
          setStep(11);
        }
      } else {
        setStep(step - 1);
      }
    }
  };

  const handleFinish = (contraValue: string) => {
    const profile: UserProfile = {
      name,
      age: Number(age),
      birthDate,
      weight: Number(weight),
      height: Number(height),
      email: email.trim(),
      lastPeriodDate,
      periodLength: Number(periodLength),
      cycleLength: Number(cycleLength),
      contraceptive: contraValue,
      isCeliac,
      hasDiabetes,
      hasObesity,
      hasDepression,
    };
    onComplete(profile);
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return "¿Cómo te llamas?";
      case 2: return `Encantada, ${name}. ¿Qué edad tienes?`;
      case 3: return "¿Cuál es tu fecha de nacimiento?";
      case 4: return "¿Cuánto pesas aproximadamente?";
      case 5: return "¿Cuánto mides?";
      case 6: return "¿Cuál es tu correo electrónico? (Opcional)";
      case 7: return "¿Cuándo comenzó tu última menstruación?";
      case 8: return "¿Cuántos días dura habitualmente tu sangrado menstrual?";
      case 9: return "¿Cuántos días dura el total de tu ciclo promedio?";
      case 10: return "¿Utilizas algún método anticonceptivo?";
      case 11: return "¿Cuál método anticonceptivo utilizas?";
      case 12: return "¿Tienes alguna de las siguientes condiciones de salud?";
      default: return "";
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-2">
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ingresa tu nombre"
              className={FIELD_CLASS}
              onKeyDown={(e) => e.key === 'Enter' && nextStep()}
            />
            <p className="text-xs text-[#9A9A90] px-2">Solo necesitamos tu primer nombre o apodo.</p>
          </div>
        );
      case 2:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="number"
                autoFocus
                value={age}
                onChange={(e) => setAge(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej. 28"
                min="12"
                max="100"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">años</span>
            </div>
            <p className="text-xs text-[#9A9A90] px-2">Validación: Debes ser mayor de 12 años.</p>
          </div>
        );
      case 3:
        return (
          <div className="space-y-2">
            <input
              type="date"
              autoFocus
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={FIELD_CLASS}
              onKeyDown={(e) => e.key === 'Enter' && nextStep()}
            />
          </div>
        );
      case 4:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="number"
                autoFocus
                value={weight}
                onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej. 60"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">kg</span>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="number"
                autoFocus
                value={height}
                onChange={(e) => setHeight(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej. 165"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">cm</span>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="space-y-2">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nombre@ejemplo.com"
              className={FIELD_CLASS}
              onKeyDown={(e) => e.key === 'Enter' && nextStep()}
            />
            <p className="text-xs text-[#9A9A90] px-2">Opcional. Puedes dejarlo en blanco.</p>
          </div>
        );
      case 7:
        return (
          <div className="space-y-2">
            <input
              type="date"
              autoFocus
              value={lastPeriodDate}
              onChange={(e) => setLastPeriodDate(e.target.value)}
              className={FIELD_CLASS}
              onKeyDown={(e) => e.key === 'Enter' && nextStep()}
            />
            <p className="text-xs text-[#9A9A90] px-2">Primer día de tu última menstruación.</p>
          </div>
        );
      case 8:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="number"
                autoFocus
                value={periodLength}
                onChange={(e) => setPeriodLength(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej. 5"
                min="2"
                max="10"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">días</span>
            </div>
            <p className="text-xs text-[#9A9A90] px-2">Rango válido: entre 2 y 10 días.</p>
          </div>
        );
      case 9:
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="number"
                autoFocus
                value={cycleLength}
                onChange={(e) => setCycleLength(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ej. 28"
                min="21"
                max="40"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">días</span>
            </div>
            <p className="text-xs text-[#9A9A90] px-2">Rango válido: de 21 a 40 días de duración promedio.</p>
          </div>
        );
      case 10:
        return (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                setHasContraceptive(true);
                // Go to next step
                setStep(11);
              }}
              className={`py-6 rounded-2xl border-2 text-base font-semibold cursor-pointer transition-all ${
                hasContraceptive === true
                  ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]'
                  : 'border-[#1E5631]/40 bg-white text-[#1E5631] hover:border-[#1E5631] hover:bg-[#F5F6F8]'
              }`}
            >
              Sí, utilizo
            </button>
            <button
              onClick={() => {
                setHasContraceptive(false);
                setError('');
                // Complete directly as "Ninguno"
                handleFinish('Ninguno');
              }}
              className={`py-6 rounded-2xl border-2 text-base font-semibold cursor-pointer transition-all ${
                hasContraceptive === false
                  ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]'
                  : 'border-[#1E5631]/40 bg-white text-[#1E5631] hover:border-[#1E5631] hover:bg-[#F5F6F8]'
              }`}
            >
              No utilizo
            </button>
          </div>
        );
      case 11:
        return (
          <div className="space-y-2">
            <input
              type="text"
              autoFocus
              value={contraceptiveName}
              onChange={(e) => setContraceptiveName(e.target.value)}
              placeholder="Ej. Pastillas anticonceptivas, DIU, etc."
              className={FIELD_CLASS}
              onKeyDown={(e) => e.key === 'Enter' && nextStep()}
            />
            <p className="text-xs text-[#9A9A90] px-2">Indica el tipo o marca para tenerlo de referencia.</p>
          </div>
        );
      case 12:
        return (
          <div className="space-y-4">
            <p className="text-xs text-[#1B4D3E] mb-2">Selecciona las opciones que correspondan para personalizar tus recomendaciones de actividad física y de bienestar diario:</p>
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setIsCeliac(!isCeliac)}
                className={`py-4 px-5 rounded-2xl border-2 text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                  isCeliac
                    ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]'
                    : 'border-[#1E5631]/40 bg-white text-[#1E5631] hover:border-[#1E5631]'
                }`}
              >
                <span>🌾 Celiaquía / Sensibilidad al gluten</span>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5">{isCeliac ? '✅ Sí' : '⬜ No'}</span>
              </button>

              <button
                type="button"
                onClick={() => setHasDiabetes(!hasDiabetes)}
                className={`py-4 px-5 rounded-2xl border-2 text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                  hasDiabetes
                    ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]'
                    : 'border-[#1E5631]/40 bg-white text-[#1E5631] hover:border-[#1E5631]'
                }`}
              >
                <span>🩸 Diabetes / Resistencia a la insulina</span>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5">{hasDiabetes ? '✅ Sí' : '⬜ No'}</span>
              </button>

              <button
                type="button"
                onClick={() => setHasObesity(!hasObesity)}
                className={`py-4 px-5 rounded-2xl border-2 text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                  hasObesity
                    ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]'
                    : 'border-[#1E5631]/40 bg-white text-[#1E5631] hover:border-[#1E5631]'
                }`}
              >
                <span>⚖️ Obesidad</span>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5">{hasObesity ? '✅ Sí' : '⬜ No'}</span>
              </button>

              <button
                type="button"
                onClick={() => setHasDepression(!hasDepression)}
                className={`py-4 px-5 rounded-2xl border-2 text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                  hasDepression
                    ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]'
                    : 'border-[#1E5631]/40 bg-white text-[#1E5631] hover:border-[#1E5631]'
                }`}
              >
                <span>🧠 Depresión / Ansiedad persistente</span>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/5">{hasDepression ? '✅ Sí' : '⬜ No'}</span>
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (step === 0) {
    return (
      <WelcomeScreen
        subtitle={initialProfile ? `Hola de nuevo, ${initialProfile.name}` : 'Tu ciclo, tu energía, tu ritmo.'}
        body={initialProfile
          ? 'Puedes actualizar tus datos de ciclo y salud. Tus registros diarios se conservan.'
          : 'Entiende cómo tu biología influye en tu energía, tu concentración y tu bienestar, día a día.'}
        primaryLabel={initialProfile ? 'Revisar y actualizar' : 'Comenzar'}
        onPrimary={() => setStep(1)}
        secondaryLabel={!gmailConnected && onConnectGoogle ? 'Ya tengo cuenta' : undefined}
        onSecondary={!gmailConnected && onConnectGoogle ? onConnectGoogle : undefined}
        error={gmailError}
      />
    );
  }

  return (
    <div className="flex h-dvh justify-center bg-transparent">
      <div className="channel-frame !min-h-0 h-full flex flex-col">
        <header className="shrink-0 bg-transparent">
          <div className="h-1.5 w-full bg-[#EFEFEF]">
            <div
              className="h-full bg-[#F49A9E] transition-all duration-300"
              style={{ width: `${(step / 12) * 100}%` }}
            />
          </div>
          <div className="h-14 px-5 flex items-center justify-between">
            <button
              type="button"
              onClick={prevStep}
              className="text-sm font-semibold text-[#3A44C4] hover:text-[#1B1F5E] active:opacity-70 cursor-pointer"
            >
              ← Atrás
            </button>
            <span className="text-xs font-semibold tracking-wide text-[#1B1F5E]">
              Paso {step} de 12
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 pt-6 pb-4">
          <h2 className="font-serif text-3xl text-[#1B1F5E] leading-tight mb-8">
            {getStepTitle()}
          </h2>
          {renderStepContent()}
          {error && (
            <p className="mt-4 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-2xl">
              {error}
            </p>
          )}
        </main>
        {step !== 10 && (
          <div className="shrink-0 px-5 pt-3 pb-6 bg-[#F5F6F8]">
            <button
              type="button"
              onClick={nextStep}
              className="btn-fucsia w-full font-semibold text-base py-4 rounded-full cursor-pointer transition-colors"
            >
              {step === 12 ? 'Finalizar Registro' : 'Siguiente'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
