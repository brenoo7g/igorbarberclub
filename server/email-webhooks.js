import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { Webhook } from 'svix';
import { z } from 'zod';
import { reconcileEmailEvents } from './transactional-email.js';

const types = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
];
const eventSchema = z.object({
  type: z.enum(types),
  created_at: z.iso.datetime({ offset: true }),
  data: z.object({ email_id: z.string().min(1).max(200) }),
});

// Mount BEFORE express.json and browser-origin middleware. No cookie authentication:
// Resend/Svix signature and timestamp verification authenticate the raw body instead.
export function installEmailWebhooks(app, db) {
  app.post(
    '/api/webhooks/resend',
    rateLimit({ windowMs: 60000, limit: 300, validate: false }),
    express.raw({ type: 'application/json', limit: '32kb' }),
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!process.env.RESEND_WEBHOOK_SECRET)
        return res.status(503).json({ error: 'Webhook indisponível.' });
      let event;
      const id = req.get('svix-id');
      try {
        if (!Buffer.isBuffer(req.body) || !id || id.length > 200)
          throw new Error('Invalid envelope');
        new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(req.body.toString('utf8'), {
          'svix-id': id,
          'svix-timestamp': req.get('svix-timestamp'),
          'svix-signature': req.get('svix-signature'),
        });
        event = JSON.parse(req.body.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'Assinatura inválida.' });
      }
      // Other valid provider events are acknowledged, without persisting private payloads.
      if (!types.includes(event?.type)) return res.sendStatus(204);
      const parsed = eventSchema.safeParse(event);
      if (!parsed.success) return res.status(400).json({ error: 'Evento inválido.' });
      await db.transaction(async (tx) => {
        const providerId = parsed.data.data.email_id;
        if (tx.dialect === 'postgres')
          await tx.run('SELECT pg_advisory_xact_lock(hashtext(?))', [providerId]);
        await tx.run(
          'INSERT INTO email_webhook_events(id,provider_message_id,event_type,occurred_at,received_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
          [
            id,
            providerId,
            event.type,
            new Date(event.created_at).toISOString(),
            new Date().toISOString(),
          ],
        );
        await reconcileEmailEvents(tx, providerId);
      });
      res.sendStatus(204);
    },
  );
}
