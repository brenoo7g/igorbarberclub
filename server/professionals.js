import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireCompanyId } from './company-context.js';
import { lockBarbers, lockCatalog } from './scheduling-locks.js';
import {
  currentTime,
  domainError,
  lockEntitlements,
  requireProfessionalCapacity,
} from './entitlements.js';
import { dateInTimezone, isFuture } from './domain.js';
import { idempotent, requestKey } from './idempotency.js';
import { publicAsset } from './public-site.js';
import { availabilityStatus } from './professional-availability.js';
import {
  lockProfessionalAccess,
  setProfessionalLink,
  requireLinkOwner,
} from './professional-links.js';

const details = z
  .object({
    name: z.string().trim().min(2).max(100),
    specialty: z.string().trim().max(200).default(''),
    photo_url: z
      .union([
        z.literal(''),
        z
          .string()
          .max(2048)
          .refine((value) => Boolean(publicAsset(value)), 'Use uma URL HTTPS válida para a foto.'),
      ])
      .optional(),
    services: z
      .array(z.string().min(1).max(200))
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Não repita serviços.'),
    userId: z.string().min(1).max(200).nullable().optional(),
    confirmLink: z.literal(true).optional(),
    expectedUserId: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
const creation = details.extend({ active: z.boolean().default(true) });

// Shared by manual creation and invitation acceptance, inside the caller's transaction.
export async function insertProfessional(
  tx,
  companyId,
  { id, name, specialty = '', active = false },
) {
  await tx.run('INSERT INTO barbers(company_id,id,name,specialty,active) VALUES(?,?,?,?,?)', [
    companyId,
    id,
    name,
    specialty,
    active ? 1 : 0,
  ]);
  await tx.run(
    "INSERT INTO barber_settings(company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES(?,?,'manual',90,0)",
    [companyId, id],
  );
  for (let weekday = 0; weekday < 7; weekday++)
    await tx.run(
      "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,0,'09:00','19:00')",
      [companyId, id, weekday],
    );
}

export async function performsServices(db, companyId, barberId, ids) {
  requireCompanyId(companyId);
  if (!ids.length) return false;
  const rows = await db.all(
    `SELECT bs.service_id FROM barber_services bs JOIN barbers b ON b.company_id=bs.company_id AND b.id=bs.barber_id JOIN services s ON s.company_id=bs.company_id AND s.id=bs.service_id WHERE bs.company_id=? AND bs.barber_id=? AND b.active=1 AND s.active=1 AND bs.service_id IN (${ids.map(() => '?').join(',')})`,
    [companyId, barberId, ...ids],
  );
  return rows.length === ids.length;
}

export async function publicProfessionals(db, companyId, serviceId) {
  requireCompanyId(companyId);
  const rows = await db.all(
    'SELECT id,name,specialty,active,company_id,photo_url FROM barbers WHERE company_id=? AND active=1 ORDER BY id',
    [companyId],
  );
  const links = await db.all(
    'SELECT bs.barber_id,bs.service_id FROM barber_services bs JOIN services s ON s.id=bs.service_id AND s.company_id=bs.company_id WHERE bs.company_id=? AND s.active=1 ORDER BY bs.service_id',
    [companyId],
  );
  return rows
    .map((row) => ({
      ...row,
      photo_url: publicAsset(row.photo_url),
      service_ids: links.filter((link) => link.barber_id === row.id).map((link) => link.service_id),
    }))
    .filter((row) => serviceId === undefined || row.service_ids.includes(serviceId));
}

export async function professional(db, companyId, id) {
  const row = await db.get(
    'SELECT b.*,u.user_id FROM barbers b LEFT JOIN professional_users u ON u.company_id=b.company_id AND u.barber_id=b.id WHERE b.company_id=? AND b.id=?',
    [companyId, id],
  );
  if (!row) domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
  return {
    ...row,
    availability: await availabilityStatus(db, companyId, id),
    upcoming_appointments: await upcomingAppointments(db, companyId, id),
    services: (
      await db.all(
        'SELECT service_id FROM barber_services WHERE company_id=? AND barber_id=? ORDER BY service_id',
        [companyId, id],
      )
    ).map((s) => s.service_id),
  };
}

async function upcomingAppointments(db, companyId, id) {
  const { timezone } = await db.get('SELECT timezone FROM companies WHERE id=?', [companyId]);
  const now = await currentTime(db);
  const rows = await db.all(
    "SELECT date,end_minute FROM appointments WHERE company_id=? AND barber_id=? AND status='confirmed' AND date>=?",
    [companyId, id, dateInTimezone(now, timezone)],
  );
  return rows.filter((row) => isFuture(row.date, row.end_minute, now, timezone)).length;
}

async function replaceRelations(tx, companyId, id, data, actor) {
  for (const serviceId of data.services) {
    // Inactive catalog entries may remain associated, but never become bookable.
    if (
      !(await tx.get('SELECT id FROM services WHERE company_id=? AND id=?', [companyId, serviceId]))
    )
      domainError(400, 'INVALID_PROFESSIONAL_SERVICE', 'Serviço não pertence à empresa.');
  }
  if (data.userId) {
    const member = await tx.get(
      `SELECT user_id FROM company_members WHERE company_id=? AND user_id=? AND status='active' AND role IN ('owner','manager','professional')${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
      [companyId, data.userId],
    );
    if (!member)
      domainError(
        400,
        'INVALID_PROFESSIONAL_MEMBER',
        'Vincule somente um membro ativo desta empresa.',
      );
    const linked = await tx.get(
      'SELECT barber_id FROM professional_users WHERE company_id=? AND user_id=?',
      [companyId, data.userId],
    );
    if (linked && linked.barber_id !== id)
      domainError(
        409,
        'MEMBER_ALREADY_LINKED',
        'Este membro já está vinculado a outro profissional.',
      );
  }
  await tx.run('DELETE FROM barber_services WHERE company_id=? AND barber_id=?', [companyId, id]);
  for (const serviceId of data.services)
    await tx.run(
      'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
      [companyId, id, serviceId, new Date().toISOString()],
    );
  if (data.userId !== undefined) {
    const current =
      (
        await tx.get('SELECT user_id FROM professional_users WHERE company_id=? AND barber_id=?', [
          companyId,
          id,
        ])
      )?.user_id ?? null;
    if (current !== data.userId) {
      await requireLinkOwner(tx, companyId, actor);
      if (data.expectedUserId !== undefined && data.expectedUserId !== current)
        domainError(
          409,
          'PROFESSIONAL_LINK_CHANGED',
          'O vínculo mudou. Atualize antes de confirmar.',
        );
      if (current && (!data.confirmLink || data.expectedUserId === undefined))
        domainError(
          400,
          'LINK_CONFIRMATION_REQUIRED',
          'Confirme a alteração e informe a conta vinculada atual.',
        );
      if (current)
        await setProfessionalLink(tx, companyId, actor, current, null, {
          expected: id,
          confirm: true,
          professionalRole: false,
        });
      if (data.userId)
        await setProfessionalLink(tx, companyId, actor, data.userId, id, {
          professionalRole: false,
        });
    }
  }
}

export function installProfessionalRoutes(
  app,
  db,
  companyId,
  { requireCapacity = requireProfessionalCapacity, authorize = async () => {} } = {},
) {
  requireCompanyId(companyId);
  // Installed only after the router's authenticated owner/manager middleware.
  app.get('/admin/professionals', async (req, res) => {
    res.json(
      await db.transaction(
        async (tx) => {
          await authorize(tx, req, false);
          const rows = await tx.all('SELECT id FROM barbers WHERE company_id=? ORDER BY name,id', [
            companyId,
          ]);
          const result = [];
          for (const row of rows) result.push(await professional(tx, companyId, row.id));
          return result;
        },
        { readOnly: true },
      ),
    );
  });
  app.get('/admin/professionals/:id', async (req, res) =>
    res.json(
      await db.transaction(
        async (tx) => {
          await authorize(tx, req, false);
          return professional(tx, companyId, String(req.params.id));
        },
        { readOnly: true },
      ),
    ),
  );
  app.post('/admin/professionals', async (req, res) => {
    const data = creation.parse(req.body),
      key = requestKey(req);
    const result = await db.transaction(async (tx) => {
      await authorize(tx, req, false);
      if (data.userId !== undefined) await lockProfessionalAccess(tx, companyId);
      return idempotent(tx, companyId, 'professional-create', key, data, async () => {
        await authorize(tx, req, true);
        const id = randomUUID();
        await lockEntitlements(tx, companyId);
        await requireCapacity(tx, companyId, data.active ? 1 : 0);
        await lockCatalog(tx, companyId, true);
        await insertProfessional(tx, companyId, { id, ...data });
        await replaceRelations(tx, companyId, id, data, req.user.id);
        if (data.photo_url !== undefined)
          await tx.run('UPDATE barbers SET photo_url=? WHERE company_id=? AND id=?', [
            publicAsset(data.photo_url),
            companyId,
            id,
          ]);
        return professional(tx, companyId, id);
      });
    });
    res.status(201).json(result);
  });
  app.put('/admin/professionals/:id', async (req, res) => {
    const data = details.parse(req.body),
      id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      await authorize(tx, req, true);
      if (data.userId !== undefined) await lockProfessionalAccess(tx, companyId);
      await lockEntitlements(tx, companyId); // Serializes optional member links as well as mutations.
      await lockCatalog(tx, companyId, true);
      await lockBarbers(tx, companyId, id);
      await professional(tx, companyId, id);
      await replaceRelations(tx, companyId, id, data, req.user.id);
      if (data.photo_url !== undefined)
        await tx.run('UPDATE barbers SET photo_url=? WHERE company_id=? AND id=?', [
          publicAsset(data.photo_url),
          companyId,
          id,
        ]);
      await tx.run('UPDATE barbers SET name=?,specialty=? WHERE company_id=? AND id=?', [
        data.name,
        data.specialty,
        companyId,
        id,
      ]);
      return professional(tx, companyId, id);
    });
    res.json(result);
  });
  app.patch('/admin/professionals/:id/status', async (req, res) => {
    const { active, expectedUpcoming } = z
        .object({
          active: z.boolean(),
          expectedUpcoming: z.number().int().nonnegative().optional(),
        })
        .strict()
        .parse(req.body),
      id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      await authorize(tx, req, true);
      await lockEntitlements(tx, companyId);
      await lockBarbers(tx, companyId, id);
      const before = await professional(tx, companyId, id);
      // The management confirmation includes the count it displayed. The same lock is
      // used by bookings; a new/cancelled reservation invalidates a stale confirmation.
      // Legacy requests without the count retain their existing non-destructive behavior.
      if (
        !active &&
        expectedUpcoming !== undefined &&
        expectedUpcoming !== before.upcoming_appointments
      )
        domainError(
          409,
          'PROFESSIONAL_APPOINTMENTS_CHANGED',
          'As reservas deste profissional mudaram. Atualize os cadastros e confirme novamente.',
        );
      if (active && before.active !== 1) await requireCapacity(tx, companyId, 1);
      await tx.run('UPDATE barbers SET active=? WHERE company_id=? AND id=?', [
        active ? 1 : 0,
        companyId,
        id,
      ]);
      return professional(tx, companyId, id);
    });
    res.json(result);
  });
}
