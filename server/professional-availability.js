import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { resolveCompanyContext } from './company-access.js';
import { agendaCompanyState, agendaDate } from './agenda.js';
import { currentTime, domainError, lockEntitlements } from './entitlements.js';
import { lockProfessionalAccess } from './professional-links.js';
import { lockBarbers } from './scheduling-locks.js';
import { readSchedule, saveSchedule, settingsSchema } from './schedule.js';
import { intersectDay, lockOperational, readPolicies } from './operational-settings.js';
import { fitsWorkingDay, minutes } from './schedule-domain.js';
import { dateInTimezone, isFuture, weekday, addDays } from './domain.js';
import { idempotent, requestKey } from './idempotency.js';

export const ownAgendaPath = (cid, configure = false) =>
  '/app/minha-agenda' + (configure ? '/configurar' : '') + '?empresa=' + encodeURIComponent(cid);

function hasWorkingTime(day) {
  if (!day.active) return false;
  let cursor = day.start_time;
  for (const pause of [...day.breaks].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    if (pause.end_time <= cursor) continue;
    if (pause.start_time >= day.end_time) break;
    if (pause.start_time > cursor) return true;
    cursor = pause.end_time;
  }
  return cursor < day.end_time;
}

// Inspect persisted rows, not readSchedule's legacy fallback. An intentionally
// closed/incomplete draft cannot be mistaken for a configured weekly routine.
export async function availabilityStatus(tx, cid, pid) {
  const schedule = await readSchedule(tx, cid, pid);
  const count = await tx.get(
    'SELECT COUNT(*) AS n FROM barber_working_hours WHERE company_id=? AND barber_id=?',
    [cid, pid],
  );
  const configured =
    Number(count.n) === 7 &&
    settingsSchema.safeParse({ ...schedule.settings, days: schedule.days }).success;
  const p = await tx.get('SELECT active FROM barbers WHERE company_id=? AND id=?', [cid, pid]);
  const services = await tx.get(
    'SELECT COUNT(*) AS n FROM barber_services b JOIN services s ON s.company_id=b.company_id AND s.id=b.service_id WHERE b.company_id=? AND b.barber_id=? AND s.active=1',
    [cid, pid],
  );
  const pending = [];
  if (!configured) pending.push('Configure seus dias, horários e intervalos.');
  if (!Number(services.n)) pending.push('Peça à gestão para associar seus serviços.');
  if (p.active !== 1) pending.push('Peça à gestão para autorizar sua ativação.');
  const policies = await readPolicies(tx, cid);
  if (!policies.online_booking_enabled)
    pending.push('Os agendamentos online estão pausados pelo estabelecimento.');
  const effective = schedule.days.map((d) =>
    intersectDay(d, policies, addDays('2026-10-11', d.weekday)),
  );
  if (configured && !effective.some(hasWorkingTime))
    pending.push('Confira sua rotina com os horários atuais do estabelecimento.');
  const business = await agendaCompanyState(tx, cid).catch((error) => {
    if (error.code !== 'ONBOARDING_INCOMPLETE') throw error;
    return { editable: false };
  });
  if (!business.editable)
    pending.push(
      'Peça à gestão para concluir a configuração ou verificar a assinatura do estabelecimento.',
    );
  if (configured && schedule.settings.agenda_mode === 'manual' && !schedule.released_weeks.length)
    pending.push('A gestão precisa liberar um período ou você pode habilitar a rotina automática.');
  return {
    configured,
    active: p.active === 1,
    servicesAssigned: Number(services.n) > 0,
    state: !configured ? 'setup' : pending.length ? 'waiting' : 'ready',
    pending,
    nextPath: ownAgendaPath(cid, !configured),
  };
}

async function access(tx, cid, actor, write = false) {
  const context = await resolveCompanyContext(tx, { id: actor }, cid);
  if (context.role !== 'professional')
    domainError(
      403,
      'PROFESSIONAL_ROLE_REQUIRED',
      'Esta área é exclusiva do profissional nesta empresa.',
    );
  const business = await agendaCompanyState(tx, cid, write);
  const professional = await tx.get(
    'SELECT b.id,b.name,b.active FROM professional_users u JOIN barbers b ON b.company_id=u.company_id AND b.id=u.barber_id WHERE u.company_id=? AND u.user_id=?',
    [cid, actor],
  );
  if (!professional)
    domainError(
      409,
      'PROFESSIONAL_LINK_REQUIRED',
      'Peça ao proprietário para vincular sua conta ao cadastro profissional.',
    );
  return { ...business, professional };
}

async function snapshot(tx, cid, actor) {
  const own = await access(tx, cid, actor),
    schedule = await readSchedule(tx, cid, own.professional.id),
    policies = await readPolicies(tx, cid),
    status = await availabilityStatus(tx, cid, own.professional.id);
  return {
    company: own.company,
    professional: own.professional,
    editable: own.editable,
    status,
    settings: schedule.settings,
    days: schedule.days,
    policies: {
      version: policies.version,
      working_days: policies.working_days,
      maximum_booking_days: policies.maximum_booking_days,
      online_booking_enabled: policies.online_booking_enabled,
    },
    today: dateInTimezone(await currentTime(tx), own.company.timezone),
    blocks: await tx.all(
      'SELECT b.id,b.date,b.start_minute,b.end_minute FROM professional_personal_blocks p JOIN blocks b ON b.company_id=p.company_id AND b.id=p.block_id WHERE p.company_id=? AND p.user_id=? AND b.barber_id=? AND b.date>=? ORDER BY b.date,b.start_minute LIMIT 100',
      [
        cid,
        actor,
        own.professional.id,
        dateInTimezone(await currentTime(tx), own.company.timezone),
      ],
    ),
  };
}

const ownSchema = z
  .object({
    version: z.number().int().nonnegative(),
    operational_version: z.number().int().nonnegative(),
    agenda_mode: z.enum(['auto', 'manual']),
    days: z.array(z.unknown()).length(7),
  })
  .strict();

function validateCompanyDays(days, policies) {
  if (!policies.working_days) return; // Legacy companies may have only individual schedules.
  for (const d of days.filter((d) => d.active)) {
    const c = policies.working_days.find((c) => c.weekday === d.weekday);
    if (!c?.active || d.start_time < c.start_time || d.end_time > c.end_time)
      domainError(
        400,
        'OUTSIDE_COMPANY_HOURS',
        'Seus dias e horários devem ficar dentro do expediente do estabelecimento.',
      );
    // Company pauses are applied by the booking engine even if not copied to the personal routine.
    const effective = intersectDay(d, policies, addDays('2026-10-11', d.weekday));
    if (!hasWorkingTime(effective))
      domainError(400, 'NO_WORKING_TIME', 'Os intervalos não podem ocupar todo o expediente.');
  }
}

export function installProfessionalAvailability(router, db, cid) {
  router.get('/professional/availability', async (req, res) => {
    if (Object.keys(req.query).length)
      domainError(400, 'INVALID_FILTER', 'Esta consulta usa somente o seu cadastro vinculado.');
    res.json(await db.transaction((tx) => snapshot(tx, cid, req.user.id), { readOnly: true }));
  });
  async function write(req, operation, payload, perform) {
    const key = requestKey(req);
    return db.transaction(async (tx) => {
      await lockProfessionalAccess(tx, cid, true);
      await lockEntitlements(tx, cid);
      await lockOperational(tx, cid, true);
      const own = await access(tx, cid, req.user.id, true);
      return idempotent(
        tx,
        cid,
        operation,
        key,
        { ...payload, professionalId: own.professional.id },
        async () => {
          await lockBarbers(tx, cid, own.professional.id);
          return perform(tx, own);
        },
      );
    });
  }
  router.put('/professional/availability', async (req, res) => {
    const body = ownSchema.parse(req.body);
    res.json(
      await write(req, 'own-availability-save', body, async (tx, own) => {
        const policies = await readPolicies(tx, cid);
        if (policies.version !== body.operational_version)
          domainError(
            409,
            'COMPANY_HOURS_CHANGED',
            'O expediente do estabelecimento mudou. Atualize antes de salvar.',
          );
        const current = await readSchedule(tx, cid, own.professional.id);
        const data = settingsSchema.parse({
          version: body.version,
          agenda_mode: body.agenda_mode,
          max_days_ahead: current.settings.max_days_ahead,
          days: body.days,
        });
        validateCompanyDays(data.days, policies);
        await saveSchedule(tx, cid, own.professional.id, data, policies);
        return {
          ok: true,
          nextPath: ownAgendaPath(cid),
          status: await availabilityStatus(tx, cid, own.professional.id),
        };
      }),
    );
  });
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  router.post('/professional/blocks', async (req, res) => {
    const data = z
      .object({
        date: agendaDate,
        start: time,
        end: time,
        reason: z.string().trim().max(150).default('Pausa pessoal'),
      })
      .strict()
      .parse(req.body);
    const result = await write(req, 'own-block-create', data, async (tx, own) => {
      const policies = await readPolicies(tx, cid),
        schedule = await readSchedule(tx, cid, own.professional.id),
        day = intersectDay(
          schedule.days.find((d) => d.weekday === weekday(data.date)),
          policies,
          data.date,
        ),
        now = await currentTime(tx),
        start = minutes(data.start),
        end = minutes(data.end);
      if (
        data.date > addDays(dateInTimezone(now, own.company.timezone), 730) ||
        !isFuture(data.date, start, now, own.company.timezone) ||
        !fitsWorkingDay(day, start, end)
      )
        domainError(
          400,
          'INVALID_PERSONAL_BLOCK',
          'Escolha um intervalo futuro dentro do seu expediente, fora das pausas recorrentes.',
        );
      const occupied = await tx.all(
        "SELECT start_minute,end_minute FROM appointments WHERE company_id=? AND barber_id=? AND date=? AND status IN ('confirmed','completed') UNION ALL SELECT start_minute,end_minute FROM blocks WHERE company_id=? AND barber_id=? AND date=?",
        [cid, own.professional.id, data.date, cid, own.professional.id, data.date],
      );
      if (occupied.some((a) => start < a.end_minute && end > a.start_minute))
        domainError(
          409,
          'PERSONAL_BLOCK_CONFLICT',
          'Há um atendimento ou bloqueio nesse intervalo. Escolha outro horário.',
        );
      const id = randomUUID();
      await tx.run(
        'INSERT INTO blocks(company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES(?,?,?,?,?,?,?)',
        [cid, id, own.professional.id, data.date, start, end, data.reason],
      );
      await tx.run(
        'INSERT INTO professional_personal_blocks(company_id,block_id,user_id) VALUES(?,?,?)',
        [cid, id, req.user.id],
      );
      return { id };
    });
    res.status(201).json(result);
  });
  router.delete('/professional/blocks/:id', async (req, res) => {
    if (Object.keys(req.body || {}).length || Object.keys(req.query).length)
      domainError(400, 'INVALID_FILTER', 'Informe somente o bloqueio que deseja remover.');
    await write(req, 'own-block-create', { delete: String(req.params.id) }, async (tx, own) => {
      const row = await tx.get(
        'SELECT b.id FROM professional_personal_blocks p JOIN blocks b ON b.company_id=p.company_id AND b.id=p.block_id WHERE p.company_id=? AND p.block_id=? AND p.user_id=? AND b.barber_id=?',
        [cid, String(req.params.id), req.user.id, own.professional.id],
      );
      if (!row)
        domainError(
          404,
          'PERSONAL_BLOCK_NOT_FOUND',
          'Bloqueio pessoal não encontrado. Bloqueios da gestão só podem ser removidos pela gestão.',
        );
      await tx.run('DELETE FROM blocks WHERE company_id=? AND id=?', [cid, row.id]);
      return { ok: true };
    });
    res.json({ ok: true });
  });
}
