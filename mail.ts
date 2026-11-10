import nodemailer from 'nodemailer';

export function gmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

async function deliver(to: string, subject: string, text: string): Promise<void> {
  const user = process.env.GMAIL_USER || '';
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) {
    throw new Error('Falta GMAIL_USER y GMAIL_APP_PASSWORD en el servidor para enviar el correo.');
  }
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: `Cyclia <${user}>`,
    to,
    subject,
    text,
  });
}

export async function sendConfirmationCode(to: string, code: string): Promise<void> {
  await deliver(to, 'Código para confirmar tu correo en Cyclia', [
    'Hola,',
    '',
    `Tu código de confirmación es: ${code}`,
    '',
    'Escríbelo en Cyclia para terminar de crear la cuenta y seguir con el registro.',
    'El código sirve 15 minutos.',
    'Cyclia no te pedirá este código por otro medio.',
  ].join('\n'));
}

export async function sendProvisionalPassword(to: string, password: string): Promise<void> {
  await deliver(to, 'Tu clave provisoria de Cyclia', [
    'Hola,',
    '',
    `Tu clave provisoria de Cyclia es: ${password}`,
    '',
    'Úsala para entrar. Si pides otra, esta deja de servir.',
    'Cyclia no te pedirá esta clave por otro medio.',
  ].join('\n'));
}
