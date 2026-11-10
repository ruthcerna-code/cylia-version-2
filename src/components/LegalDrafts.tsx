import { useState } from 'react';
import { rememberPrivacyAcceptance } from '../consentCopy';

export function DraftBanner() {
  return (
    <p className="m-0 rounded-[16px] bg-[#FFF6CF] p-3 text-sm leading-relaxed text-[#1B1F5E]" role="note">
      Borrador en revisión. No es un documento publicado ni acredita cumplimiento de la Ley N.º 19.628 ni de la Ley N.º 21.719. La aplicación de las reglas especiales sobre datos de salud, en particular los artículos 16 y 16 bis del régimen reformado, queda pendiente de revisión jurídica.
    </p>
  );
}

const SUMMARY = [
  {
    title: 'Qué se guarda',
    points: ['Tu cuenta y el perfil de ciclo que tú escribes.', 'Registros de sueño, ánimo, dolor y notas.', 'Actividades que agendas, en la base de Cyclia.', 'La decisión de esta política, sin guardar tu dirección IP.'],
  },
  {
    title: 'Para qué',
    points: ['Mostrar tu ciclo y las estimaciones del calendario.', 'El asistente solo si lo autorizas aparte.', 'No hay publicidad ni uso para entrenar modelos.'],
  },
  {
    title: 'Dónde queda',
    points: ['En la base del proyecto, ligada a tu sesión.', 'Cada cuenta lee solo sus filas.', 'Las actividades no se envían a otro calendario.'],
  },
  {
    title: 'Qué puedes hacer',
    points: ['Leer esta política antes de entrar.', 'Exportar tus datos y pedir acceso, corrección o eliminación.', 'Retirar permisos desde Privacidad y datos.'],
  },
];

export function PrivacySummary({ tone = 'app' }: { tone?: 'app' | 'auth' }) {
  const card = tone === 'auth'
    ? { background: 'var(--card)', color: 'var(--emeraude)', border: '1px solid var(--line)' }
    : { background: '#FFFFFF', color: '#1B1F5E' };
  const muted = tone === 'auth' ? 'var(--emeraude-deep)' : '#3B4070';
  return (
    <div className="grid grid-cols-1 gap-3">
      {SUMMARY.map((item) => (
        <section key={item.title} className="rounded-[20px] p-4" style={card}>
          <h2 className="m-0 text-base font-extrabold">{item.title}</h2>
          <ul className="mb-0 mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed" style={{ color: muted }}>
            {item.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PrivacyDetails() {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-[#1B1F5E]">
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Detalle de los datos</h2>
        <ul className="mb-0 mt-2 list-disc space-y-1 pl-4">
          <li>Cuenta: sesión anónima o usuario creado por la administración.</li>
          <li>Perfil: nombre, edad, nacimiento, peso, estatura, correo opcional, inicio del último periodo, duración del ciclo y del periodo, anticonceptivo y condiciones marcadas.</li>
          <li>Registros diarios y, si autorizas el asistente, los mensajes del chat.</li>
          <li>Actividades: título, fecha, horario y notas. Se guardan en la base de Cyclia.</li>
        </ul>
      </section>
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Servicios</h2>
        <ul className="mb-0 mt-2 list-disc space-y-1 pl-4">
          <li>Supabase guarda el acceso y los datos. Cada sesión lee sus propias filas.</li>
          <li>El servidor de Cyclia atiende al asistente. La clave de Gemini permanece en el servidor y solo se usa si autorizas esa opción.</li>
          <li>No hay una herramienta de analítica de audiencia en esta aplicación.</li>
        </ul>
      </section>
      <section className="rounded-[20px] bg-[#FFF6CF] p-4">
        <h2 className="m-0 text-base font-extrabold">Todavía en revisión</h2>
        <ul className="mb-0 mt-2 list-disc space-y-1 pl-4">
          <li>Identidad, domicilio y correo de privacidad del responsable.</li>
          <li>Países donde se tratan los datos, plazos de conservación y el procedimiento de solicitudes.</li>
          <li>Medidas de seguridad, edad y las reglas especiales de datos de salud.</li>
        </ul>
      </section>
      <p className="m-0">Las contraseñas de administración se guardan cifradas en el servidor. Eso no afirma que la información esté fuera del alcance de los proveedores ni que el sistema sea invulnerable.</p>
    </div>
  );
}

export function PrivacyDraft() {
  return (
    <article className="flex flex-col gap-3 text-sm leading-relaxed text-[#1B1F5E]">
      <DraftBanner />
      <h1 className="m-0 text-[26px] font-extrabold">Política de privacidad</h1>
      <p className="m-0">Este texto describe lo que la aplicación hace hoy. La revisión jurídica todavía no está cerrada.</p>
      <PrivacySummary />
      <PrivacyDetails />
    </article>
  );
}

export function PrivacyAcceptance({
  checked,
  error,
  onChange,
}: {
  checked: boolean;
  error: string;
  onChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="privacy-login-title">
      <label className="flex items-start gap-3 rounded-[20px] p-4 text-sm leading-relaxed" style={{ background: 'var(--menthe)', color: 'var(--emeraude)' }}>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0"
          checked={checked}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            const value = event.target.checked;
            rememberPrivacyAcceptance(value);
            onChange(value);
          }}
        />
        <span id="privacy-login-title">
          He leído la{' '}
          <button
            type="button"
            className="cursor-pointer font-bold underline"
            style={{ color: 'var(--emeraude)' }}
            aria-expanded={open}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setOpen((current) => !current);
            }}
          >
            Política de privacidad
          </button>
          .
        </span>
      </label>
      {open && <PrivacyDraft />}
      {error && <p className="m-0 text-sm font-semibold text-red-700" role="alert">{error}</p>}
    </section>
  );
}

export function TermsDraft() {
  return (
    <article className="flex flex-col gap-3 text-sm leading-relaxed text-[#1B1F5E]">
      <DraftBanner />
      <h1 className="m-0 text-[26px] font-extrabold">Términos de uso (borrador)</h1>
      <section className="rounded-[20px] bg-white p-4">
        <p className="m-0">Cyclia es una aplicación educativa de bienestar. Calcula una estimación del ciclo a partir de los datos que registra la persona. No diagnostica, no receta y no reemplaza a un profesional de salud.</p>
        <p className="mb-0 mt-2">La cuenta puede ser anónima o un usuario creado por la administración. Las funciones de salud permanecen cerradas hasta que se registren las decisiones obligatorias de la versión vigente.</p>
        <p className="mb-0 mt-2">Rechazar el asistente no quita el seguimiento del ciclo. Las actividades quedan en la base de Cyclia. Retirar la autorización de salud cierra ese seguimiento y no borra por sí solo el historial.</p>
      </section>
      <section className="rounded-[20px] bg-[#FFF6CF] p-4">
        <h2 className="m-0 text-base font-extrabold">Pendiente de completar antes de publicar</h2>
        <ul className="mb-0 mt-2 list-disc space-y-1 pl-4">
          <li>[PENDIENTE: identidad de quien ofrece el servicio]</li>
          <li>[PENDIENTE: ley aplicable, domicilio y contacto]</li>
          <li>[PENDIENTE: reglas de edad y representación]</li>
        </ul>
      </section>
    </article>
  );
}
