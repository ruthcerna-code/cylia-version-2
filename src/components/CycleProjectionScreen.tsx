import type { UserProfile } from '../types';
import { addCalendarDays, formatFriendlyDate, projectNextCycles } from '../utils/cycle';

interface CycleProjectionScreenProps {
  profile: UserProfile;
  onBack: () => void;
}

export default function CycleProjectionScreen({ profile, onBack }: CycleProjectionScreenProps) {
  const projections = projectNextCycles(profile.lastPeriodDate, profile.cycleLength, profile.periodLength);
  const registeredEnd = addCalendarDays(profile.lastPeriodDate, Math.max(profile.periodLength, 1) - 1);

  return (
    <section className="flex flex-col gap-3 pt-4">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Calendario</button>
      <h1 className="m-0 text-[26px] font-extrabold">Próximos 3 ciclos</h1>
      <p className="m-0 text-sm leading-relaxed text-[#3B4070]">
        Estimación a partir de tu último inicio registrado y de las duraciones de tu perfil. Estas fechas no se guardan.
      </p>

      <section className="rounded-[20px] bg-white p-4">
        <span className="text-xs font-extrabold tracking-wide text-[#4A4F7A]">REGISTRO</span>
        <h2 className="m-0 mt-1 text-base font-extrabold">Último inicio registrado</h2>
        <p className="m-0 mt-2 text-sm text-[#3B4070]">{formatFriendlyDate(profile.lastPeriodDate)}</p>
        <p className="m-0 mt-2 text-sm text-[#3B4070]">
          El término no se guarda aparte. Con una menstruación de {profile.periodLength} días, el último día calculado es {formatFriendlyDate(registeredEnd)}.
        </p>
        <p className="m-0 mt-2 text-sm text-[#3B4070]">Ciclo de {profile.cycleLength} días.</p>
      </section>

      {projections.map((cycle) => (
        <article key={cycle.index} className="rounded-[20px] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-base font-extrabold">Ciclo {cycle.index}</h2>
            <span className="rounded-full bg-[#FFF6CF] px-3 py-1 text-[12px] font-extrabold text-[#1B1F5E]">Estimación</span>
          </div>
          <p className="m-0 mt-3 text-sm text-[#3B4070]"><strong className="text-[#1B1F5E]">Inicio estimado:</strong> {formatFriendlyDate(cycle.periodStart)}</p>
          <p className="m-0 mt-1 text-sm text-[#3B4070]"><strong className="text-[#1B1F5E]">Término estimado:</strong> {formatFriendlyDate(cycle.periodEnd)}</p>
          <p className="m-0 mt-2 text-[13px] text-[#4A4F7A]">{profile.periodLength} días de menstruación · ciclo de {profile.cycleLength} días</p>
        </article>
      ))}
    </section>
  );
}
