import type { Express } from 'express';
import { REQUIRED_PURPOSES } from './src/consentCopy';
import { projectNextCycles } from './src/utils/cycle';
import {
  ConsentError,
  decisionsFromBody,
  readConsentRows,
  requireSession,
  sourceFromBody,
  summarizeConsent,
} from './consentHttp';

function sendConsentError(res: { status: (code: number) => { json: (body: unknown) => void } }, error: unknown) {
  if (error instanceof ConsentError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'No pudimos guardar tu decisión. Inténtalo nuevamente.';
  res.status(500).json({ error: message });
}

export function registerConsentRoutes(app: Express) {
  app.get('/api/consent/status', async (req, res) => {
    try {
      const { client } = await requireSession(req);
      const rows = await readConsentRows(client);
      res.json(summarizeConsent(rows));
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.get('/api/consent/history', async (req, res) => {
    try {
      const { client } = await requireSession(req);
      const rows = await readConsentRows(client);
      res.json({ events: rows });
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.post('/api/consent/decisions', async (req, res) => {
    try {
      const { client } = await requireSession(req);
      const source = sourceFromBody(req.body);
      const decisions = decisionsFromBody(req.body);
      if (source !== 'privacy_settings') {
        const accepted = new Set(decisions.filter((item) => item.action === 'accept').map((item) => item.purpose));
        const missing = REQUIRED_PURPOSES.filter((purpose) => !accepted.has(purpose));
        if (missing.length > 0 && decisions.some((item) => item.action === 'accept')) {
          res.status(400).json({
            error: 'Para continuar con el seguimiento de tu ciclo, completa las casillas obligatorias indicadas. Las opciones adicionales son voluntarias.',
            missing,
          });
          return;
        }
      }
      const { error } = await client.rpc('record_consent_batch', {
        entries: decisions,
        requested_source: source,
      });
      if (error) {
        console.error('[Consentimiento] No se pudo guardar:', error.message);
        res.status(500).json({ error: 'No pudimos guardar tu decisión. Inténtalo nuevamente.' });
        return;
      }
      const rows = await readConsentRows(client);
      res.json(summarizeConsent(rows));
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.post('/api/data-requests', async (req, res) => {
    try {
      const { client, userId } = await requireSession(req);
      const kind = String(req.body?.kind || '');
      const detail = String(req.body?.detail || '').trim().slice(0, 2000);
      if (!['access', 'correction', 'deletion', 'other'].includes(kind)) {
        res.status(400).json({ error: 'El tipo de solicitud no es válido.' });
        return;
      }
      const { error } = await client.from('data_requests').insert({ user_id: userId, kind, detail });
      if (error) {
        console.error('[Datos] No se pudo registrar la solicitud:', error.message);
        res.status(500).json({ error: 'No pudimos guardar tu solicitud. Inténtalo nuevamente.' });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.get('/api/account/export', async (req, res) => {
    try {
      const { client, userId } = await requireSession(req);
      const [profileResult, logsResult, activitiesResult, messagesResult, requestsResult] = await Promise.all([
        client.from('profiles').select('name, age, birth_date, weight, height, email, last_period_date, period_length, cycle_length, contraceptive, is_celiac, has_diabetes, has_obesity, has_depression, cycle_length_source, cycle_reminders, hormonal_method, special_situation, period_length_known, cycle_length_known, perimenopause_mode').eq('id', userId).maybeSingle(),
        client.from('daily_logs').select('date, sleep_quality, fatigue, pain, stress, mood, sleep_details, additional_notes, behavior, ai_analysis, energy, concentration, sleep_state, spotting, symptoms, hot_flash_count, hot_flash_intensity, night_sweat_count, night_sweat_intensity, cervical_fluid, felt_state, energy_feel, headache_level, bloating_level, breast_sensitivity_level, pelvic_cramp_level').eq('user_id', userId),
        client.from('scheduled_activities').select('title, activity_date, start_time, end_time, reminder_minutes, notes, time_zone, sync_status').eq('user_id', userId),
        client.from('messages').select('role, content, timestamp').eq('user_id', userId),
        client.from('data_requests').select('kind, detail, created_at').eq('user_id', userId),
      ]);
      const queryError = profileResult.error || logsResult.error || activitiesResult.error || messagesResult.error || requestsResult.error;
      if (queryError) {
        console.error('[Exportación] No se pudieron leer los datos:', queryError.message);
        res.status(500).json({ error: 'No pudimos preparar tu archivo. Inténtalo nuevamente.' });
        return;
      }
      let focus: { payload: unknown; updated_at: string } | null = null;
      const focusResult = await client.from('focus_entries').select('payload, updated_at').eq('user_id', userId).maybeSingle();
      if (!focusResult.error) focus = focusResult.data;
      else if (!/does not exist|schema cache|could not find the table/i.test(focusResult.error.message)) {
        console.error('[Exportación] No se pudo leer Mi Foco:', focusResult.error.message);
      }
      let periodRows: unknown[] = [];
      const periodResult = await client.from('period_records').select('start_date, end_date, volume, pain').eq('user_id', userId);
      if (!periodResult.error) periodRows = periodResult.data ?? [];
      else if (!/does not exist|schema cache|could not find the table/i.test(periodResult.error.message)) {
        console.error('[Exportación] No se pudieron leer las reglas:', periodResult.error.message);
      }
      const consent = await readConsentRows(client);
      const profile = profileResult.data;
      const generatedAt = new Date().toISOString();
      const cycleLength = Number(profile?.cycle_length);
      const periodLength = Number(profile?.period_length);
      const projections = profile?.last_period_date && Number.isInteger(cycleLength) && Number.isInteger(periodLength) && periodLength < cycleLength
        ? projectNextCycles(profile.last_period_date, cycleLength, periodLength)
        : [];
      const file = {
        formatVersion: 1,
        exportedAt: generatedAt,
        profile: profile ?? null,
        preferences: profile ? {
          cycleLengthSource: profile.cycle_length_source === 'records' ? 'records' : 'manual',
          cycleReminders: Boolean(profile.cycle_reminders),
        } : null,
        dailyLogs: logsResult.data ?? [],
        periodRecords: periodRows,
        activities: activitiesResult.data ?? [],
        messages: messagesResult.data ?? [],
        focus: focus?.payload ?? null,
        consentEvents: consent.map((row) => ({
          purpose: row.purpose,
          action: row.action,
          version: row.policy_version,
          source: row.source,
          createdAt: row.created_at,
        })),
        dataRequests: requestsResult.data ?? [],
        projections: {
          kind: 'estimate',
          generatedAt,
          note: 'Estas fechas no son registros. Se calculan con la referencia guardada del ciclo.',
          cycles: projections,
        },
      };
      const stamp = generatedAt.slice(0, 10);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cyclia-datos-${stamp}.json"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(JSON.stringify(file, null, 2));
    } catch (error) {
      sendConsentError(res, error);
    }
  });
}
