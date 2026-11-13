import React, { useState } from 'react';
import { HormonalMethod, PerimenopauseMode, SpecialSituation, UserProfile } from '../types';
import { ageFromBirthDate, HORMONAL_LABELS, HORMONAL_METHODS, inferHormonalMethod, SITUATION_LABELS, SPECIAL_SITUATIONS, validateProfile } from '../utils/profileFields';

interface HealthProfileModalProps {
  profile: UserProfile;
  onSave: (updated: UserProfile) => void;
  onClose: () => void;
}

export default function HealthProfileModal({ profile, onSave, onClose }: HealthProfileModalProps) {
  // Personal info state
  const [name, setName] = useState(profile.name || '');
  const [birthDate, setBirthDate] = useState(profile.birthDate || '');
  const age = ageFromBirthDate(birthDate);
  const [weight, setWeight] = useState(profile.weight || 60);
  const [height, setHeight] = useState(profile.height || 165);
  const [email, setEmail] = useState(profile.email || '');

  // Menstrual cycle state
  const [lastPeriodDate, setLastPeriodDate] = useState(profile.lastPeriodDate || '');
  const [periodLength, setPeriodLength] = useState(profile.periodLength || 5);
  const [cycleLength, setCycleLength] = useState(profile.cycleLength || 28);
  const [periodLengthKnown, setPeriodLengthKnown] = useState(profile.periodLengthKnown !== false);
  const [cycleLengthKnown, setCycleLengthKnown] = useState(profile.cycleLengthKnown !== false);
  const [hormonalMethod, setHormonalMethod] = useState<HormonalMethod>(profile.hormonalMethod || inferHormonalMethod(profile.contraceptive || ''));
  const [specialSituation, setSpecialSituation] = useState<SpecialSituation>(profile.specialSituation || 'ninguna');
  const [perimenopauseMode, setPerimenopauseMode] = useState<PerimenopauseMode>(profile.perimenopauseMode || 'off');

  // Health conditions state
  const [isCeliac, setIsCeliac] = useState(profile.isCeliac || false);
  const [hasDiabetes, setHasDiabetes] = useState(profile.hasDiabetes || false);
  const [hasObesity, setHasObesity] = useState(profile.hasObesity || false);
  const [hasDepression, setHasDepression] = useState(profile.hasDepression || false);

  const [activeTab, setActiveTab] = useState<'personal' | 'cycle' | 'conditions'>('personal');
  const [error, setError] = useState('');

  const handleFormSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const updatedProfile: UserProfile = {
      ...profile,
      name: name.trim(),
      age: age ?? 0,
      birthDate,
      weight: Number(weight),
      height: Number(height),
      email: email.trim(),
      lastPeriodDate,
      periodLength: periodLengthKnown ? Number(periodLength) : 5,
      cycleLength: cycleLengthKnown ? Number(cycleLength) : 28,
      periodLengthKnown,
      cycleLengthKnown,
      hormonalMethod,
      specialSituation,
      perimenopauseMode,
      contraceptive: HORMONAL_LABELS[hormonalMethod],
      isCeliac,
      hasDiabetes,
      hasObesity,
      hasDepression
    };

    const problem = validateProfile(updatedProfile);
    if (problem) {
      setError(problem);
      setActiveTab(/menstru|ciclo|anticonceptivo|período|periodo/i.test(problem) ? 'cycle' : 'personal');
      return;
    }

    onSave(updatedProfile);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#3A3A35]/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[32px] border border-[#d7e6d4] shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center p-6 md:p-8 pb-4 border-b border-[#d7e6d4]">
          <div>
            <h3 className="font-serif font-semibold text-xl text-[#1E5631]">Ficha de Salud y Perfil</h3>
            <p className="text-xs text-[#9A9A90] font-medium">Modifica los datos iniciales y tu estado de salud</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[#d7e6d4] text-[#9A9A90] hover:text-[#1E5631] flex items-center justify-center transition-colors cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#d7e6d4] px-4 md:px-8 bg-[#F5F6F8]">
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'personal'
                ? 'border-[#1E5631] text-[#1E5631]'
                : 'border-transparent text-[#9A9A90] hover:text-[#1E5631]'
            }`}
          >
            👤 Datos Personales
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cycle')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'cycle'
                ? 'border-[#1E5631] text-[#1E5631]'
                : 'border-transparent text-[#9A9A90] hover:text-[#1E5631]'
            }`}
          >
            🌸 Salud Femenina
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('conditions')}
            className={`py-3 px-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'conditions'
                ? 'border-[#1E5631] text-[#1E5631]'
                : 'border-transparent text-[#9A9A90] hover:text-[#1E5631]'
            }`}
          >
            ⚠️ Salud General
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleFormSave} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-5">
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-semibold">
                ⚠️ {error}
              </div>
            )}

            {/* TAB 1: Personal Info */}
            {activeTab === 'personal' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Nombre Completo</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                    placeholder="Tu nombre"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Fecha de nacimiento</label>
                  <input
                    type="date"
                    value={birthDate}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Edad (años)</label>
                  <input
                    type="number"
                    value={age ?? ''}
                    readOnly
                    className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm"
                  />
                  <p className="mt-1 text-[10px] text-[#9A9A90]">Número calculado con la fecha de nacimiento.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Peso (kg)</label>
                    <input
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(Number(e.target.value))}
                      className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                      min="30"
                      max="200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Estatura (cm)</label>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(Number(e.target.value))}
                      className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                      min="100"
                      max="250"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                    placeholder="ejemplo@correo.com"
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Female Health / Cycle */}
            {activeTab === 'cycle' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Última Fecha de Menstruación</label>
                  <p className="text-[10px] text-[#9A9A90] mb-1">Indica el primer día de tu último período para recalcular tus fases.</p>
                  <input
                    type="date"
                    value={lastPeriodDate}
                    onChange={(e) => setLastPeriodDate(e.target.value)}
                    className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Duración Período (días)</label>
                    <input
                      type="number"
                      value={periodLength}
                      onChange={(e) => setPeriodLength(Number(e.target.value))}
                      className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                      min="1"
                      max="10"
                      disabled={!periodLengthKnown}
                      required={periodLengthKnown}
                    />
                    <label className="mt-2 flex items-center gap-2 text-xs text-[#1E5631]"><input type="checkbox" checked={!periodLengthKnown} onChange={(event) => { setPeriodLengthKnown(!event.target.checked); if (event.target.checked) setPeriodLength(5); }} /> No sé (se usan 5 días)</label>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Duración Ciclo (días)</label>
                    <input
                      type="number"
                      value={cycleLength}
                      onChange={(e) => setCycleLength(Number(e.target.value))}
                      className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]"
                      min="21"
                      max="45"
                      disabled={!cycleLengthKnown}
                      required={cycleLengthKnown}
                    />
                    <label className="mt-2 flex items-center gap-2 text-xs text-[#1E5631]"><input type="checkbox" checked={!cycleLengthKnown} onChange={(event) => { setCycleLengthKnown(!event.target.checked); if (event.target.checked) setCycleLength(28); }} /> No sé (se usan 28 días)</label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Anticoncepción hormonal</label>
                  <select value={hormonalMethod} onChange={(event) => setHormonalMethod(event.target.value as HormonalMethod)} className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]">
                    {HORMONAL_METHODS.map((method) => <option key={method} value={method}>{HORMONAL_LABELS[method]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1E5631] uppercase tracking-wider mb-1.5">Situación</label>
                  <select value={specialSituation} onChange={(event) => setSpecialSituation(event.target.value as SpecialSituation)} className="w-full bg-[#F5F6F8] border border-[#d7e6d4] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E5631]">
                    {SPECIAL_SITUATIONS.map((situation) => <option key={situation} value={situation}>{SITUATION_LABELS[situation]}</option>)}
                  </select>
                </div>
                {(age ?? 0) >= 40 && (
                  <label className="flex items-start gap-2 text-sm text-[#1E5631]">
                    <input type="checkbox" className="mt-1" checked={perimenopauseMode === 'on'} onChange={(event) => setPerimenopauseMode(event.target.checked ? 'on' : 'off')} />
                    <span>Modo perimenopausia. Las sugerencias siguen tu energía y tu ánimo, y la variación del ciclo se trata como parte de esta etapa.</span>
                  </label>
                )}
              </div>
            )}

            {/* TAB 3: General Health Conditions */}
            {activeTab === 'conditions' && (
              <div className="space-y-4">
                <p className="text-xs text-[#7A7A70] mb-2">Marca si posees alguna de estas condiciones diagnosticadas. Las sugerencias de ejercicio diario, nutrición y los análisis de la IA se adaptarán a tus necesidades:</p>
                
                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsCeliac(!isCeliac)}
                    className={`py-3.5 px-5 rounded-2xl border text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                      isCeliac
                        ? 'border-[#1E5631] bg-[#F5F6F8] text-[#1E5631] font-bold ring-2 ring-[#1E5631]'
                        : 'border-[#d7e6d4] bg-white text-[#3A3A35] hover:bg-[#F5F6F8]'
                    }`}
                  >
                    <span>🌾 Celiaquía / Sensibilidad al gluten</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/5">{isCeliac ? '✅ Sí' : '⬜ No'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasDiabetes(!hasDiabetes)}
                    className={`py-3.5 px-5 rounded-2xl border text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                      hasDiabetes
                        ? 'border-[#1E5631] bg-[#F5F6F8] text-[#1E5631] font-bold ring-2 ring-[#1E5631]'
                        : 'border-[#d7e6d4] bg-white text-[#3A3A35] hover:bg-[#F5F6F8]'
                    }`}
                  >
                    <span>🩸 Diabetes / Resistencia a la insulina</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/5">{hasDiabetes ? '✅ Sí' : '⬜ No'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasObesity(!hasObesity)}
                    className={`py-3.5 px-5 rounded-2xl border text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                      hasObesity
                        ? 'border-[#1E5631] bg-[#F5F6F8] text-[#1E5631] font-bold ring-2 ring-[#1E5631]'
                        : 'border-[#d7e6d4] bg-white text-[#3A3A35] hover:bg-[#F5F6F8]'
                    }`}
                  >
                    <span>⚖️ Obesidad</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/5">{hasObesity ? '✅ Sí' : '⬜ No'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasDepression(!hasDepression)}
                    className={`py-3.5 px-5 rounded-2xl border text-sm font-semibold transition-all text-left flex justify-between items-center cursor-pointer ${
                      hasDepression
                        ? 'border-[#1E5631] bg-[#F5F6F8] text-[#1E5631] font-bold ring-2 ring-[#1E5631]'
                        : 'border-[#d7e6d4] bg-white text-[#3A3A35] hover:bg-[#F5F6F8]'
                    }`}
                  >
                    <span>🧠 Depresión / Ansiedad persistente</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-black/5">{hasDepression ? '✅ Sí' : '⬜ No'}</span>
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Form Footer */}
          <div className="p-6 md:p-8 border-t border-[#d7e6d4] flex justify-between gap-4 bg-[#F5F6F8]">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-full border border-[#d7e6d4] text-xs font-bold uppercase tracking-wider text-[#7A7A70] hover:bg-white transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 bg-[#1E5631] hover:bg-[#1B4D3E] text-white font-semibold py-3 rounded-full shadow-sm transition-all text-xs uppercase tracking-wide cursor-pointer text-center"
            >
              Guardar Cambios
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
