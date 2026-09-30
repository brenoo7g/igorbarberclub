import { requireCompanyId } from './company-context.js';
import { randomUUID } from 'node:crypto';
import { clock } from './domain.js';

export async function enqueueNotification(db, companyId, appointmentId, event) {
  requireCompanyId(companyId);
  const appointment = await db.get(
    'SELECT a.*,COALESCE(u.name,a.guest_name) AS name,COALESCE(u.email,a.guest_email) AS email,COALESCE(u.phone,a.guest_phone) AS phone,b.name AS barber_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id JOIN barbers b ON b.id=a.barber_id AND b.company_id=a.company_id WHERE a.company_id=? AND a.id=?',
    [companyId, appointmentId],
  );
  if (!appointment) throw Object.assign(new Error('Agendamento não encontrado.'), { status: 404 });
  const services = await db.all(
    'SELECT name FROM appointment_services WHERE company_id=? AND appointment_id=?',
    [companyId, appointmentId],
  );
  const payload = JSON.stringify({
    name: appointment.name,
    email: appointment.email,
    phone: appointment.phone,
    date: appointment.date,
    time: clock(appointment.start_minute),
    services: services.map((s) => s.name).join(', '),
    barber: appointment.barber_name,
    total: appointment.total,
    duration: appointment.end_minute - appointment.start_minute,
    reference: appointment.id,
    guest: appointment.user_id === null,
    guestSession: Boolean(
      await db.get(
        'SELECT appointment_id FROM guest_appointments WHERE company_id=? AND appointment_id=?',
        [companyId, appointmentId],
      ),
    ),
  });
  for (const channel of ['email', 'whatsapp']) {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO notifications (company_id,id,appointment_id,channel,event,payload,created_at,next_attempt_at) VALUES (?,?,?,?,?,?,?,?)`,
      [companyId, randomUUID(), appointmentId, channel, event, payload, now, now],
    );
  }
}

export function appointmentEmail(payload, event, url) {
  const label =
    { confirmed: 'confirmado', cancelled: 'cancelado', rescheduled: 'remarcado' }[event] ||
    'atualizado';
  const introduction =
    {
      confirmed: 'Seu agendamento na Igor Barber Club foi realizado com sucesso!',
      cancelled: 'Seu agendamento na Igor Barber Club foi cancelado.',
      rescheduled: 'Seu agendamento na Igor Barber Club foi remarcado com sucesso!',
    }[event] || 'Seu agendamento na Igor Barber Club foi atualizado.';
  const lines = [
    `Olá, ${payload.name}!`,
    '',
    introduction,
    '',
    `Serviço(s): ${payload.services}`,
    `Data: ${payload.date.split('-').reverse().join('/')}`,
    `Horário: ${payload.time} (horário de Brasília)`,
  ];
  // Old queued events have no price/professional snapshot. Do not invent their historical data.
  if (payload.barber) lines.push(`Profissional: ${payload.barber}`);
  if (Number.isInteger(payload.duration))
    lines.push(`Duração estimada: ${payload.duration} minutos`);
  if (Number.isInteger(payload.total))
    lines.push(
      `Valor total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload.total / 100)}`,
    );
  if (event !== 'cancelled') lines.push('Pagamento na barbearia.');
  if (payload.reference) lines.push(`Código do agendamento: ${payload.reference}`);
  lines.push(
    '',
    payload.guestSession
      ? 'Para consultar, cancelar ou remarcar, abra Meus agendamentos no mesmo navegador usado na reserva. Se perdeu esse acesso, entre em contato com a barbearia e informe o código do agendamento:'
      : payload.guest
        ? 'Para cancelar ou remarcar, entre em contato com a barbearia e informe o código do agendamento:'
        : 'Para consultar seus horários, cancelar ou remarcar, entre na sua conta:',
    url,
    '',
    'Igor Barber Club · Campo Grande, RJ',
  );
  return { subject: `Agendamento ${label} — Igor Barber Club`, text: lines.join('\n') };
}

export function createNotificationProcessor(db, companyId, { batchSize = 20 } = {}) {
  requireCompanyId(companyId);
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
          `SELECT * FROM notifications WHERE company_id=? AND status='pending' AND attempts<5 AND next_attempt_at<=? AND channel IN (${channels.map(() => '?').join(',')}) ORDER BY created_at LIMIT ?`,
          [companyId, new Date().toISOString(), ...channels, batchSize],
        );
        for (const job of jobs)
          await tx.run(
            "UPDATE notifications SET status='sending',attempts=attempts+1 WHERE company_id=? AND id=?",
            [companyId, job.id],
          );
        return jobs;
      });
      for (const row of rows) {
        try {
          const p = JSON.parse(row.payload);
          // Keep the event snapshot, but deliver to the account's current contact details.
          const recipient = await db.get(
            'SELECT COALESCE(u.name,a.guest_name) AS name,COALESCE(u.email,a.guest_email) AS email,COALESCE(u.phone,a.guest_phone) AS phone FROM appointments a LEFT JOIN users u ON a.user_id=u.id WHERE a.company_id=? AND a.id=?',
            [companyId, row.appointment_id],
          );
          if (!recipient) throw new Error('Destinatário do agendamento não encontrado.');
          Object.assign(p, recipient);
          const event =
            { confirmed: 'confirmado', cancelled: 'cancelado', rescheduled: 'remarcado' }[
              row.event
            ] || row.event;
          const url = `${process.env.APP_URL || 'http://localhost:5173'}/${p.guest && !p.guestSession ? '#contato' : 'minha-conta'}`;
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
                ...appointmentEmail(p, row.event, url),
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
          await db.run(
            "UPDATE notifications SET status='sent',error=NULL WHERE company_id=? AND id=?",
            [companyId, row.id],
          );
        } catch (e) {
          // WhatsApp timeouts are marked for manual review to avoid blind duplicate delivery.
          const uncertain =
            row.channel === 'whatsapp' && (e.name === 'TimeoutError' || e.name === 'TypeError');
          await db.run(
            'UPDATE notifications SET status=?,error=?,next_attempt_at=? WHERE company_id=? AND id=?',
            [
              uncertain ? 'review' : row.attempts >= 4 ? 'failed' : 'pending',
              e.message,
              new Date(Date.now() + 60_000 * 2 ** row.attempts).toISOString(),
              companyId,
              row.id,
            ],
          );
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

export function startNotifications(db, companyId) {
  requireCompanyId(companyId);
  const tick = createNotificationProcessor(db, companyId);
  const timer = setInterval(tick, 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
