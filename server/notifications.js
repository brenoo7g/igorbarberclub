import { randomUUID } from 'node:crypto';
import { clock } from './domain.js';

export async function enqueueNotification(db, appointmentId, event) {
  const appointment = await db.get(
    'SELECT a.*,u.name,u.email,u.phone FROM appointments a JOIN users u ON u.id=a.user_id WHERE a.id=?',
    [appointmentId],
  );
  const services = await db.all('SELECT name FROM appointment_services WHERE appointment_id=?', [
    appointmentId,
  ]);
  const payload = JSON.stringify({
    name: appointment.name,
    email: appointment.email,
    phone: appointment.phone,
    date: appointment.date,
    time: clock(appointment.start_minute),
    services: services.map((s) => s.name).join(', '),
  });
  for (const channel of ['email', 'whatsapp']) {
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO notifications (id,appointment_id,channel,event,payload,created_at,next_attempt_at) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), appointmentId, channel, event, payload, now, now],
    );
  }
}

export function createNotificationProcessor(db, { batchSize = 20 } = {}) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const channels = [];
      if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) channels.push('email');
      if (
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM &&
        process.env.TWILIO_CONTENT_SID
      )
        channels.push('whatsapp');
      if (!channels.length) return;
      const rows = await db.transaction(async (tx) => {
        // Advisory transaction lock also coordinates independent PostgreSQL workers.
        if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789125)');
        const jobs = await tx.all(
          `SELECT * FROM notifications WHERE status='pending' AND attempts<5 AND next_attempt_at<=? AND channel IN (${channels.map(() => '?').join(',')}) ORDER BY created_at LIMIT ?`,
          [new Date().toISOString(), ...channels, batchSize],
        );
        for (const job of jobs)
          await tx.run("UPDATE notifications SET status='sending',attempts=attempts+1 WHERE id=?", [
            job.id,
          ]);
        return jobs;
      });
      for (const row of rows) {
        try {
          const p = JSON.parse(row.payload);
          const event =
            { confirmed: 'confirmado', cancelled: 'cancelado', rescheduled: 'remarcado' }[
              row.event
            ] || row.event;
          const url = `${process.env.APP_URL || 'http://localhost:5173'}/minha-conta`;
          const text = `Olá, ${p.name}! Seu agendamento na Igor Barber Club foi ${event}.\n${p.services}\n${p.date.split('-').reverse().join('/')} às ${p.time}.\nPara consultar, cancelar ou remarcar, acesse sua conta: ${url}`;
          let response;
          if (row.channel === 'email') {
            response = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              signal: AbortSignal.timeout(15000),
              headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': row.id,
              },
              body: JSON.stringify({
                from: process.env.EMAIL_FROM,
                to: [p.email],
                subject: `Agendamento ${event} — Igor Barber Club`,
                text,
              }),
            });
          } else {
            const phone = p.phone.replace(/\D/g, '');
            const to = phone.length <= 11 ? `55${phone}` : phone;
            response = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
              {
                method: 'POST',
                signal: AbortSignal.timeout(15000),
                headers: {
                  Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  From: process.env.TWILIO_WHATSAPP_FROM,
                  To: `whatsapp:+${to}`,
                  ContentSid: process.env.TWILIO_CONTENT_SID,
                  ContentVariables: JSON.stringify({
                    1: p.name,
                    2: event,
                    3: `${p.date.split('-').reverse().join('/')} às ${p.time}`,
                    4: url,
                  }),
                }),
              },
            );
          }
          if (!response.ok) throw new Error(`O provedor retornou HTTP ${response.status}`);
          await db.run("UPDATE notifications SET status='sent',error=NULL WHERE id=?", [row.id]);
        } catch (e) {
          // WhatsApp timeouts are marked for manual review to avoid blind duplicate delivery.
          const uncertain =
            row.channel === 'whatsapp' && (e.name === 'TimeoutError' || e.name === 'TypeError');
          await db.run('UPDATE notifications SET status=?,error=?,next_attempt_at=? WHERE id=?', [
            uncertain ? 'review' : row.attempts >= 4 ? 'failed' : 'pending',
            e.message,
            new Date(Date.now() + 60_000 * 2 ** row.attempts).toISOString(),
            row.id,
          ]);
        }
      }
    } catch (e) {
      console.error('Falha no processamento de notificações:', e.message);
    } finally {
      busy = false;
    }
  };
  return tick;
}

export function startNotifications(db) {
  const tick = createNotificationProcessor(db);
  const timer = setInterval(tick, 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
