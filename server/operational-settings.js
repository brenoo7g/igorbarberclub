import { z } from 'zod';
import { agendaAccess } from './agenda.js';
import { lockResource } from './scheduling-locks.js';
import { currentTime, domainError } from './entitlements.js';
import { addDays, dateInTimezone, localInstant, weekday } from './domain.js';
import { settingsSchema } from './schedule.js';

export const lockOperational = (tx, cid, shared = false) =>
  lockResource(tx, cid, 'operational-settings', 'policies', shared);
const integer = (max) => z.number().int().min(0).max(max);
const hours = z
  .array(
    z
      .object({
        weekday: integer(6),
        active: z.boolean(),
        start_time: z.string(),
        end_time: z.string(),
        breaks: z.array(z.object({ start_time: z.string(), end_time: z.string() }).strict()).max(4),
      })
      .strict(),
  )
  .length(7)
  .superRefine((days, ctx) => {
    // Reuse the existing schedule validation, including interval boundaries. A
    // company can close all days; professional schedules still require active days.
    const result = settingsSchema.safeParse({
      agenda_mode: 'auto',
      max_days_ahead: 90,
      version: 0,
      days: days.some((d) => d.active) ? days : days.map((d, i) => ({ ...d, active: i === 0 })),
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', message: issue.message });
  });
const timezone = z
  .string()
  .max(100)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Informe um fuso IANA válido.');
export const operationalSchema = z
  .object({
    version: integer(2147483647),
    site_version: integer(2147483647),
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine((v) => !v || /^\d{10,13}$/.test(v.replace(/\D/g, '')), 'Informe telefone com DDD.'),
    address: z.string().trim().max(250),
    timezone,
    working_days: hours.nullable(),
    minimum_notice_minutes: integer(10080),
    maximum_booking_days: z.number().int().min(1).max(90).nullable(),
    buffer_minutes: integer(180),
    cancel_notice_minutes: integer(10080),
    reschedule_notice_minutes: integer(10080),
    online_booking_enabled: z.boolean(),
  })
  .strict();

export async function readPolicies(tx, cid) {
  const row = await tx.get('SELECT * FROM company_settings WHERE company_id=?', [cid]);
  return {
    version: row?.operational_version || 0,
    working_days: row?.working_days_json ? JSON.parse(row.working_days_json) : null,
    minimum_notice_minutes: row?.minimum_notice_minutes || 0,
    maximum_booking_days: row?.maximum_booking_days ?? null,
    buffer_minutes: row?.buffer_minutes || 0,
    cancel_notice_minutes: row?.cancel_notice_minutes || 0,
    reschedule_notice_minutes: row?.reschedule_notice_minutes || 0,
    online_booking_enabled: row?.online_booking_enabled !== 0,
  };
}
export function intersectDay(professional, policies, date) {
  if (!policies.working_days) return professional;
  const company = policies.working_days.find((d) => d.weekday === weekday(date));
  if (!company?.active || !professional?.active) return { ...professional, active: false };
  const start = [company.start_time, professional.start_time].sort().at(-1),
    end = [company.end_time, professional.end_time].sort()[0];
  return {
    ...professional,
    active: start < end,
    start_time: start,
    end_time: end,
    breaks: [...company.breaks, ...professional.breaks],
  };
}
export function policyAccess(p, date, now, timezone, internal = false, reschedule = false) {
  if (!internal && !reschedule && !p.online_booking_enabled)
    return {
      allowed: false,
      reason: 'online-paused',
      message: 'Os agendamentos online estão pausados. Entre em contato com o estabelecimento.',
    };
  if (
    !internal &&
    p.maximum_booking_days !== null &&
    date > addDays(dateInTimezone(now, timezone), p.maximum_booking_days)
  )
    return {
      allowed: false,
      reason: 'booking-window',
      message: 'Escolha uma data dentro da janela de agendamento do estabelecimento.',
    };
  return { allowed: true, reason: null, message: null };
}
export function noticeSlots(slots, p, date, now, timezone, internal = false) {
  if (internal) return slots;
  return slots.filter((time) => {
    const instant = localInstant(
      date,
      Number(time.slice(0, 2)) * 60 + Number(time.slice(3)),
      timezone,
    );
    return instant && instant.getTime() - now.getTime() >= p.minimum_notice_minutes * 60000;
  });
}
export function enforceCustomerNotice(p, appointment, action, now, timezone) {
  const instant = localInstant(appointment.date, appointment.start_minute, timezone);
  const minimum = action === 'cancel' ? p.cancel_notice_minutes : p.reschedule_notice_minutes;
  if (
    !instant ||
    instant.getTime() <= now.getTime() ||
    instant.getTime() - now.getTime() < minimum * 60000
  )
    domainError(
      409,
      'CUSTOMER_NOTICE_REQUIRED',
      `O prazo para ${action === 'cancel' ? 'cancelar' : 'reagendar'} online terminou. Entre em contato com o estabelecimento.`,
    );
}
export async function snapshotOperational(tx, cid, actor) {
  const access = await agendaAccess(tx, cid, actor),
    p = await readPolicies(tx, cid);
  const row = await tx.get(
    'SELECT c.name,c.timezone,s.phone,s.address,s.site_version FROM companies c LEFT JOIN company_settings s ON s.company_id=c.id WHERE c.id=?',
    [cid],
  );
  return {
    ...p,
    ...row,
    site_version: row.site_version ?? 0,
    phone: row.phone || '',
    address: row.address || '',
    editable: access.editable,
    timezoneLocked: !!(await tx.get('SELECT id FROM appointments WHERE company_id=? LIMIT 1', [
      cid,
    ])),
    professionals: await tx.all(
      'SELECT id,name,active FROM barbers WHERE company_id=? ORDER BY name,id',
      [cid],
    ),
  };
}
export function installOperationalSettings(router, db, cid) {
  router.use('/admin/settings', (req, _res, next) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa.');
    next();
  });
  router.get('/admin/settings', async (req, res) =>
    res.json(
      await db.transaction((tx) => snapshotOperational(tx, cid, req.user.id), { readOnly: true }),
    ),
  );
  router.put('/admin/settings', async (req, res) => {
    const data = operationalSchema.parse(req.body);
    const result = await db.transaction(async (tx) => {
      // Same editor lock/version protects shared name/phone/address from stale site edits.
      await lockResource(tx, cid, 'site-editor', 'settings');
      await lockOperational(tx, cid);
      if (tx.dialect === 'postgres')
        await tx.get(
          'SELECT user_id FROM company_members WHERE company_id=? AND user_id=? FOR SHARE',
          [cid, req.user.id],
        );
      await agendaAccess(tx, cid, req.user.id, true);
      const existing = await snapshotOperational(tx, cid, req.user.id);
      if (existing.version !== data.version || existing.site_version !== data.site_version)
        domainError(
          409,
          'SETTINGS_VERSION_CONFLICT',
          'As configurações ou os contatos do site foram alterados. Recarregue antes de salvar.',
        );
      if (existing.timezone !== data.timezone && existing.timezoneLocked)
        domainError(
          409,
          'TIMEZONE_HISTORY_LOCKED',
          'O fuso não pode mudar com reservas existentes: suas datas e horários locais precisam ser preservados.',
        );
      const now = (await currentTime(tx)).toISOString();
      await tx.run('UPDATE companies SET name=?,timezone=?,updated_at=? WHERE id=?', [
        data.name,
        data.timezone,
        now,
        cid,
      ]);
      await tx.run(
        'INSERT INTO company_settings(company_id,updated_at) VALUES(?,?) ON CONFLICT(company_id) DO NOTHING',
        [cid, now],
      );
      await tx.run(
        'UPDATE company_settings SET phone=?,address=?,minimum_notice_minutes=?,maximum_booking_days=?,buffer_minutes=?,cancel_notice_minutes=?,reschedule_notice_minutes=?,online_booking_enabled=?,working_days_json=?,operational_version=operational_version+1,site_version=site_version+1,updated_at=? WHERE company_id=?',
        [
          data.phone.replace(/\D/g, ''),
          data.address,
          data.minimum_notice_minutes,
          data.maximum_booking_days,
          data.buffer_minutes,
          data.cancel_notice_minutes,
          data.reschedule_notice_minutes,
          data.online_booking_enabled ? 1 : 0,
          data.working_days === null ? null : JSON.stringify(data.working_days),
          now,
          cid,
        ],
      );
      return snapshotOperational(tx, cid, req.user.id);
    });
    res.json(result);
  });
}
