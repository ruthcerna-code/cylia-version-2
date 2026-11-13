import React, { useEffect, useState } from 'react';
import { createManagedAccount, deleteManagedAccount, listManagedAccounts, type ManagedAccount } from '../accountApi';

export default function UserAdminScreen({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<ManagedAccount[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const body = await listManagedAccounts();
    setUsers(body.users);
  };

  useEffect(() => {
    void reload().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'No se pudieron leer las cuentas.');
    });
  }, []);

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createManagedAccount(username, password);
      setUsername('');
      setPassword('');
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo crear la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (account: ManagedAccount) => {
    if (!window.confirm(`¿Eliminar la cuenta ${account.username}? Ya no podrá entrar.`)) return;
    setError('');
    setBusy(true);
    try {
      await deleteManagedAccount(account.id);
      await reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-2">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-[15px] font-extrabold text-[#3A44C4]">← Perfil</button>
      <span className="text-xs font-extrabold tracking-wider text-[#4A4F7A]">ADMINISTRACIÓN</span>
      <h1 className="m-0 font-serif text-[34px] font-normal text-[#3A44C4]">Cuentas</h1>
      <p className="m-0 text-sm text-[#4A4F7A]">Crea los usuarios que entran con usuario y contraseña. El modo anónimo sigue disponible sin una de estas cuentas.</p>
      {error && <p className="m-0 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      <form onSubmit={createUser} className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="m-0 text-base font-extrabold">Nueva cuenta</h2>
        <input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={40} autoComplete="off" placeholder="Usuario" className="rounded-2xl border-2 border-[#C9D3EF] px-4 py-3 text-base outline-none" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={4} maxLength={72} autoComplete="new-password" placeholder="Contraseña" className="rounded-2xl border-2 border-[#C9D3EF] px-4 py-3 text-base outline-none" />
        <button type="submit" disabled={busy} className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-[#F49A9E] text-[15px] font-extrabold text-[#1B1F5E] disabled:opacity-60">
          {busy ? 'Guardando…' : 'Crear usuario'}
        </button>
      </form>
      <section className="flex flex-col gap-2">
        {users.map((account) => (
          <article key={account.id} className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3.5">
            <span className="flex-1">
              <strong className="block text-[15px]">{account.username}</strong>
              <span className="text-[13px] text-[#4A4F7A]">{account.role === 'admin' ? 'Administración' : 'Usuario'}</span>
            </span>
            {account.role !== 'admin' && (
              <button type="button" disabled={busy} onClick={() => { void removeUser(account); }} className="cursor-pointer text-sm font-extrabold text-[#3A44C4] disabled:opacity-60">
                Eliminar
              </button>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
