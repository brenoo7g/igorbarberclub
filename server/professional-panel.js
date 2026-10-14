import { z } from 'zod';
import { resolveCompanyContext } from './company-access.js';
import { agendaDate, agendaCompanyState, appointmentActions } from './agenda.js';
import { currentTime, domainError } from './entitlements.js';
import { addDays, dateInTimezone, clock } from './domain.js';
import { readSchedule } from './schedule.js';
import { readPolicies, intersectDay } from './operational-settings.js';

export const professionalCompletionSchema = z
  .object({
    expected: z
      .object({ date: agendaDate, time: z.string(), endTime: z.string(), status: z.string() })
      .strict(),
  })
  .strict();
export const ownFingerprint = (row) => ({
  date: row.date,
  time: clock(row.start_minute),
  endTime: clock(row.end_minute),
  status: row.status,
});
export function checkOwnExpected(row, expected) {
  if (JSON.stringify(ownFingerprint(row)) !== JSON.stringify(expected))
    domainError(
      409,
      'APPOINTMENT_CHANGED',
      'Este atendimento mudou. Atualize os detalhes antes de concluir.',
    );
}
export async function professionalAccess(tx, cid, actor, write = false) {
  const context = await resolveCompanyContext(tx, { id: actor }, cid);
  if (context.role !== 'professional')
    domainError(
      403,
      'PROFESSIONAL_ROLE_REQUIRED',
      'Esta área é exclusiva do profissional nesta empresa.',
    );
  const business = await agendaCompanyState(tx, cid).catch(async (e) => {
    if (e.code !== 'ONBOARDING_INCOMPLETE') throw e;
    return {
      company: await tx.get('SELECT id,name,timezone FROM companies WHERE id=?', [cid]),
      editable: false,
      pending: true,
    };
  });
  const p = await tx.get(
    'SELECT b.id,b.name,b.active FROM professional_users p JOIN barbers b ON b.company_id=p.company_id AND b.id=p.barber_id WHERE p.company_id=? AND p.user_id=?',
    [cid, actor],
  );
  const linkState = !p || business.pending ? 'pending' : p.active !== 1 ? 'inactive' : 'linked';
  const message =
    linkState === 'pending'
      ? 'Seu acesso foi criado. O proprietário ainda precisa vincular sua conta ao cadastro profissional do estabelecimento.'
      : linkState === 'inactive'
        ? 'Seu cadastro profissional está desativado. Fale com o proprietário para retomar o acesso à agenda.'
        : !business.editable
          ? 'A assinatura permite somente consultar seus atendimentos.'
          : null;
  if (write && linkState !== 'linked') domainError(409, 'PROFESSIONAL_ACCESS_UNAVAILABLE', message);
  if (write) await agendaCompanyState(tx, cid, true);
  return {
    company: business.company,
    editable: business.editable && linkState === 'linked',
    professional: linkState === 'linked' ? p : null,
    linkState,
    message,
  };
}
const listSchema = z
  .object({
    from: agendaDate.optional(),
    view: z.enum(['day', 'week']).default('day'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    status: z.enum(['confirmed', 'completed', 'cancelled', 'no-show']).optional(),
  })
  .strict();
const selectOwn = `SELECT a.id,a.date,a.start_minute,a.end_minute,a.status,COALESCE(a.guest_name,u.name,'Cliente') AS client_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id WHERE a.company_id=? AND a.barber_id=?`;
async function item(tx, cid, row, access, now) {
  return {
    id: row.id,
    date: row.date,
    time: clock(row.start_minute),
    endTime: clock(row.end_minute),
    clientName: row.client_name,
    status: row.status,
    duration: row.end_minute - row.start_minute,
    services: await tx.all(
      'SELECT name,duration FROM appointment_services WHERE company_id=? AND appointment_id=? ORDER BY service_id',
      [cid, row.id],
    ),
    canComplete: appointmentActions(row, access.editable, now, access.company.timezone).complete,
  };
}
export async function professionalHours(tx, cid, pid) {
  const schedule = await readSchedule(tx, cid, pid),
    policies = await readPolicies(tx, cid);
  const effective = schedule.days.map((d) => {
    const day = intersectDay(d, policies, addDays('2026-10-11', d.weekday));
    // Presentation only: clip and merge breaks exactly within the effective shift.
    const breaks = day.active
      ? day.breaks
          .map((b) => ({
            start_time: b.start_time > day.start_time ? b.start_time : day.start_time,
            end_time: b.end_time < day.end_time ? b.end_time : day.end_time,
          }))
          .filter((b) => b.start_time < b.end_time)
          .sort((a, b) => a.start_time.localeCompare(b.start_time))
      : [];
    const merged = [];
    for (const pause of breaks) {
      const last = merged.at(-1);
      if (last && pause.start_time <= last.end_time)
        last.end_time = last.end_time > pause.end_time ? last.end_time : pause.end_time;
      else merged.push({ ...pause });
    }
    return { ...day, breaks: merged };
  });
  return {
    days: schedule.days,
    effective,
    mode: schedule.settings.agenda_mode,
    services: await tx.all(
      'SELECT s.name,s.duration,s.active FROM barber_services b JOIN services s ON s.company_id=b.company_id AND s.id=b.service_id WHERE b.company_id=? AND b.barber_id=? ORDER BY s.name,s.id',
      [cid, pid],
    ),
  };
}
export function installProfessionalPanel(router, db, cid, { authenticated, updateStatus }) {
  router.use('/professional', authenticated, (req, _res, next) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
    next();
  });
  router.get('/professional/agenda', async (req, res) => {
    const options = listSchema.parse(req.query);
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await professionalAccess(tx, cid, req.user.id),
            now = await currentTime(tx),
            today = dateInTimezone(now, access.company.timezone);
          const from = options.from || today,
            to = addDays(from, options.view === 'week' ? 6 : 0);
          agendaDate.parse(to);
          const base = {
            ...access,
            today,
            now: now.toISOString(),
            from,
            to,
            view: options.view,
            page: options.page,
            pageSize: 30,
          };
          if (!access.professional)
            return {
              ...base,
              total: 0,
              items: [],
              summary: null,
              next: null,
              hours: null,
              blocks: [],
            };
          const pid = access.professional.id,
            where = ' AND a.date>=? AND a.date<=?' + (options.status ? ' AND a.status=?' : ''),
            args = [cid, pid, from, to, ...(options.status ? [options.status] : [])];
          const rows = await tx.all(
            selectOwn + where + ' ORDER BY a.date,a.start_minute,a.id LIMIT 30 OFFSET ?',
            [...args, (options.page - 1) * 30],
          );
          const total = Number(
            (
              await tx.get(
                'SELECT COUNT(*) AS n FROM appointments a WHERE a.company_id=? AND a.barber_id=?' +
                  where,
                args,
              )
            ).n,
          );
          const counts = await tx.all(
            'SELECT status,COUNT(*) AS n FROM appointments WHERE company_id=? AND barber_id=? AND date=? GROUP BY status',
            [cid, pid, today],
          );
          const local = Object.fromEntries(
            new Intl.DateTimeFormat('en', {
              timeZone: access.company.timezone,
              hour: '2-digit',
              minute: '2-digit',
              hourCycle: 'h23',
            })
              .formatToParts(now)
              .map((p) => [p.type, p.value]),
          );
          const next = await tx.get(
            selectOwn +
              " AND a.status='confirmed' AND (a.date>? OR (a.date=? AND a.end_minute>?)) ORDER BY a.date,a.start_minute,a.id LIMIT 1",
            [cid, pid, today, today, Number(local.hour) * 60 + Number(local.minute)],
          );
          return {
            ...base,
            total,
            items: await Promise.all(rows.map((row) => item(tx, cid, row, access, now))),
            summary: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])),
            next: next ? await item(tx, cid, next, access, now) : null,
            hours: await professionalHours(tx, cid, pid),
            blocks: await tx.all(
              'SELECT date,start_minute,end_minute FROM blocks WHERE company_id=? AND barber_id=? AND date>=? AND date<=? ORDER BY date,start_minute',
              [cid, pid, from, to],
            ),
          };
        },
        { readOnly: true },
      ),
    );
  });
  router.get('/professional/hours', async (req, res) => {
    if (Object.keys(req.query).length)
      domainError(400, 'INVALID_FILTER', 'Esta consulta não aceita filtros de profissional.');
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await professionalAccess(tx, cid, req.user.id);
          return {
            ...access,
            hours: access.professional
              ? await professionalHours(tx, cid, access.professional.id)
              : null,
          };
        },
        { readOnly: true },
      ),
    );
  });
  router.get('/professional/agenda/:id', async (req, res) =>
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await professionalAccess(tx, cid, req.user.id);
          if (!access.professional)
            domainError(409, 'PROFESSIONAL_ACCESS_UNAVAILABLE', access.message);
          const row = await tx.get(selectOwn + ' AND a.id=?', [
            cid,
            access.professional.id,
            String(req.params.id),
          ]);
          if (!row) domainError(404, 'APPOINTMENT_NOT_FOUND', 'Atendimento não encontrado.');
          return {
            item: await item(tx, cid, row, access, await currentTime(tx)),
            expected: ownFingerprint(row),
            timezone: access.company.timezone,
          };
        },
        { readOnly: true },
      ),
    ),
  );
  router.patch('/professional/agenda/:id/complete', async (req, res) => {
    await updateStatus(req, true, true);
    res.json({ ok: true });
  });
}
