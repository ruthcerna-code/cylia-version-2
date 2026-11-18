/** Botones con las horas de inicio que caben en el día, sin cruzar otra actividad. */
export default function AvailableStarts({
  starts,
  value,
  onChange,
}: {
  starts: string[];
  value: string;
  onChange: (start: string) => void;
}) {
  if (starts.length === 0) {
    return (
      <p className="m-0 rounded-2xl bg-[#FFF6D8] px-3 py-3 text-sm text-[#6E4E10]" role="status">
        Este día no tiene un hueco libre para esa duración. Elige otro día.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-sm font-semibold text-[#153E40]">Horas de inicio disponibles</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Horas de inicio disponibles">
        {starts.map((slot) => {
          const on = value === slot;
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(slot)}
              className="h-11 min-w-[4.5rem] cursor-pointer rounded-full px-3 text-sm font-semibold text-[#153E40]"
              style={{ background: on ? '#FF8243' : '#FFF8EE', boxShadow: on ? 'inset 0 0 0 2px #153E40' : 'inset 0 0 0 1.5px #E7D3C6' }}
            >
              {slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}
