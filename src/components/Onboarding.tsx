import React, { useState } from 'react';
import { HormonalMethod, SpecialSituation, UserProfile } from '../types';
import { ageFromBirthDate, HORMONAL_LABELS, HORMONAL_METHODS, SITUATION_LABELS, SPECIAL_SITUATIONS, validateBirthDate, validateCycleLength, validateEmail, validateHeight, validateName, validatePeriodDate, validatePeriodLength, validateProfile, validateWeight } from '../utils/profileFields';
import WelcomeScreen from './WelcomeScreen';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
  accountEmail?: string;
  onLeave?: () => void;
}

const FIELD_CLASS =
  'w-full bg-[#F8F9FE] border-2 border-[#C9D3EF] rounded-2xl px-5 py-5 text-lg font-medium text-[#1B1F5E] outline-none transition focus:border-[#3A44C4] focus:ring-4 focus:ring-[#3A44C4]/15';

export default function Onboarding({ onComplete, accountEmail, onLeave }: OnboardingProps) {
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
  const [birthDate, setBirthDate] = useState(initialProfile?.birthDate || '');
  const [age, setAge] = useState<number | ''>(initialProfile?.birthDate ? (ageFromBirthDate(initialProfile.birthDate) ?? '') : '');
  const [weight, setWeight] = useState<number | ''>(initialProfile?.weight || '');
  const [height, setHeight] = useState<number | ''>(initialProfile?.height || '');
  const [email, setEmail] = useState(initialProfile?.email || accountEmail || '');
  const [lastPeriodDate, setLastPeriodDate] = useState(initialProfile?.lastPeriodDate || '');
  const [periodLength, setPeriodLength] = useState<number | ''>(initialProfile?.periodLength || '');
  const [cycleLength, setCycleLength] = useState<number | ''>(initialProfile?.cycleLength || '');
  const [periodLengthKnown, setPeriodLengthKnown] = useState(initialProfile?.periodLengthKnown !== false);
  const [cycleLengthKnown, setCycleLengthKnown] = useState(initialProfile?.cycleLengthKnown !== false);
  const [hormonalMethod, setHormonalMethod] = useState<HormonalMethod | null>(initialProfile?.hormonalMethod || null);
  const [specialSituation, setSpecialSituation] = useState<SpecialSituation | null>(initialProfile?.specialSituation || null);
  const [isCeliac, setIsCeliac] = useState(initialProfile?.isCeliac || false);
  const [hasDiabetes, setHasDiabetes] = useState(initialProfile?.hasDiabetes || false);
  const [hasObesity, setHasObesity] = useState(initialProfile?.hasObesity || false);
  const [hasDepression, setHasDepression] = useState(initialProfile?.hasDepression || false);
  const [error, setError] = useState('');

  const nextStep = () => {
    setError('');
    
    // Perform validations before moving to next steps
    if (step === 1) {
      const nameError = validateName(name);
      if (nameError) {
        setError(nameError);
        return;
      }
    }
    if (step === 2) {
      const birthError = validateBirthDate(birthDate);
      if (birthError) {
        setError(birthError);
        return;
      }
      const calculated = ageFromBirthDate(birthDate);
      if (calculated == null) {
        setError('No pude calcular la edad con esa fecha.');
        return;
      }
      setAge(calculated);
    }
    if (step === 3 && age !== ageFromBirthDate(birthDate)) {
      setError('La edad debe coincidir con la fecha de nacimiento.');
      return;
    }
    if (step === 4) {
      const weightError = validateWeight(Number(weight));
      if (weightError) {
        setError(weightError);
        return;
      }
    }
    if (step === 5) {
      const heightError = validateHeight(Number(height));
      if (heightError) {
        setError(heightError);
        return;
      }
    }
    if (step === 6) {
      const emailError = validateEmail(email);
      if (emailError) {
        setError(emailError);
        return;
      }
    }
    if (step === 7) {
      const periodError = validatePeriodDate(lastPeriodDate);
      if (periodError) {
        setError(periodError);
        return;
      }
    }
    if (step === 8) {
      setPeriodLengthKnown(true);
      const lengthError = validatePeriodLength(Number(periodLength));
      if (lengthError) {
        setError(lengthError);
        return;
      }
    }
    if (step === 9) {
      setCycleLengthKnown(true);
      const cycleError = validateCycleLength(Number(cycleLength));
      if (cycleError) {
        setError(cycleError);
        return;
      }
    }
    if (step === 10 && !hormonalMethod) {
      setError('Elige una opción.');
      return;
    }
    if (step === 11 && !specialSituation) {
      setError('Elige la situación que corresponde.');
      return;
    }

    if (step === 12) {
      handleFinish();
    } else {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setError('');
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = () => {
    const calculated = ageFromBirthDate(birthDate);
    const method = hormonalMethod || 'ninguna';
    const profile: UserProfile = {
      name: name.trim(),
      age: calculated ?? Number(age),
      birthDate,
      weight: Number(weight),
      height: Number(height),
      email: email.trim(),
      lastPeriodDate,
      periodLength: periodLengthKnown ? Number(periodLength) : 5,
      cycleLength: cycleLengthKnown ? Number(cycleLength) : 28,
      periodLengthKnown,
      cycleLengthKnown,
      hormonalMethod: method,
      specialSituation: specialSituation || 'ninguna',
      perimenopauseMode: 'off',
      contraceptive: HORMONAL_LABELS[method],
      isCeliac,
      hasDiabetes,
      hasObesity,
      hasDepression,
    };
    const problem = validateProfile(profile);
    if (problem) {
      setError(problem);
      return;
    }
    onComplete(profile);
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return "¿Cómo te llamas?";
      case 2: return `${name.trim() || 'Hola'}, ¿cuál es tu fecha de nacimiento?`;
      case 3: return `Tienes ${age} años`;
      case 4: return "¿Cuánto pesas aproximadamente?";
      case 5: return "¿Cuánto mides?";
      case 6: return "¿Cuál es tu correo electrónico? (Opcional)";
      case 7: return "¿Cuándo comenzó tu última menstruación?";
      case 8: return "¿Cuántos días dura habitualmente tu regla?";
      case 9: return "¿Cuántos días dura habitualmente tu ciclo?";
      case 10: return "¿Usas anticoncepción hormonal?";
      case 11: return "¿Hay alguna situación que cambie las predicciones?";
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
            <p className="text-xs text-[#9A9A90] px-2">Texto: letras, espacios y guiones. Sin números.</p>
          </div>
        );
      case 2:
        return (
          <div className="space-y-2">
            <input
              type="date"
              autoFocus
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setBirthDate(e.target.value);
                const calculated = ageFromBirthDate(e.target.value);
                setAge(calculated ?? '');
              }}
              className={FIELD_CLASS}
              onKeyDown={(e) => e.key === 'Enter' && nextStep()}
            />
            <p className="text-xs text-[#9A9A90] px-2">Va antes que la edad. Con esta fecha se calcula.</p>
          </div>
        );
      case 3:
        return (
          <div className="space-y-2">
            <p className="rounded-2xl bg-[#F8F9FE] px-5 py-5 text-lg font-medium text-[#1B1F5E]">{age} años</p>
            <p className="text-xs text-[#9A9A90] px-2">Número calculado. No se escribe a mano.</p>
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
                min="1"
                max="10"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">días</span>
            </div>
            <p className="text-xs text-[#9A9A90] px-2">De 1 a 10 días. Si no lo sabes, se usan 5.</p>
            <button type="button" onClick={() => { setPeriodLength(5); setPeriodLengthKnown(false); setError(''); setStep(9); }} className="w-full rounded-2xl border-2 border-[#1E5631]/40 bg-white py-4 text-sm font-semibold text-[#1E5631] cursor-pointer">No sé</button>
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
                max="45"
                className={FIELD_CLASS}
                onKeyDown={(e) => e.key === 'Enter' && nextStep()}
              />
              <span className="text-lg font-medium text-[#1B4D3E]">días</span>
            </div>
            <p className="text-xs text-[#9A9A90] px-2">De 21 a 45 días. Si no lo sabes, se usan 28.</p>
            <button type="button" onClick={() => { setCycleLength(28); setCycleLengthKnown(false); setError(''); setStep(10); }} className="w-full rounded-2xl border-2 border-[#1E5631]/40 bg-white py-4 text-sm font-semibold text-[#1E5631] cursor-pointer">No sé</button>
          </div>
        );
      case 10:
        return (
          <div className="grid grid-cols-1 gap-3">
            {HORMONAL_METHODS.map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => { setHormonalMethod(method); setError(''); setStep(11); }}
                className={`rounded-2xl border-2 px-5 py-4 text-left text-sm font-semibold cursor-pointer ${hormonalMethod === method ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]' : 'border-[#1E5631]/40 bg-white text-[#1E5631]'}`}
              >
                {HORMONAL_LABELS[method]}
              </button>
            ))}
          </div>
        );
      case 11:
        return (
          <div className="grid grid-cols-1 gap-3">
            {SPECIAL_SITUATIONS.map((situation) => (
              <button
                key={situation}
                type="button"
                onClick={() => { setSpecialSituation(situation); setError(''); setStep(12); }}
                className={`rounded-2xl border-2 px-5 py-4 text-left text-sm font-semibold cursor-pointer ${specialSituation === situation ? 'border-[#1E5631] bg-[#A8E0A2] text-[#1E5631]' : 'border-[#1E5631]/40 bg-white text-[#1E5631]'}`}
              >
                {SITUATION_LABELS[situation]}
              </button>
            ))}
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
        secondaryLabel={onLeave ? 'Entrar con otra cuenta' : undefined}
        onSecondary={onLeave}
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
