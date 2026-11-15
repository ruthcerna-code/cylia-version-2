import { openEmailAccount, prepareEmailAccount, sendPasswordReset } from './firebase';

// Las cuentas viven en Firebase Authentication. La administración de cuentas se hace en la consola de Firebase.

export type PendingEntry = {
  created: boolean;
  remember: boolean;
  email: string;
  password: string;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw new Error('Ingresa tu correo. La cuenta de Cyclia es tu correo.');
  }
}

export async function beginEntry(username: string, password: string, remember: boolean): Promise<PendingEntry> {
  const email = normalizeEmail(username);
  assertEmail(email);
  const created = await prepareEmailAccount(email, password);
  return { created, remember, email, password };
}

export async function finishAccountSession(pending: PendingEntry): Promise<void> {
  await openEmailAccount(pending.email, pending.password, pending.remember);
}

export async function requestPasswordReset(username: string): Promise<string> {
  const email = normalizeEmail(username);
  assertEmail(email);
  await sendPasswordReset(email);
  return 'Si ese correo tiene una cuenta, te llegará un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.';
}
