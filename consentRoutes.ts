import type { Express } from 'express';
import { REQUIRED_PURPOSES } from './src/consentCopy.js';
import { projectNextCycles } from './src/utils/cycle.js';
import {
  ConsentError,
  decisionsFromBody,
  readConsentRows,
  readExportBundle,
  requireSession,
  sourceFromBody,
  summarizeConsent,
  writeConsent,
  writeDataRequest,
} from './consentHttp.js';

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
      const { jwt, userId } = await requireSession(req);
      const rows = await readConsentRows(jwt, userId);
      res.json(summarizeConsent(rows));
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.get('/api/consent/history', async (req, res) => {
    try {
      const { jwt, userId } = await requireSession(req);
      const rows = await readConsentRows(jwt, userId);
      res.json({ events: rows });
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.post('/api/consent/decisions', async (req, res) => {
    try {
      const { jwt, userId } = await requireSession(req);
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
      for (const decision of decisions) {
        if (decision.purpose === 'google_calendar') continue;
        await writeConsent(jwt, userId, decision.purpose, decision.action, source);
      }
      const rows = await readConsentRows(jwt, userId);
      res.json(summarizeConsent(rows));
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.post('/api/data-requests', async (req, res) => {
    try {
      const { jwt, userId } = await requireSession(req);
      const kind = String(req.body?.kind || '');
      const detail = String(req.body?.detail || '').trim().slice(0, 2000);
      if (!['access', 'correction', 'deletion', 'other'].includes(kind)) {
        res.status(400).json({ error: 'El tipo de solicitud no es válido.' });
        return;
      }
      await writeDataRequest(jwt, userId, kind, detail);
      res.json({ ok: true });
    } catch (error) {
      sendConsentError(res, error);
    }
  });

  app.get('/api/account/export', async (req, res) => {
    try {
      const { jwt, userId } = await requireSession(req);
      const bundle = await readExportBundle(jwt, userId);
      const consent = await readConsentRows(jwt, userId);
      const profile = bundle.profile;
      const generatedAt = new Date().toISOString();
      const cycleLength = Number(profile?.cycleLength);
      const periodLength = Number(profile?.periodLength);
      const lastPeriod = typeof profile?.lastPeriodDate === 'string' ? profile.lastPeriodDate : '';
      const projections = lastPeriod && Number.isInteger(cycleLength) && Number.isInteger(periodLength) && periodLength < cycleLength
        ? projectNextCycles(lastPeriod, cycleLength, periodLength)
        : [];
      const file = {
        formatVersion: 1,
        exportedAt: generatedAt,
        profile: profile ?? null,
        preferences: profile ? {
          cycleLengthSource: profile.lengthSource === 'records' ? 'records' : 'manual',
          cycleReminders: Boolean(profile.cycleReminders),
        } : null,
        dailyLogs: bundle.dailyLogs,
        periodRecords: bundle.periodRecords,
        activities: bundle.activities,
        messages: bundle.messages,
        focus: bundle.focus,
        consentEvents: consent.map((row) => ({
          purpose: row.purpose,
          action: row.action,
          version: row.policy_version,
          source: row.source,
          createdAt: row.created_at,
        })),
        dataRequests: bundle.dataRequests,
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
