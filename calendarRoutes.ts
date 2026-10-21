import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'email',
].join(' ');

type OAuthState = { jwt: string; expires: number };
const oauthStates = new Map<string, OAuthState>();

type ConnectionRow = {
  user_id: string;
  google_email: string;
  calendar_id: string | null;
  calendar_name: string | null;
  refresh_token: string;
  last_sync_at: string | null;
};

type ActivityRow = {
  id: string;
  title: string;
  activity_date: string;
  start_time: string;
  end_time: string;
  reminder_minutes: number | null;
  notes: string | null;
  time_zone: string;
  sync_status: 'pending' | 'synced' | 'changed' | 'error' | 'delete_pending';
  google_event_id: string | null;
  google_calendar_id: string | null;
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function calendarCredentials() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

function publicOrigin(req: Request): string {
  const host = req.get('host') || 'localhost:3001';
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || req.protocol || 'http';
  return `${proto}://${host}`;
}

function redirectUri(req: Request): string {
  return `${publicOrigin(req)}/api/calendar/callback`;
}

function userClient(jwt: string): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) throw new HttpError(500, 'Supabase no está configurado en el servidor.');
  return createClient(url, key, {
    accessToken: async () => jwt,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function requireUser(req: Request) {
  const header = req.headers.authorization || '';
  const jwt = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!jwt) throw new HttpError(401, 'Inicia sesión para continuar.');
  const client = userClient(jwt);
  const { data, error } = await client.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'La sesión no es válida. Vuelve a entrar.');
  return { client, userId: data.user.id, jwt };
}

function encryptionKey(): Buffer {
  const secret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptToken(stored: string): string {
  if (!stored.startsWith('v1:')) throw new HttpError(409, 'La conexión con Google Calendar ya no es válida. Vuelve a conectarla.');
  const buffer = Buffer.from(stored.slice(3), 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function pruneStates() {
  const now = Date.now();
  for (const [key, value] of oauthStates) {
    if (value.expires <= now) oauthStates.delete(key);
  }
}

async function googleToken(body: URLSearchParams) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error_description || payload?.error || 'Google no aceptó la autorización.';
    throw new HttpError(502, String(message).slice(0, 180));
  }
  return payload as { access_token?: string; refresh_token?: string; expires_in?: number };
}

async function googleFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (response.status === 204) return { status: response.status, body: null };
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Google respondió ${response.status}`;
    const error = new HttpError(response.status, String(message).slice(0, 240));
    throw error;
  }
  return { status: response.status, body: payload };
}

async function accessTokenFor(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = calendarCredentials();
  const payload = await googleToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }));
  if (!payload.access_token) throw new HttpError(502, 'Google no entregó un acceso válido. Vuelve a conectar el calendario.');
  return payload.access_token;
}

async function listWritableCalendars(token: string): Promise<{ id: string; name: string; primary: boolean }[]> {
  const { body } = await googleFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer', token);
  const items = Array.isArray(body?.items) ? body.items : [];
  return items
    .filter((item: { id?: string }) => Boolean(item?.id))
    .map((item: { id: string; summary?: string; primary?: boolean }) => ({
      id: item.id,
      name: item.summary || item.id,
      primary: Boolean(item.primary),
    }));
}

function clock(value: string): string {
  const [hours = '00', minutes = '00', seconds = '00'] = value.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}`.slice(0, 8);
}

function eventBody(activity: ActivityRow) {
  const reminder = activity.reminder_minutes;
  const reminders = reminder == null
    ? { useDefault: false, overrides: [] }
    : { useDefault: false, overrides: [{ method: 'popup', minutes: Math.min(Math.max(reminder, 0), 40320) }] };
  return {
    summary: activity.title,
    description: (activity.notes || '').trim(),
    start: {
      dateTime: `${activity.activity_date}T${clock(activity.start_time)}`,
      timeZone: activity.time_zone || 'UTC',
    },
    end: {
      dateTime: `${activity.activity_date}T${clock(activity.end_time)}`,
      timeZone: activity.time_zone || 'UTC',
    },
    reminders,
  };
}

function sendError(res: Response, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : 'No se pudo completar la acción.';
  res.status(status).json({ error: message });
}

export function registerCalendarRoutes(app: Express) {
  app.get('/api/calendar/status', async (req, res) => {
    try {
      const { configured } = calendarCredentials();
      if (!configured) {
        res.json({
          configured: false,
          connected: false,
          email: null,
          calendarId: null,
          calendarName: null,
          lastSyncAt: null,
          calendars: [],
          warning: null,
        });
        return;
      }
      const { client, userId } = await requireUser(req);
      const { data, error } = await client
        .from('calendar_connections')
        .select('user_id, google_email, calendar_id, calendar_name, refresh_token, last_sync_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new HttpError(500, 'No se pudo leer la conexión con Google Calendar.');
      if (!data) {
        res.json({
          configured: true,
          connected: false,
          email: null,
          calendarId: null,
          calendarName: null,
          lastSyncAt: null,
          calendars: [],
          warning: null,
        });
        return;
      }
      const connection = data as ConnectionRow;
      let calendars: { id: string; name: string }[] = [];
      let warning: string | null = null;
      try {
        const token = await accessTokenFor(decryptToken(connection.refresh_token));
        calendars = (await listWritableCalendars(token)).map((item) => ({ id: item.id, name: item.name }));
      } catch (error) {
        warning = error instanceof Error ? error.message : 'No se pudieron leer los calendarios.';
      }
      res.json({
        configured: true,
        connected: true,
        email: connection.google_email || null,
        calendarId: connection.calendar_id,
        calendarName: connection.calendar_name,
        lastSyncAt: connection.last_sync_at,
        calendars,
        warning,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/calendar/connect', async (req, res) => {
    try {
      const { clientId, configured } = calendarCredentials();
      const uri = redirectUri(req);
      if (!configured) {
        throw new HttpError(503, `Google Calendar todavía no está configurado en el servidor. Puedes guardar actividades en Cyclia igual. Autoriza la redirección ${uri}.`);
      }
      const { jwt } = await requireUser(req);
      pruneStates();
      const state = crypto.randomBytes(24).toString('hex');
      oauthStates.set(state, { jwt, expires: Date.now() + 10 * 60 * 1000 });
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', uri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', SCOPES);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('include_granted_scopes', 'false');
      url.searchParams.set('state', state);
      res.json({ url: url.toString() });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get('/api/calendar/callback', async (req, res) => {
    const origin = publicOrigin(req);
    const fail = (message: string) => {
      res.redirect(`${origin}/?calendar=error&reason=${encodeURIComponent(message.slice(0, 180))}`);
    };
    try {
      const { clientId, clientSecret, configured } = calendarCredentials();
      if (!configured) {
        fail('Google Calendar no está configurado en el servidor.');
        return;
      }
      const code = String(req.query.code || '');
      const state = String(req.query.state || '');
      const stored = oauthStates.get(state);
      oauthStates.delete(state);
      if (!stored || stored.expires < Date.now() || !code) {
        fail('La autorización venció. Vuelve a conectar Google Calendar.');
        return;
      }
      const uri = redirectUri(req);
      const payload = await googleToken(new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: uri,
        grant_type: 'authorization_code',
      }));
      const client = userClient(stored.jwt);
      const { data: userData, error: userError } = await client.auth.getUser(stored.jwt);
      if (userError || !userData.user || !payload.access_token) {
        fail('No se pudo confirmar tu sesión al volver de Google.');
        return;
      }
      const existing = await client
        .from('calendar_connections')
        .select('refresh_token, calendar_id, calendar_name, last_sync_at')
        .eq('user_id', userData.user.id)
        .maybeSingle();
      let refreshToken = payload.refresh_token || '';
      if (!refreshToken && existing.data?.refresh_token) {
        try {
          refreshToken = decryptToken(existing.data.refresh_token);
        } catch {
          refreshToken = '';
        }
      }
      if (!refreshToken) {
        fail('Google no entregó un permiso duradero. Vuelve a conectar y acepta el acceso al calendario.');
        return;
      }
      const info = await googleFetch('https://www.googleapis.com/oauth2/v2/userinfo', payload.access_token);
      const calendars = await listWritableCalendars(payload.access_token);
      const previousId = existing.data?.calendar_id as string | undefined;
      const chosen = calendars.find((item) => item.id === previousId) || calendars.find((item) => item.primary) || calendars[0];
      const { error } = await client.from('calendar_connections').upsert({
        user_id: userData.user.id,
        google_email: info.body?.email || '',
        calendar_id: chosen?.id || 'primary',
        calendar_name: chosen?.name || 'Calendario principal',
        refresh_token: encryptToken(refreshToken),
        last_sync_at: existing.data?.last_sync_at || null,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        fail('No se pudo guardar la conexión del calendario.');
        return;
      }
      res.redirect(`${origin}/?calendar=connected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar Google Calendar.';
      fail(message);
    }
  });

  app.post('/api/calendar/select', async (req, res) => {
    try {
      const { client, userId } = await requireUser(req);
      const calendarId = String(req.body?.calendarId || '');
      const calendarName = String(req.body?.calendarName || '');
      if (!calendarId) throw new HttpError(400, 'Elige un calendario de destino.');
      const { error } = await client
        .from('calendar_connections')
        .update({ calendar_id: calendarId, calendar_name: calendarName || calendarId, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw new HttpError(500, 'No se pudo guardar el calendario elegido.');
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/calendar/disconnect', async (req, res) => {
    try {
      const { client, userId } = await requireUser(req);
      const { error } = await client.from('calendar_connections').delete().eq('user_id', userId);
      if (error) throw new HttpError(500, 'No se pudo desconectar Google Calendar.');
      res.json({ ok: true });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post('/api/calendar/sync', async (req, res) => {
    try {
      const { configured } = calendarCredentials();
      if (!configured) throw new HttpError(503, 'Google Calendar no está configurado en el servidor.');
      const { client, userId } = await requireUser(req);
      const connectionResult = await client
        .from('calendar_connections')
        .select('user_id, google_email, calendar_id, calendar_name, refresh_token, last_sync_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (connectionResult.error || !connectionResult.data) {
        throw new HttpError(409, 'Conecta Google Calendar antes de sincronizar.');
      }
      const connection = connectionResult.data as ConnectionRow;
      if (!connection.calendar_id) throw new HttpError(400, 'Elige el calendario de destino.');
      const token = await accessTokenFor(decryptToken(connection.refresh_token));
      const activitiesResult = await client
        .from('scheduled_activities')
        .select('id, title, activity_date, start_time, end_time, reminder_minutes, notes, time_zone, sync_status, google_event_id, google_calendar_id')
        .eq('user_id', userId)
        .in('sync_status', ['pending', 'changed', 'error', 'delete_pending']);
      if (activitiesResult.error) throw new HttpError(500, 'No se pudieron leer las actividades para sincronizar.');
      const activities = (activitiesResult.data || []) as ActivityRow[];

      let created = 0;
      let updated = 0;
      let deleted = 0;
      const failed: { title: string; error: string }[] = [];

      for (const activity of activities) {
        let preservedEventId = activity.google_event_id;
        let preservedCalendarId = activity.google_calendar_id;
        try {
          if (activity.sync_status === 'delete_pending') {
            if (activity.google_event_id) {
              const calendarId = activity.google_calendar_id || connection.calendar_id;
              try {
                await googleFetch(
                  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(activity.google_event_id)}`,
                  token,
                  { method: 'DELETE' },
                );
              } catch (error) {
                const status = error instanceof HttpError ? error.status : 0;
                if (status !== 404 && status !== 410) throw error;
              }
            }
            const removal = await client.from('scheduled_activities').delete().eq('user_id', userId).eq('id', activity.id);
            if (removal.error) throw new HttpError(500, 'Google eliminó el evento, pero no se pudo cerrar el registro en Cyclia.');
            deleted += 1;
            continue;
          }

          const destination = activity.google_event_id
            ? (activity.google_calendar_id || connection.calendar_id)
            : connection.calendar_id;
          const payload = JSON.stringify(eventBody(activity));
          if (!activity.google_event_id) {
            const createdEvent = await googleFetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(destination)}/events`,
              token,
              { method: 'POST', body: payload },
            );
            const eventId = createdEvent.body?.id;
            if (!eventId) throw new HttpError(502, 'Google no confirmó el evento.');
            preservedEventId = eventId;
            preservedCalendarId = destination;
            const save = await client.from('scheduled_activities').update({
              sync_status: 'synced',
              google_event_id: eventId,
              google_calendar_id: destination,
              sync_error: null,
              updated_at: new Date().toISOString(),
            }).eq('user_id', userId).eq('id', activity.id);
            if (save.error) throw new HttpError(500, 'El evento se creó en Google, pero no se pudo guardar su identificador.');
            created += 1;
            continue;
          }

          let eventId = activity.google_event_id;
          let calendarId = destination;
          try {
            await googleFetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
              token,
              { method: 'PATCH', body: payload },
            );
          } catch (error) {
            const status = error instanceof HttpError ? error.status : 0;
            if (status !== 404 && status !== 410) throw error;
            const replacement = await googleFetch(
              `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events`,
              token,
              { method: 'POST', body: payload },
            );
            if (!replacement.body?.id) throw new HttpError(502, 'Google no confirmó el evento actualizado.');
            eventId = replacement.body.id;
            calendarId = connection.calendar_id;
            preservedEventId = eventId;
            preservedCalendarId = calendarId;
          }
          const save = await client.from('scheduled_activities').update({
            sync_status: 'synced',
            google_event_id: eventId,
            google_calendar_id: calendarId,
            sync_error: null,
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId).eq('id', activity.id);
          if (save.error) throw new HttpError(500, 'Google actualizó el evento, pero no se pudo guardar el resultado en Cyclia.');
          updated += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'No se pudo sincronizar.';
          failed.push({ title: activity.title, error: message });
          await client.from('scheduled_activities').update({
            sync_status: activity.sync_status === 'delete_pending' ? 'delete_pending' : 'error',
            google_event_id: preservedEventId,
            google_calendar_id: preservedCalendarId,
            sync_error: message.slice(0, 240),
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId).eq('id', activity.id);
        }
      }

      if (failed.length === 0) {
        await client.from('calendar_connections').update({
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('user_id', userId);
      }

      res.json({ created, updated, deleted, failed });
    } catch (error) {
      sendError(res, error);
    }
  });
}
