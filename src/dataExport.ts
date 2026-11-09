import { supabaseBearer } from './consentApi';

export async function downloadOwnData(): Promise<void> {
  const token = await supabaseBearer();
  const response = await fetch('/api/account/export', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = 'No pudimos preparar tu archivo. Inténtalo nuevamente.';
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // The server did not return JSON.
    }
    throw new Error(message);
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cyclia-datos-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
