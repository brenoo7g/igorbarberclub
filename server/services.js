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

export function installServiceRoutes(app, db, companyId, { onboarding = false } = {}) {
  requireCompanyId(companyId);
  const editable = onboarding
    ? serviceSchema.extend({ active: z.boolean() }).strict()
    : serviceSchema;
  app.get('/admin/services', async (_req, res) =>
    res.json(
      await db.all('SELECT * FROM services WHERE company_id=? ORDER BY name,id', [companyId]),
    ),
  );
  app.post('/admin/services', async (req, res) => {
    const { professionalIds, ...data } = (onboarding ? editable : serviceSchema)
        .extend({
          professionalIds: z
            .array(z.string().min(1))
            .max(100)
            .refine((ids) => new Set(ids).size === ids.length)
            .optional(),
        })
        .parse(req.body),
      id = randomUUID();
    const result = await db.transaction((tx) =>
      idempotent(
        tx,
        companyId,
        'service-create',
        requestKey(req),
        { professionalIds, ...data },
        async () => {
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
              onboarding ? Number(data.active) : 1,
            ],
          );
          for (const professionalId of professionals)
            await tx.run(
              'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
              [companyId, professionalId, id, new Date().toISOString()],
            );
          return { id, ...data, active: onboarding ? Number(data.active) : 1 };
        },
      ),
    );
    res.status(201).json(result);
  });
  app.put('/admin/services/:id', async (req, res) => {
    const data = editable.parse(req.body),
      id = String(req.params.id);
    await db.transaction(async (tx) => {
      await lockCatalog(tx, companyId);
      if (
        !(await tx.get(
          `SELECT id FROM services WHERE company_id=? AND id=?${onboarding ? '' : ' AND active=1'}`,
          [companyId, id],
        ))
      )
        fail(404, 'Serviço não encontrado.');
      await tx.run(
        'UPDATE services SET name=?,description=?,duration=?,price=?,category=? WHERE company_id=? AND id=?',
        [data.name, data.description, data.duration, data.price, data.category, companyId, id],
      );
      if (onboarding)
        await tx.run('UPDATE services SET active=? WHERE company_id=? AND id=?', [
          Number(data.active),
          companyId,
          id,
        ]);
    });
    res.json({ id, ...data, active: onboarding ? Number(data.active) : 1 });
  });
  app.delete('/admin/services/:id', async (req, res) => {
    await db.transaction(async (tx) => {
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
