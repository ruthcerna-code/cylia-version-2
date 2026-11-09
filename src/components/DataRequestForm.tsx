import { useState } from 'react';
import { submitDataRequest } from '../consentApi';

export default function DataRequestForm() {
  const [kind, setKind] = useState<'access' | 'correction' | 'deletion' | 'other'>('access');
  const [detail, setDetail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    setError('');
    setMessage('');
    try {
      await submitDataRequest(kind, detail);
      setDetail('');
      setMessage('Registramos tu solicitud. Enviarla no borra la cuenta ni el historial. La forma de responder todavía está pendiente de definición.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar tu solicitud. Inténtalo nuevamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="flex flex-col gap-3 rounded-[20px] bg-white p-4" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <h2 className="m-0 text-base font-extrabold">Solicitar acceso, corrección o eliminación</h2>
      <label className="flex flex-col gap-1 text-sm font-extrabold" htmlFor="data-request-kind">
        Tipo de solicitud
        <select id="data-request-kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-12 rounded-2xl border-2 border-[#C9D3EF] bg-white px-3 font-semibold">
          <option value="access">Acceso</option>
          <option value="correction">Corrección</option>
          <option value="deletion">Eliminación</option>
          <option value="other">Otra solicitud</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-extrabold" htmlFor="data-request-detail">
        Detalle
        <textarea id="data-request-detail" value={detail} onChange={(event) => setDetail(event.target.value)} rows={3} maxLength={2000} className="rounded-2xl border-2 border-[#C9D3EF] px-3 py-2 font-semibold" />
      </label>
      {error && <p className="m-0 text-sm font-bold text-[#9C3B45]" role="alert">{error}</p>}
      {message && <p className="m-0 text-sm" role="status">{message}</p>}
      <button type="submit" disabled={sending} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F6E27F] text-sm font-extrabold text-[#1B1F5E] disabled:opacity-60">
        {sending ? 'Enviando…' : 'Enviar solicitud'}
      </button>
    </form>
  );
}
