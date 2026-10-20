import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validDate } from './schedule-domain.js';
import { currentTime, domainError, lockEntitlements } from './entitlements.js';
import { lockProfessionalAccess } from './professional-links.js';
import { lockOperational } from './operational-settings.js';
import { lockBarbers } from './scheduling-locks.js';
import { idempotent, requestKey } from './idempotency.js';
import { addDays, clock, dateInTimezone } from './domain.js';
import { enqueueNotification } from './notifications.js';
import { emailConfigured } from './transactional-email.js';

export const blockReasons = {
  personal: 'Imprevisto pessoal do profissional.',
  unavailable: 'Profissional indisponível.',
  emergency: 'Emergência no estabelecimento.',
  operational: 'Motivo operacional.',
};
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const agendaDate = z.string().refine(validDate, 'Informe uma data válida.');
const period = z
  .object({
    from: agendaDate,
    to: agendaDate,
    fullDay: z.boolean(),
    start: time.optional(),
    end: time.optional(),
    professionalId: z.string().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (d) => validDate(d.from) && validDate(d.to) && d.to >= d.from && d.to <= addDays(d.from, 30),
    'Escolha um período de até 31 dias.',
  )
  .refine(
    (d) => (d.fullDay ? !d.start && !d.end : d.start && d.end && d.start < d.end),
    'Informe início e fim válidos ou selecione dia inteiro.',
  );
const confirmation = z
  .object({
    period,
    previewToken: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
    reasonCode: z.enum(['personal', 'unavailable', 'emergency', 'operational', 'other']),
    publicReason: z.string().trim().min(3).max(300).optional(),
    internalNotes: z.string().trim().max(1000).default(''),
  })
  .strict()
  .refine((d) => d.reasonCode !== 'other' || Boolean(d.publicReason), 'Descreva o motivo público.');
const minute = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Both mutations and reservations serialize on the existing barber lock. Do not take
// appointment advisory locks AFTER it: rescheduling takes those in the opposite order.
export function installAgendaBlocks(router, db, cid, { scope, authorize }) {
  const own = scope === 'professional';
  const prefix = own ? '/professional/blocks' : '/admin/agenda/blocks';
  async function target(tx, req, input, write) {
    const access = await authorize(tx, req, write);
    const pid = own ? access.professional.id : input.professionalId;
    if (!pid || (own && input.professionalId))
      domainError(400, 'INVALID_PROFESSIONAL', 'Selecione um profissional autorizado.');
    const professional = await tx.get('SELECT id,name FROM barbers WHERE company_id=? AND id=?', [
      cid,
      pid,
    ]);
    if (!professional) domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
    const today = dateInTimezone(await currentTime(tx), access.company.timezone);
    if (input.from < today || input.to > addDays(today, 730))
      domainError(
        400,
        'INVALID_BLOCK_PERIOD',
        'Escolha datas de hoje até os próximos dois anos, no fuso do estabelecimento.',
      );
    return { ...access, professional };
  }
  async function impact(tx, req, input, access) {
    const start = input.fullDay ? 0 : minute(input.start),
      end = input.fullDay ? 1440 : minute(input.end);
    const rows = await tx.all(
      `SELECT a.id,a.date,a.start_minute,a.end_minute,COALESCE(a.guest_name,u.name,'Cliente') AS client_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id WHERE a.company_id=? AND a.barber_id=? AND a.status='confirmed' AND a.date>=? AND a.date<=? AND a.start_minute<? AND a.end_minute>? ORDER BY a.date,a.start_minute,a.id`,
      [cid, access.professional.id, input.from, input.to, end, start],
    );
    if (rows.length > 1000)
      domainError(400, 'BLOCK_TOO_LARGE', 'Divida o bloqueio em períodos menores.');
    const appointments = [];
    for (const a of rows) {
      const services = await tx.all(
        'SELECT name FROM appointment_services WHERE company_id=? AND appointment_id=? ORDER BY service_id',
        [cid, a.id],
      );
      appointments.push({
        id: a.id,
        date: a.date,
        time: clock(a.start_minute),
        endTime: clock(a.end_minute),
        clientName: a.client_name,
        services: services.map((s) => s.name),
      });
    }
    return {
      period: input,
      professional: access.professional,
      timezone: access.company.timezone,
      count: rows.length,
      appointments,
      previewToken: digest([cid, req.user.id, input, access.professional.id, rows]),
      start,
      end,
    };
  }
  router.post(prefix + '/preview', async (req, res) => {
    const input = period.parse(req.body);
    res.json(
      await db.transaction(
        async (tx) => impact(tx, req, input, await target(tx, req, input, true)),
        { readOnly: true },
      ),
    );
  });
  router.post(prefix + '/confirm', async (req, res) => {
    const data = confirmation.parse(req.body),
      key = requestKey(req);
    if (!key)
      domainError(
        428,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Informe Idempotency-Key para confirmar o bloqueio.',
      );
    const result = await db.transaction(async (tx) => {
      await lockProfessionalAccess(tx, cid, true);
      await lockEntitlements(tx, cid);
      await lockOperational(tx, cid, true);
      const access = await target(tx, req, data.period, true);
      return idempotent(
        tx,
        cid,
        own ? 'own-block-create' : 'block',
        key,
        { scope: 'cancel-on-block', ...data },
        async () => {
          await lockBarbers(tx, cid, access.professional.id);
          const fresh = await impact(
            tx,
            req,
            data.period,
            await target(tx, req, data.period, true),
          );
          if (fresh.previewToken !== data.previewToken)
            domainError(
              409,
              'BLOCK_IMPACT_CHANGED',
              'Os atendimentos afetados mudaram. Revise o período novamente antes de confirmar.',
            );
          const id = randomUUID(),
            now = (await currentTime(tx)).toISOString();
          const reason =
            data.reasonCode === 'other' ? data.publicReason : blockReasons[data.reasonCode];
          await tx.run(
            'INSERT INTO agenda_block_operations(id,company_id,barber_id,actor_id,from_date,to_date,start_minute,end_minute,reason_code,public_reason,internal_notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            [
              id,
              cid,
              access.professional.id,
              req.user.id,
              data.period.from,
              data.period.to,
              fresh.start,
              fresh.end,
              data.reasonCode,
              reason,
              data.internalNotes,
              now,
            ],
          );
          for (let day = data.period.from; day <= data.period.to; day = addDays(day, 1)) {
            const blockId = randomUUID();
            await tx.run(
              'INSERT INTO blocks(company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES(?,?,?,?,?,?,?)',
              [cid, blockId, access.professional.id, day, fresh.start, fresh.end, reason],
            );
            if (own)
              await tx.run(
                'INSERT INTO professional_personal_blocks(company_id,block_id,user_id) VALUES(?,?,?)',
                [cid, blockId, req.user.id],
              );
          }
          for (const a of fresh.appointments) {
            await tx.run(
              "UPDATE appointments SET status='cancelled',cancellation_reason=? WHERE company_id=? AND id=? AND status='confirmed'",
              [reason, cid, a.id],
            );
            const notificationId = await enqueueNotification(tx, cid, a.id, 'cancelled', {
              blockCancellationReason: reason,
              blockOperation: id,
            });
            await tx.run(
              'INSERT INTO agenda_block_cancellations(company_id,operation_id,appointment_id,notification_id) VALUES(?,?,?,?)',
              [cid, id, a.id, notificationId],
            );
          }
          return {
            id,
            cancelled: fresh.count,
            appointmentIds: fresh.appointments.map((a) => a.id),
          };
        },
      );
    });
    // Read live queue state after commit; retries return the original operation with current counters.
    res.status(201).json({ ...result, notifications: await notificationState(db, cid, result.id) });
  });
  router.get(prefix + '/operations', async (req, res) => {
    const access = await authorize(db, req, false);
    const operations = await db.all(
      `SELECT id,barber_id,from_date,to_date,public_reason,created_at${own ? '' : ',actor_id,internal_notes,(SELECT name FROM users u WHERE u.id=actor_id) AS actor_name'} FROM agenda_block_operations WHERE company_id=?${own ? ' AND barber_id=?' : ''} ORDER BY created_at DESC,id DESC LIMIT 30`,
      [cid, ...(own ? [access.professional.id] : [])],
    );
    const results = [];
    for (const op of operations)
      results.push({ ...op, notifications: await notificationState(db, cid, op.id, !own) });
    res.json(results);
  });
}

export async function notificationState(db, cid, operationId, management = false) {
  const rows = await db.all(
    `SELECT n.id,n.status,n.attempts,n.error,n.submitted_at,n.provider_message_id,a.id AS appointment_id,a.date,a.start_minute,a.cancellation_reason,COALESCE(a.guest_name,u.name,'Cliente') AS client_name,COALESCE(a.guest_email,u.email) AS email,COALESCE(a.guest_phone,u.phone) AS phone,(SELECT COALESCE(SUM(p.amount_cents),0) FROM financial_payments p WHERE p.company_id=a.company_id AND p.appointment_id=a.id AND NOT EXISTS(SELECT 1 FROM financial_payment_reversals r WHERE r.company_id=p.company_id AND r.payment_id=p.id)) AS paid_cents FROM agenda_block_cancellations c JOIN notifications n ON n.company_id=c.company_id AND n.id=c.notification_id JOIN appointments a ON a.company_id=c.company_id AND a.id=c.appointment_id LEFT JOIN users u ON u.id=a.user_id WHERE c.company_id=? AND c.operation_id=? ORDER BY a.date,a.start_minute,a.id`,
    [cid, operationId],
  );
  const configured = emailConfigured();
  const processed = rows.filter((r) => r.status === 'sent').length;
  const attention = rows.filter(
    (r) => ['failed', 'review'].includes(r.status) || (!configured && r.status !== 'sent'),
  ).length;
  const pending = rows.length - processed - attention;
  return {
    processed,
    pending,
    attention,
    configured,
    total: rows.length,
    items: rows.map((r) => ({
      appointmentId: r.appointment_id,
      clientName: r.client_name,
      date: r.date,
      time: clock(r.start_minute),
      status: r.status,
      attempts: r.attempts,
      reason: r.cancellation_reason,
      ...(management
        ? {
            email: r.email,
            phone: r.phone,
            error: r.error,
            providerMessageId: r.provider_message_id,
            submittedAt: r.submitted_at,
            paidCents: Number(r.paid_cents),
          }
        : {}),
    })),
  };
}
