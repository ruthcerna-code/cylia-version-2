import type { CareSuggestion } from '../utils/care';

function Bar({ label, value, color }: { label: string; value: number | null; color: string }) {
  const width = value == null ? 0 : Math.max(8, (value / 5) * 100);
  return (
    <div className="grid grid-cols-[92px_1fr_28px] items-center gap-2">
      <span className="text-[13px] font-extrabold text-[#1B1F5E]">{label}</span>
      <span className="h-3 overflow-hidden rounded-full bg-[#E7EAF8]">
        <span className="block h-3 rounded-full" style={{ width: `${width}%`, background: color }} />
      </span>
      <span className="text-right text-[13px] font-extrabold text-[#1B1F5E]">{value ?? '—'}</span>
    </div>
  );
}

export default function DayMatch({ care }: { care: CareSuggestion }) {
  return (
    <section className="rounded-[20px] bg-white p-4">
      <h2 className="m-0 text-base font-extrabold">Cómo vas frente a la propuesta</h2>
      <p className="m-0 mt-1 text-sm font-extrabold text-[#1B1F5E]">{care.headline}</p>
      <div className="mt-3 flex flex-col gap-2" aria-label="Energía registrada y propuesta de la fase">
        <Bar label="Tu registro" value={care.yours} color="#F49A9E" />
        <Bar label="Propuesta" value={care.proposed} color="#3A44C4" />
      </div>
      <p className="m-0 mt-2 text-[13px] leading-relaxed text-[#3B4070]">{care.detail}</p>
      {care.condition && <p className="m-0 mt-2 text-[13px] leading-relaxed text-[#3B4070]">{care.condition}</p>}
      <h3 className="m-0 mt-4 text-sm font-extrabold">3 nutrientes</h3>
      <ol className="m-0 mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[#3B4070]">
        {care.foods.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <h3 className="m-0 mt-4 text-sm font-extrabold">3 ejercicios</h3>
      <ol className="m-0 mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-[#3B4070]">
        {care.exercises.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <p className="m-0 mt-3 text-[12px] leading-relaxed text-[#4A4F7A]">Las sugerencias aprenden de ti; no reemplazan consejo médico.</p>
    </section>
  );
}
