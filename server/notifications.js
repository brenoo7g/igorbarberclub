import { requireCompanyId, publicCompanyPath } from './company-context.js';
import { randomUUID } from 'node:crypto';
import { cleanIdempotency } from './idempotency.js';
import { clock } from './domain.js';
import {
  deliverTransactionalEmail,
  emailConfigured,
  emailDeliveryScope,
} from './transactional-email.js';
import { emailTemplate } from './email-templates.js';
import { z } from 'zod';

export async function enqueueNotification(db, companyId, appointmentId, event, options = {}) {
  requireCompanyId(companyId);
  const appointment = await db.get(
    'SELECT a.*,COALESCE(a.guest_name,u.name) AS name,COALESCE(a.guest_email,u.email) AS email,COALESCE(a.guest_phone,u.phone) AS phone,b.name AS barber_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id JOIN barbers b ON b.id=a.barber_id AND b.company_id=a.company_id WHERE a.company_id=? AND a.id=?',
    [companyId, appointmentId],
  );
  if (!appointment) throw Object.assign(new Error('Agendamento não encontrado.'), { status: 404 });
  const brand = await db.get(
    'SELECT c.name,c.slug,c.timezone,s.city,s.region FROM companies c LEFT JOIN company_settings s ON s.company_id=c.id WHERE c.id=?',
    [companyId],
  );
  const services = await db.all(
    'SELECT name FROM appointment_services WHERE company_id=? AND appointment_id=?',
    [companyId, appointmentId],
  );
  const payload = JSON.stringify({
    brand,
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
    cancellationSource:
      options.cancellationSource || (options.blockCancellationReason ? 'business' : 'customer'),
    ...(options.blockCancellationReason
      ? {
          blockCancellationReason: options.blockCancellationReason,
          blockOperation: options.blockOperation,
        }
      : {}),
    guest: appointment.user_id === null,
    guestSession: Boolean(
      await db.get(
        'SELECT appointment_id FROM guest_appointments WHERE company_id=? AND appointment_id=?',
        [companyId, appointmentId],
      ),
    ),
  });
  let emailId;
  for (const channel of options.blockCancellationReason ? ['email'] : ['email', 'whatsapp']) {
    if (channel === 'email' && !appointment.email && !options.blockCancellationReason) continue;
    const now = new Date().toISOString();
    const id = randomUUID();
    const invalid =
      options.blockCancellationReason && !z.string().email().safeParse(appointment.email).success;
    await db.run(
      `INSERT INTO notifications (company_id,id,appointment_id,channel,event,payload,created_at,next_attempt_at,status,error,email_delivery_scope) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        companyId,
        id,
        appointmentId,
        channel,
        event,
        payload,
        now,
        now,
        invalid ? 'failed' : 'pending',
        invalid ? 'Cliente sem e-mail válido. Entre em contato manualmente.' : null,
        emailDeliveryScope(),
      ],
    );
    if (channel === 'email') emailId = id;
  }
  return emailId;
}

export function appointmentEmail(payload, event, url, companyId) {
  requireCompanyId(companyId);
  const brand = payload.brand || { name: 'Estabelecimento' };
  const business =
    event === 'cancelled' &&
    (payload.blockCancellationReason || payload.cancellationSource === 'business');
  const subject = business
    ? 'Aviso importante: seu agendamento foi cancelado'
    : {
        confirmed: 'Seu hor\u00e1rio est\u00e1 confirmado!',
        rescheduled: 'Seu agendamento foi atualizado',
        cancelled: 'Seu agendamento foi cancelado',
      }[event] || 'Seu agendamento foi atualizado';
  const details = [
    ['Estabelecimento', brand.name],
    ['Servi\u00e7o(s)', payload.services],
    ['Data', String(payload.date).split('-').reverse().join('/')],
    ['Hor\u00e1rio', payload.time],
  ];
  if (payload.barber) details.push(['Profissional', payload.barber]);
  if (Number.isInteger(payload.duration))
    details.push(['Dura\u00e7\u00e3o estimada', payload.duration + ' minutos']);
  if (Number.isInteger(payload.total))
    details.push([
      'Valor total',
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
        payload.total / 100,
      ),
    ]);
  if (payload.reference) details.push(['C\u00f3digo do agendamento', payload.reference]);
  const paragraphs = [
    event === 'confirmed'
      ? 'Seu agendamento em ' + brand.name + ' foi realizado com sucesso!'
      : event === 'rescheduled'
        ? 'Seu agendamento em ' +
          brand.name +
          ' foi remarcado com sucesso! Confira o novo dia e hor\u00e1rio.'
        : 'Seu agendamento em ' + brand.name + ' foi cancelado.',
  ];
  if (business) {
    paragraphs.push(
      'Pedimos desculpas pelo inconveniente. Gostar\u00edamos muito de atend\u00ea-lo em outro momento.',
    );
    if (payload.blockCancellationReason)
      paragraphs.push('Motivo: ' + payload.blockCancellationReason);
  }
  if (event !== 'cancelled') paragraphs.push('Pagamento no estabelecimento.');
  if (brand.timezone) paragraphs.push('Fuso hor\u00e1rio: ' + brand.timezone + '.');
  if (!payload.guest && event !== 'cancelled')
    paragraphs.push('Para consultar seus hor\u00e1rios, cancelar ou remarcar, entre na sua conta:');
  if (payload.guest)
    paragraphs.push(
      payload.guestSession
        ? 'Abra Meus agendamentos no mesmo navegador usado na reserva. Se perdeu esse acesso, entre em contato com o estabelecimento e informe o c\u00f3digo do agendamento.'
        : 'Para cancelar ou remarcar, entre em contato com o estabelecimento e informe o c\u00f3digo do agendamento.',
    );
  return emailTemplate({
    subject: subject + ' \u2014 ' + brand.name,
    title: subject,
    greeting: 'Ol\u00e1, ' + payload.name + '!',
    paragraphs,
    details,
    action: {
      label: event === 'cancelled' ? 'Agendar novo hor\u00e1rio' : 'Acompanhar minha reserva',
      url,
    },
    footer: [brand.name, brand.city, brand.region].filter(Boolean).join(' \u00b7 '),
  });
}

export const NOTIFICATION_MAX_ATTEMPTS = 5;
export const NOTIFICATION_LEASE_MS = 60000;
// Below Resend's 24h retention, leaving a safety margin for clock/network delays.
const REPLAY_WINDOW_MS = 23 * 3600000;

async function deliveryEnvelope(tx, companyId, row) {
  if (row.delivery_payload) return row.delivery_payload;
  const p = JSON.parse(row.payload);
  const recipient = await tx.get(
    'SELECT COALESCE(a.guest_name,u.name) AS name,COALESCE(a.guest_email,u.email) AS email,COALESCE(a.guest_phone,u.phone) AS phone FROM appointments a LEFT JOIN users u ON a.user_id=u.id WHERE a.company_id=? AND a.id=?',
    [companyId, row.appointment_id],
  );
  if (!recipient) throw new Error('Destinatário do agendamento não encontrado.');
  Object.assign(p, recipient);
  const company = await tx.get(
    'SELECT c.name,c.slug,c.timezone,s.city,s.region FROM companies c LEFT JOIN company_settings s ON s.company_id=c.id WHERE c.id=?',
    [companyId],
  );
  if (!company) throw new Error('Empresa do evento não encontrada.');
  p.brand ||= company;
  const url = new URL(
    `${publicCompanyPath(companyId, company.slug)}/${row.event === 'cancelled' ? 'agendar' : p.guest && !p.guestSession ? '#contato' : 'minha-conta'}`,
    process.env.APP_URL || 'http://localhost:5173',
  ).href;
  if (row.channel === 'email') {
    if (p.blockCancellationReason && !z.string().email().safeParse(p.email).success)
      throw new Error('E-mail inválido.');
    return JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [p.email],
      ...appointmentEmail(p, row.event, url, companyId),
    });
  }
  const phone = p.phone.replace(/\D/g, '');
  const event =
    { confirmed: 'confirmado', cancelled: 'cancelado', rescheduled: 'remarcado' }[row.event] ||
    row.event;
  return JSON.stringify({
    From: process.env.TWILIO_WHATSAPP_FROM,
    To: `whatsapp:+${phone.length <= 11 ? '55' + phone : phone}`,
    ContentSid: process.env.TWILIO_CONTENT_SID,
    ContentVariables: JSON.stringify({
      1: p.name,
      2: event,
      3: `${p.date.split('-').reverse().join('/')} às ${p.time}`,
      4: url,
    }),
  });
}

// One lease per imminent send, never a batch of leases expiring while waiting in memory.
export async function claimNotification(db, companyId, channels) {
  requireCompanyId(companyId);
  if (!channels.length) return null;
  return db.transaction(async (tx) => {
    // PostgreSQL is the clock authority across instances; clock skew cannot steal a live lease.
    const nowMs =
      tx.dialect === 'postgres'
        ? new Date((await tx.get('SELECT clock_timestamp() AS now')).now).getTime()
        : Date.now();
    const now = new Date(nowMs).toISOString();
    const row = await tx.get(
      `SELECT n.* FROM notifications n JOIN companies c ON c.id=n.company_id WHERE n.company_id=? AND c.status='active' AND ((n.status='pending' AND n.next_attempt_at<=?) OR (n.status='sending' AND (n.lease_expires_at IS NULL OR n.lease_expires_at<=?))) AND n.channel IN (${channels.map(() => '?').join(',')}) ORDER BY n.created_at,n.id LIMIT 1${tx.dialect === 'postgres' ? ' FOR UPDATE OF n SKIP LOCKED' : ''}`,
      [companyId, now, now, ...channels],
    );
    if (!row) return null;
    const abandoned = row.status === 'sending';
    const unsafeReplay =
      row.attempts > 0 &&
      (!Number.isFinite(Date.parse(row.first_attempt_at)) ||
        !row.delivery_payload ||
        nowMs - Date.parse(row.first_attempt_at) >= REPLAY_WINDOW_MS);
    if (
      (abandoned && row.channel === 'whatsapp') ||
      unsafeReplay ||
      row.attempts >= NOTIFICATION_MAX_ATTEMPTS
    ) {
      await tx.run(
        'UPDATE notifications SET status=?,error=?,claim_token=NULL,lease_expires_at=NULL WHERE company_id=? AND id=?',
        [
          abandoned || unsafeReplay ? 'review' : 'failed',
          'Tentativa anterior exige revisão ou atingiu o limite de tentativas.',
          companyId,
          row.id,
        ],
      );
      return { skipped: true };
    }
    let envelope;
    try {
      envelope = await deliveryEnvelope(tx, companyId, row);
    } catch {
      await tx.run(
        "UPDATE notifications SET status='failed',error='Dados da mensagem inválidos.' WHERE company_id=? AND id=?",
        [companyId, row.id],
      );
      return { skipped: true };
    }
    const token = randomUUID();
    await tx.run(
      "UPDATE notifications SET status='sending',attempts=attempts+1,claim_token=?,claimed_at=?,lease_expires_at=?,first_attempt_at=COALESCE(first_attempt_at,?),delivery_payload=? WHERE company_id=? AND id=?",
      [
        token,
        now,
        new Date(nowMs + NOTIFICATION_LEASE_MS).toISOString(),
        now,
        envelope,
        companyId,
        row.id,
      ],
    );
    return { ...row, attempts: row.attempts + 1, claim_token: token, delivery_payload: envelope };
  });
}

export function createNotificationProcessor(db, companyId, { batchSize = 20 } = {}) {
  requireCompanyId(companyId);
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      await cleanIdempotency(db, companyId);
      const channels = [];
      if (emailConfigured()) channels.push('email');
      if (
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_WHATSAPP_FROM &&
        process.env.TWILIO_CONTENT_SID
      )
        channels.push('whatsapp');
      for (let index = 0; index < batchSize; index++) {
        const row = await claimNotification(db, companyId, channels);
        if (!row) break;
        if (row.skipped) continue;
        let status = 'sent',
          error = null;
        let providerId = null;
        try {
          let response;
          if (row.channel === 'email') {
            response = await deliverTransactionalEmail(
              db,
              { companyId, sourceId: row.id, kind: 'appointment', scope: row.email_delivery_scope },
              row.delivery_payload,
              row.id,
            );
          } else {
            response = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
              {
                method: 'POST',
                signal: AbortSignal.timeout(15000),
                headers: {
                  Authorization: `Basic ${Buffer.from(process.env.TWILIO_ACCOUNT_SID + ':' + process.env.TWILIO_AUTH_TOKEN).toString('base64')}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(JSON.parse(row.delivery_payload)),
              },
            );
          }
          if (!response.ok)
            throw Object.assign(new Error(`O provedor retornou HTTP ${response.status}`), {
              uncertain: row.channel === 'whatsapp' && response.status >= 500,
            });
          if (row.channel === 'email') {
            try {
              const receipt = await response.json();
              if (typeof receipt.id === 'string' && receipt.id.length <= 200)
                providerId = receipt.id;
            } catch {
              /* HTTP acceptance is not delivery confirmation. */
            }
          }
        } catch (e) {
          const uncertain =
            row.channel === 'whatsapp' &&
            (e.uncertain || ['TimeoutError', 'TypeError', 'AbortError'].includes(e.name));
          status =
            e.code === 'EMAIL_POLICY_BLOCKED'
              ? 'review'
              : uncertain
                ? 'review'
                : row.attempts >= NOTIFICATION_MAX_ATTEMPTS
                  ? 'failed'
                  : 'pending';
          error = e.message;
        }
        // A late worker cannot acknowledge/fail a lease now owned by another worker.
        await db.run(
          "UPDATE notifications SET status=?,error=?,next_attempt_at=?,provider_message_id=?,submitted_at=?,claim_token=NULL,lease_expires_at=NULL WHERE company_id=? AND id=? AND status='sending' AND claim_token=?",
          [
            status,
            error,
            new Date(Date.now() + 60000 * 2 ** (row.attempts - 1)).toISOString(),
            providerId,
            status === 'sent' ? new Date().toISOString() : null,
            companyId,
            row.id,
            row.claim_token,
          ],
        );
        if (row.channel === 'email' && status === 'pending')
          await db.run(
            "UPDATE email_deliveries SET status='pending' WHERE company_id=? AND source_id=? AND kind='appointment' AND status='failed'",
            [companyId, row.id],
          );
      }
    } catch (e) {
      console.error('Falha no processamento de notificações:', e.code || e.name);
    } finally {
      busy = false;
    }
  };
}

export function startNotifications(db, companyId) {
  requireCompanyId(companyId);
  const tick = createNotificationProcessor(db, companyId);
  const timer = setInterval(tick, 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

// The dispatcher discovers company IDs from pending events, never from a user
// session. Each worker still validates and operates on a single explicit company.
export function createCompanyNotificationDispatcher(db, options = {}) {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try {
      // Cleanup also runs for companies without pending messages, including suspended ones.
      const expired = await db.all(
        'SELECT DISTINCT company_id FROM idempotency_keys WHERE expires_at<=?',
        [new Date().toISOString()],
      );
      for (const row of expired) await cleanIdempotency(db, row.company_id);
      const companies = await db.all(
        "SELECT n.company_id FROM notifications n JOIN companies c ON c.id=n.company_id WHERE c.status='active' AND ((n.status='pending' AND n.next_attempt_at<=?) OR (n.status='sending' AND (n.lease_expires_at IS NULL OR n.lease_expires_at<=?))) GROUP BY n.company_id ORDER BY MIN(n.created_at)",
        [new Date().toISOString(), new Date().toISOString()],
      );
      // Independent company queues progress concurrently, with bounded provider load.
      const pending = companies[Symbol.iterator]();
      await Promise.all(
        Array.from({ length: Math.min(4, companies.length) }, async () => {
          for (const { company_id } of pending)
            await createNotificationProcessor(db, company_id, options)();
        }),
      );
    } finally {
      busy = false;
    }
  };
}

export function startCompanyNotifications(db) {
  const process = createCompanyNotificationDispatcher(db);
  const tick = () =>
    process().catch((error) =>
      console.error('Falha na fila empresarial:', error.code || error.name),
    );
  const timer = setInterval(tick, 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
