import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { lockCatalog } from './scheduling-locks.js';
import { getLegacyCompanyId, requireCompanyId } from './company-context.js';
import { idempotent, requestKey } from './idempotency.js';
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(250),
  duration: z.number().int().min(10).max(480),
  price: z.number().int().min(0).max(1000000),
  category: z.string().trim().min(2).max(40),
});

export function installServiceRoutes(
  app,
  db,
  companyId,
  { onboarding = false, authorize = async () => {} } = {},
) {
  requireCompanyId(companyId);
  const editable = onboarding
    ? serviceSchema.extend({ active: z.boolean() }).strict()
    : serviceSchema.extend({
        active: z
          .union([z.boolean(), z.literal(0), z.literal(1)])
          .transform(Boolean)
          .optional(),
        professionalIds: z
          .array(z.string().min(1))
          .max(100)
          .refine((ids) => new Set(ids).size === ids.length)
          .optional(),
      });
  app.get('/admin/services', async (req, res) =>
    res.json(
      await db.transaction(
        async (tx) => {
          await authorize(tx, req, false);
          return tx.all('SELECT * FROM services WHERE company_id=? ORDER BY name,id', [companyId]);
        },
        { readOnly: true },
      ),
    ),
  );
  app.post('/admin/services', async (req, res) => {
    const { professionalIds, ...data } = editable
        .extend({
          professionalIds: z
            .array(z.string().min(1))
            .max(100)
            .refine((ids) => new Set(ids).size === ids.length)
            .optional(),
        })
        .parse(req.body),
      id = randomUUID();
    const result = await db.transaction(async (tx) => {
      await authorize(tx, req, false);
      return idempotent(
        tx,
        companyId,
        'service-create',
        requestKey(req),
        { professionalIds, ...data },
        async () => {
          await authorize(tx, req, true);
          await lockCatalog(tx, companyId);
          const professionals =
            professionalIds ??
            (companyId === getLegacyCompanyId()
              ? (
                  await tx.all('SELECT id FROM barbers WHERE company_id=? AND active=1', [
                    companyId,
                  ])
                ).map((b) => b.id)
              : []);
          for (const professionalId of professionals)
            if (
              !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=?', [
                companyId,
                professionalId,
              ]))
            )
              fail(400, 'Profissional não pertence à empresa.');
          await tx.run(
            `INSERT INTO services (company_id,id,name,description,duration,price,category,active) VALUES (?,?,?,?,?,?,?,?)`,
            [
              companyId,
              id,
              data.name,
              data.description,
              data.duration,
              data.price,
              data.category,
              data.active === undefined ? 1 : Number(data.active),
            ],
          );
          for (const professionalId of professionals)
            await tx.run(
              'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
              [companyId, professionalId, id, new Date().toISOString()],
            );
          return { id, ...data, active: data.active === undefined ? 1 : Number(data.active) };
        },
      );
    });
    res.status(201).json(result);
  });
  app.put('/admin/services/:id', async (req, res) => {
    const data = editable.parse(req.body),
      id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      await authorize(tx, req, true);
      await lockCatalog(tx, companyId);
      if (!(await tx.get('SELECT id FROM services WHERE company_id=? AND id=?', [companyId, id])))
        fail(404, 'Serviço não encontrado.');
      await tx.run(
        'UPDATE services SET name=?,description=?,duration=?,price=?,category=? WHERE company_id=? AND id=?',
        [data.name, data.description, data.duration, data.price, data.category, companyId, id],
      );
      if (data.active !== undefined)
        await tx.run('UPDATE services SET active=? WHERE company_id=? AND id=?', [
          Number(data.active),
          companyId,
          id,
        ]);
      if (data.professionalIds !== undefined) {
        for (const professionalId of data.professionalIds)
          if (
            !(await tx.get('SELECT id FROM barbers WHERE company_id=? AND id=?', [
              companyId,
              professionalId,
            ]))
          )
            fail(400, 'Profissional não pertence à empresa.');
        await tx.run('DELETE FROM barber_services WHERE company_id=? AND service_id=?', [
          companyId,
          id,
        ]);
        for (const professionalId of data.professionalIds)
          await tx.run(
            'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
            [companyId, professionalId, id, new Date().toISOString()],
          );
      }
      return tx.get('SELECT * FROM services WHERE company_id=? AND id=?', [companyId, id]);
    });
    res.json(result);
  });
  app.patch('/admin/services/:id/status', async (req, res) => {
    const { active } = z.object({ active: z.boolean() }).strict().parse(req.body);
    const id = String(req.params.id);
    const result = await db.transaction(async (tx) => {
      await authorize(tx, req, true);
      await lockCatalog(tx, companyId);
      if (!(await tx.get('SELECT id FROM services WHERE company_id=? AND id=?', [companyId, id])))
        fail(404, 'Serviço não encontrado.');
      // A status change must not overwrite details from an outdated form/list snapshot.
      await tx.run('UPDATE services SET active=? WHERE company_id=? AND id=?', [
        Number(active),
        companyId,
        id,
      ]);
      return tx.get('SELECT * FROM services WHERE company_id=? AND id=?', [companyId, id]);
    });
    res.json(result);
  });
  app.delete('/admin/services/:id', async (req, res) => {
    await db.transaction(async (tx) => {
      await authorize(tx, req, true);
      await lockCatalog(tx, companyId);
      if (
        !(await tx.get('SELECT id FROM services WHERE company_id=? AND id=? AND active=1', [
          companyId,
          String(req.params.id),
        ]))
      )
        fail(404, 'Serviço não encontrado.');
      await tx.run('UPDATE services SET active=0 WHERE company_id=? AND id=?', [
        companyId,
        String(req.params.id),
      ]);
    });
    res.json({ ok: true });
  });
}
