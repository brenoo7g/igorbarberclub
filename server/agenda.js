import { z } from 'zod';
import { canManageCompany } from './company-access.js';
import { getLegacyCompanyId } from './company-context.js';
import { currentTime, domainError, getCompanyEntitlements } from './entitlements.js';
import { addDays, dateInTimezone, isFuture } from './domain.js';
import { ensureCompanyClients } from './clients.js';
import { installAgendaBlocks } from './agenda-blocks.js';

export const agendaDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((date) => {
    const parsed = new Date(date + 'T12:00Z');
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === date &&
      date >= '1900-01-01' &&
      date <= '2199-12-31'
    );
  }, 'Informe uma data válida.');
export const reservationExpected = z
  .object({
    date: agendaDate,
    time: z.string(),
    barberId: z.string(),
    status: z.string(),
    notes: z.string().max(1000).default(''),
  })
  .strict();
export const reservationFingerprint = (row) => ({
  date: row.date,
  time: `${String(Math.floor(row.start_minute / 60)).padStart(2, '0')}:${String(row.start_minute % 60).padStart(2, '0')}`,
  barberId: row.barber_id,
  status: row.status,
  notes: row.notes || '',
});
export function checkExpected(row, expected) {
  if (
    expected &&
    JSON.stringify(reservationFingerprint(row)) !==
      JSON.stringify(reservationExpected.parse(expected))
  )
    domainError(
      409,
      'APPOINTMENT_CHANGED',
      'Este atendimento foi alterado por outra pessoa. Atualize os detalhes antes de continuar.',
    );
}
export async function agendaAccess(tx, cid, userId, write = false) {
  if (!(await canManageCompany(tx, userId, cid)))
    domainError(403, 'COMPANY_ROLE_DENIED', 'Acesso exclusivo da gestão desta empresa.');
  return agendaCompanyState(tx, cid, write);
}
// Business state only. Callers must first authorize the current company membership.
export async function agendaCompanyState(tx, cid, write = false) {
  const company = await tx.get('SELECT id,name,timezone FROM companies WHERE id=?', [cid]);
  const onboarding = await tx.get('SELECT status FROM company_onboarding WHERE company_id=?', [
    cid,
  ]);
  if (onboarding && onboarding.status !== 'completed')
    domainError(409, 'ONBOARDING_INCOMPLETE', 'Conclua a configuração antes de operar a agenda.');
  const entitlement = await getCompanyEntitlements(tx, cid);
  const editable = (cid === getLegacyCompanyId() && !onboarding) || entitlement.valid;
  if (write && !editable)
    domainError(
      409,
      entitlement.reason || 'PLAN_REQUIRED',
      'A assinatura não permite alterações na agenda. Você ainda pode consultar seus atendimentos.',
    );
  return { company, entitlement, editable };
}
export function appointmentActions(row, editable, now, timezone) {
  const confirmed = row.status === 'confirmed' && editable;
  return {
    cancel: confirmed,
    reschedule: confirmed && isFuture(row.date, row.start_minute, now, timezone),
    complete: confirmed && !isFuture(row.date, row.end_minute, now, timezone),
  };
}
const listSchema = z
  .object({
    from: agendaDate.optional(),
    view: z.enum(['day', 'week']).default('day'),
    professionalId: z.string().min(1).max(200).optional(),
    status: z.enum(['confirmed', 'completed', 'cancelled', 'no-show']).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();

// Registered behind the existing /admin session + membership middleware. All writes
// below invoke the same booking/status operations used by the legacy public/admin API.
export function installAgendaRoutes(
  router,
  db,
  cid,
  { book, availability, appointmentList, updateStatus, appointmentFinance },
) {
  router.use('/admin/agenda', (req, _res, next) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
    next();
  });
  installAgendaBlocks(router, db, cid, {
    scope: 'management',
    authorize: (tx, req, write) => agendaAccess(tx, cid, req.user.id, write),
  });
  router.get('/admin/agenda', async (req, res) => {
    const options = listSchema.parse(req.query);
    const data = await db.transaction(
      async (tx) => {
        const access = await agendaAccess(tx, cid, req.user.id);
        const now = await currentTime(tx),
          today = dateInTimezone(now, access.company.timezone);
        const from = options.from || today,
          to = addDays(from, options.view === 'week' ? 6 : 0);
        if (
          options.professionalId &&
          !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=?', [
            cid,
            options.professionalId,
          ]))
        )
          domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
        const where =
          'a.date>=? AND a.date<=?' +
          (options.professionalId ? ' AND a.barber_id=?' : '') +
          (options.status ? ' AND a.status=?' : '');
        const args = [
          from,
          to,
          ...(options.professionalId ? [options.professionalId] : []),
          ...(options.status ? [options.status] : []),
        ];
        const total = Number(
          (
            await tx.get(
              `SELECT COUNT(*) AS n FROM appointments a WHERE company_id=? AND (${where})`,
              [cid, ...args],
            )
          ).n,
        );
        const items = await appointmentList(cid, where, args, tx, {
          limit: 30,
          offset: (options.page - 1) * 30,
        });
        // Minimized list DTO; contact details are returned only in an authorized detail request.
        return {
          company: access.company,
          today,
          now: now.toISOString(),
          editable: access.editable,
          entitlement: access.entitlement,
          from,
          to,
          view: options.view,
          page: options.page,
          pageSize: 30,
          total,
          items: items.map(
            ({
              id,
              date,
              time,
              barber_id,
              barber_name,
              client_name,
              start_minute,
              end_minute,
              total,
              status,
              services,
            }) => ({
              id,
              date,
              time,
              barberId: barber_id,
              professionalName: barber_name,
              clientName: client_name,
              duration: end_minute - start_minute,
              totalCents: total,
              status,
              services: services.map(({ service_id, name, price, duration }) => ({
                id: service_id,
                name,
                price,
                duration,
              })),
            }),
          ),
          professionals: await tx.all(
            'SELECT id,name,active FROM barbers WHERE company_id=? ORDER BY active DESC,name,id LIMIT 200',
            [cid],
          ),
        };
      },
      { readOnly: true },
    );
    res.json(data);
  });
  router.get('/admin/agenda/catalog', async (req, res) => {
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await agendaAccess(tx, cid, req.user.id);
          const services = await tx.all(
            'SELECT id,name,duration,price FROM services WHERE company_id=? AND active=1 ORDER BY name,id LIMIT 200',
            [cid],
          );
          const professionals = await tx.all(
            'SELECT id,name FROM barbers WHERE company_id=? AND active=1 ORDER BY name,id LIMIT 200',
            [cid],
          );
          const links = await tx.all(
            'SELECT barber_id,service_id FROM barber_services WHERE company_id=?',
            [cid],
          );
          // Existing account clients are discoverable only through this company's bookings.
          await ensureCompanyClients(tx, cid);
          const clients = await tx.all(
            'SELECT id,name FROM company_clients WHERE company_id=? ORDER BY name,id LIMIT 100',
            [cid],
          );
          return {
            editable: access.editable,
            services,
            professionals: professionals.map((p) => ({
              ...p,
              services: links.filter((l) => l.barber_id === p.id).map((l) => l.service_id),
            })),
            clients,
          };
        },
        { readOnly: false },
      ),
    );
  });
  router.get('/admin/agenda/availability', async (req, res) =>
    res.json(await availability(req, true)),
  );
  router.get('/admin/agenda/:id', async (req, res) =>
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await agendaAccess(tx, cid, req.user.id),
            now = await currentTime(tx);
          const item = (await appointmentList(cid, 'a.id=?', [String(req.params.id)], tx))[0];
          if (!item) domainError(404, 'APPOINTMENT_NOT_FOUND', 'Agendamento não encontrado.');
          return {
            item,
            financial: await appointmentFinance(tx, cid, item.id),
            expected: reservationFingerprint(item),
            actions: appointmentActions(item, access.editable, now, access.company.timezone),
            editable: access.editable,
            timezone: access.company.timezone,
          };
        },
        { readOnly: true },
      ),
    ),
  );
  router.post('/admin/agenda', (req, res) => book(req, res, false));
  router.patch('/admin/agenda/:id/reschedule', (req, res) => book(req, res, true));
  router.patch('/admin/agenda/:id/status', async (req, res) => {
    await updateStatus(req, true);
    res.json({ ok: true });
  });
}
