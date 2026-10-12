import { z } from 'zod';
import { resolveCompanyContext, requireCompanyRole } from './company-access.js';
import { getCompanyEntitlements, domainError, currentTime } from './entitlements.js';
import { siteEditorImage } from './company-site.js';
import { addDays, clock, weekday } from './domain.js';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T12:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Informe uma data válida.');
const querySchema = z
  .object({
    date: dateSchema.optional(),
    period: z.enum(['day', 'week', 'month']).default('month'),
    professionalId: z.string().min(1).max(200).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const metricInteger = (v) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n))
    domainError(500, 'DASHBOARD_NUMBER_OVERFLOW', 'Não foi possível calcular os indicadores.');
  return n;
};
const integer = metricInteger;
export async function appointmentTotals(tx, cid, start, end) {
  const row = await tx.get(
    "SELECT COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0) AS completed,COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') THEN total ELSE 0 END),0) AS expected,COALESCE(SUM(CASE WHEN status='completed' THEN total ELSE 0 END),0) AS completed_value FROM appointments WHERE company_id=? AND date>=? AND date<=?",
    [cid, start, end],
  );
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, integer(value)]));
}
export function companyClock(now, timezone) {
  let parts;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(now)
        .map((p) => [p.type, p.value]),
    );
  } catch {
    domainError(409, 'INVALID_COMPANY_TIMEZONE', 'Revise o fuso horário da empresa.');
  }
  const hour = Number(parts.hour);
  return {
    today: `${parts.year}-${parts.month}-${parts.day}`,
    minute:
      hour * 60 +
      Number(parts.minute) +
      Number(parts.second) / 60 +
      now.getUTCMilliseconds() / 60000,
    greeting: hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite',
  };
}
export function dashboardPeriod(today, period) {
  if (period === 'day') return { start: today, end: today };
  if (period === 'week') {
    const start = addDays(today, -(weekday(today) + 6) % 7);
    return { start, end: addDays(start, 6) };
  }
  const end = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
  return { start: today.slice(0, 8) + '01', end };
}
// Read-only snapshot: aggregates do not load appointments; lists have a fixed page size.
export async function dashboardSnapshot(tx, cid, query = {}, now = new Date()) {
  const options = querySchema.parse(query);
  const company = await tx.get(
    'SELECT c.id,c.name,c.slug,c.timezone,c.site_published,t.name AS template_name FROM companies c JOIN templates t ON t.id=c.template_id WHERE c.id=?',
    [cid],
  );
  const onboarding = await tx.get('SELECT status FROM company_onboarding WHERE company_id=?', [
    cid,
  ]);
  if (onboarding && onboarding.status !== 'completed')
    domainError(409, 'ONBOARDING_INCOMPLETE', 'Conclua a configuração antes de acessar o painel.');
  const local = companyClock(now, company.timezone);
  const range = dashboardPeriod(local.today, options.period),
    date = options.date || local.today;
  if (date < '1900-01-01' || date > '2199-12-31')
    domainError(400, 'INVALID_DATE', 'Selecione uma data entre 1900 e 2199.');
  if (
    options.professionalId &&
    !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=?', [
      cid,
      options.professionalId,
    ]))
  )
    domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
  const today = await tx.get(
    "SELECT COUNT(*) AS n FROM appointments WHERE company_id=? AND date=? AND status IN ('confirmed','completed')",
    [cid, local.today],
  );
  const totals = await appointmentTotals(tx, cid, range.start, range.end);
  const where =
    'a.company_id=? AND a.date=?' + (options.professionalId ? ' AND a.barber_id=?' : '');
  const args = [cid, date, ...(options.professionalId ? [options.professionalId] : [])];
  const count = integer(
    (await tx.get(`SELECT COUNT(*) AS n FROM appointments a WHERE ${where}`, args)).n,
  );
  const columns =
    'a.id,a.date,a.start_minute,a.end_minute,a.status,a.total,COALESCE(u.name,a.guest_name) AS client_name,b.name AS professional_name,a.barber_id';
  const joins =
    'LEFT JOIN users u ON u.id=a.user_id JOIN barbers b ON b.company_id=a.company_id AND b.id=a.barber_id';
  const pageSize = 20;
  const appointments = await tx.all(
    `SELECT ${columns} FROM appointments a ${joins} WHERE ${where} ORDER BY a.start_minute,a.id LIMIT ? OFFSET ?`,
    [...args, pageSize, (options.page - 1) * pageSize],
  );
  const next = await tx.get(
    `SELECT ${columns} FROM appointments a ${joins} WHERE a.company_id=? AND a.status='confirmed' AND (a.date>? OR (a.date=? AND a.start_minute>=?)) ORDER BY a.date,a.start_minute,a.id LIMIT 1`,
    [cid, local.today, local.today, Math.ceil(local.minute)],
  );
  const ids = [...new Set([...appointments.map((a) => a.id), ...(next ? [next.id] : [])])];
  const items = ids.length
    ? await tx.all(
        `SELECT appointment_id,name FROM appointment_services WHERE company_id=? AND appointment_id IN (${ids.map(() => '?').join(',')}) ORDER BY appointment_id,name,service_id`,
        [cid, ...ids],
      )
    : [];
  const present = (a) => ({
    id: a.id,
    date: a.date,
    time: clock(a.start_minute),
    duration: a.end_minute - a.start_minute,
    status: a.status,
    clientName: a.client_name || 'Cliente',
    professionalName: a.professional_name,
    professionalId: a.barber_id,
    services: items.filter((i) => i.appointment_id === a.id).map((i) => i.name),
    totalCents: integer(a.total),
  });
  const entitlement = await getCompanyEntitlements(tx, cid);
  const subscription = await tx.get(
    "SELECT s.status,s.trial_started_at,s.trial_ends_at,p.name AS plan_name,p.id AS plan_code FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.company_id=? ORDER BY CASE WHEN s.status IN ('pending','active','trialing') THEN 0 ELSE 1 END,s.created_at DESC,s.id DESC LIMIT 1",
    [cid],
  );
  const selectedPlan = await tx.get(
    'SELECT p.name,p.id FROM company_onboarding o JOIN plans p ON p.id=o.plan_id WHERE o.company_id=?',
    [cid],
  );
  const settings = await tx.get('SELECT logo_url FROM company_settings WHERE company_id=?', [cid]);
  const professionals = await tx.all(
    'SELECT id,name,active FROM barbers WHERE company_id=? ORDER BY active DESC,name,id LIMIT 200',
    [cid],
  );
  return {
    company: {
      id: cid,
      name: company.name,
      slug: company.slug,
      timezone: company.timezone,
      logo: await siteEditorImage(tx, cid, settings?.logo_url),
    },
    clock: { now: now.toISOString(), today: local.today, greeting: local.greeting },
    period: { code: options.period, ...range },
    metrics: {
      todayAppointments: integer(today.n),
      completedAppointments: integer(totals.completed),
      expectedValueCents: integer(totals.expected),
    },
    nextAppointment: next ? present(next) : null,
    agenda: {
      date,
      professionalId: options.professionalId || null,
      page: options.page,
      pageSize,
      total: count,
      items: appointments.map(present),
    },
    professionals,
    site: {
      templateName: company.template_name,
      published: company.site_published === 1,
      path: company.site_published === 1 ? '/' + encodeURIComponent(company.slug) : null,
    },
    subscription: {
      ...entitlement,
      planName: subscription?.plan_name || selectedPlan?.name || null,
      planCode: entitlement.planCode || subscription?.plan_code || selectedPlan?.id || null,
      status: subscription?.status || null,
      trialEndsAt:
        subscription?.trial_ends_at && Number.isFinite(Date.parse(subscription.trial_ends_at))
          ? new Date(subscription.trial_ends_at).toISOString()
          : null,
      trialDaysRemaining:
        entitlement.valid && entitlement.subscriptionStatus === 'trialing'
          ? Math.max(0, Math.ceil((Date.parse(entitlement.trialEndsAt) - now.getTime()) / 86400000))
          : 0,
    },
  };
}
export function installDashboard(app, db, authenticated) {
  app.get('/api/dashboard', authenticated, async (req, res, next) => {
    req.companyContext = await resolveCompanyContext(db, req.user, req.get('X-Gradefy-Company-Id'));
    requireCompanyRole(req, res, async (error) => {
      if (error) return next(error);
      try {
        const data = await db.transaction(
          async (tx) => {
            // Revalidate membership in the consistent read snapshot; cached routing never authorizes.
            const context = await resolveCompanyContext(tx, req.user, req.companyContext.companyId);
            if (!['owner', 'manager'].includes(context.role))
              domainError(403, 'COMPANY_ROLE_DENIED', 'Sem permissão para acessar o painel.');
            const now = await currentTime(tx);
            return dashboardSnapshot(tx, context.companyId, req.query, now);
          },
          { readOnly: true },
        );
        res.json(data);
      } catch (error) {
        next(error);
      }
    });
  });
}
