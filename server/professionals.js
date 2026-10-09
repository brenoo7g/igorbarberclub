import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireCompanyId } from './company-context.js';
import { lockBarbers, lockCatalog } from './scheduling-locks.js';
import { domainError, lockEntitlements, requireProfessionalCapacity } from './entitlements.js';
import { idempotent, requestKey } from './idempotency.js';
import { publicAsset } from './public-site.js';

const details = z
  .object({
    name: z.string().trim().min(2).max(100),
    specialty: z.string().trim().max(200).default(''),
    services: z
      .array(z.string().min(1).max(200))
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Não repita serviços.'),
    userId: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
const creation = details.extend({ active: z.boolean().default(true) });

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

async function professional(db, companyId, id) {
  const row = await db.get(
    'SELECT b.*,u.user_id FROM barbers b LEFT JOIN professional_users u ON u.company_id=b.company_id AND u.barber_id=b.id WHERE b.company_id=? AND b.id=?',
    [companyId, id],
  );
  if (!row) domainError(404, 'PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.');
  return {
    ...row,
    services: (
      await db.all(
        'SELECT service_id FROM barber_services WHERE company_id=? AND barber_id=? ORDER BY service_id',
        [companyId, id],
      )
    ).map((s) => s.service_id),
  };
}

async function replaceRelations(tx, companyId, id, data) {
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
    await tx.run('DELETE FROM professional_users WHERE company_id=? AND barber_id=?', [
      companyId,
      id,
    ]);
    if (data.userId)
      await tx.run(
        'INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES(?,?,?,?)',
        [companyId, id, data.userId, new Date().toISOString()],
      );
  }
}

export function installProfessionalRoutes(app, db, companyId) {
  requireCompanyId(companyId);
  // Installed only after the router's authenticated owner/manager middleware.
  app.get('/admin/professionals', async (_req, res) => {
    const rows = await db.all('SELECT id FROM barbers WHERE company_id=? ORDER BY name,id', [
      companyId,
    ]);
    res.json(await Promise.all(rows.map((row) => professional(db, companyId, row.id))));
  });
  app.get('/admin/professionals/:id', async (req, res) =>
    res.json(await professional(db, companyId, String(req.params.id))),
  );
  app.post('/admin/professionals', async (req, res) => {
    const data = creation.parse(req.body),
      key = requestKey(req);
    const result = await db.transaction((tx) =>
      idempotent(tx, companyId, 'professional-create', key, data, async () => {
        const id = randomUUID();
        await lockEntitlements(tx, companyId);
        await requireProfessionalCapacity(tx, companyId, data.active ? 1 : 0);
        await lockCatalog(tx, companyId, true);
        await tx.run('INSERT INTO barbers(company_id,id,name,specialty,active) VALUES(?,?,?,?,?)', [
          companyId,
          id,
          data.name,
          data.specialty,
          data.active ? 1 : 0,
        ]);
        await replaceRelations(tx, companyId, id, data);
        // Explicitly closed, even though legacy professionals retain their historical defaults.
        await tx.run(
          "INSERT INTO barber_settings(company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES(?,?,'manual',90,0)",
          [companyId, id],
        );
        for (let weekday = 0; weekday < 7; weekday++)
          await tx.run(
            "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,0,'09:00','19:00')",
            [companyId, id, weekday],
          );
        return professional(tx, companyId, id);
      }),
    );
    res.status(201).json(result);
  });
  app.put('/admin/professionals/:id', async (req, res) => {
    const data = details.parse(req.body),
      id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      await lockEntitlements(tx, companyId); // Serializes optional member links as well as mutations.
      await lockCatalog(tx, companyId, true);
      await lockBarbers(tx, companyId, id);
      await professional(tx, companyId, id);
      await replaceRelations(tx, companyId, id, data);
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
    const { active } = z.object({ active: z.boolean() }).strict().parse(req.body),
      id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      await lockEntitlements(tx, companyId);
      await lockBarbers(tx, companyId, id);
      const before = await professional(tx, companyId, id);
      if (active && before.active !== 1) await requireProfessionalCapacity(tx, companyId, 1);
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
