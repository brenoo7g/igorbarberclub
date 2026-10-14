import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { agendaAccess } from './agenda.js';
import { requireCompanyId } from './company-context.js';
import { domainError, currentTime, getPlanCatalog } from './entitlements.js';
import { lockResource } from './scheduling-locks.js';
import { idempotent, requestKey } from './idempotency.js';
import { dateInTimezone, clock } from './domain.js';

export const clientSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    phone: z
      .string()
      .transform((p) => p.replace(/\D/g, ''))
      .pipe(z.string().min(8).max(20)),
    email: z
      .string()
      .trim()
      .pipe(z.union([z.email().max(200), z.literal('')]))
      .optional()
      .transform((e) => e?.toLowerCase() || null),
    notes: z.string().trim().max(1000).default(''),
  })
  .strict();
const paging = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    q: z.string().trim().max(100).default(''),
  })
  .strict();
export async function findClient(tx, cid, id) {
  requireCompanyId(cid);
  const client = await tx.get('SELECT * FROM company_clients WHERE company_id=? AND id=?', [
    cid,
    id,
  ]);
  if (!client) domainError(404, 'CLIENT_NOT_FOUND', 'Cliente não encontrado nesta empresa.');
  return client;
}
// Called inside the existing booking transaction. Identity comes from a stable account/session
// or an explicit company client. Never merge unrelated people by phone/name/email.
export async function linkAppointmentClient(
  tx,
  cid,
  id,
  { clientId = undefined, userId, visitorId, contact },
) {
  requireCompanyId(cid);
  let client = clientId ? await findClient(tx, cid, clientId) : null;
  if (!client) {
    const kind = userId ? 'user' : visitorId ? 'visitor' : 'reservation',
      source = userId || visitorId || id;
    await lockResource(tx, cid, 'client-identity', kind + ':' + source);
    client = await tx.get(
      'SELECT * FROM company_clients WHERE company_id=? AND source_kind=? AND source_id=?',
      [cid, kind, source],
    );
    if (!client) {
      const stamp = new Date().toISOString(),
        newId = randomUUID();
      await tx.run(
        'INSERT INTO company_clients(id,company_id,name,phone,email,source_kind,source_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          newId,
          cid,
          contact.name || 'Cliente sem nome',
          contact.phone || 'não informado',
          contact.email || null,
          kind,
          source,
          stamp,
          stamp,
        ],
      );
      client = await findClient(tx, cid, newId);
    }
  }
  await tx.run(
    'INSERT INTO client_appointments(company_id,client_id,appointment_id) VALUES(?,?,?) ON CONFLICT(company_id,appointment_id) DO NOTHING',
    [cid, client.id, id],
  );
  return client.id;
}
// Covers legacy imports/seed reservations created after the versioned migration. Scoped,
// idempotent, and run only after management authorization. Ordinary bookings link atomically.
export async function ensureCompanyClients(tx, cid) {
  const rows = await tx.all(
    'SELECT a.*,u.name AS account_name,u.email AS account_email,u.phone AS account_phone,g.visitor_id FROM appointments a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN guest_appointments g ON g.company_id=a.company_id AND g.appointment_id=a.id WHERE a.company_id=? AND NOT EXISTS(SELECT 1 FROM client_appointments ca WHERE ca.company_id=a.company_id AND ca.appointment_id=a.id) ORDER BY a.created_at,a.id',
    [cid],
  );
  for (const a of rows)
    await linkAppointmentClient(tx, cid, a.id, {
      userId: a.user_id,
      visitorId: a.visitor_id,
      contact: {
        name: a.guest_name || a.account_name,
        phone: a.guest_phone || a.account_phone,
        email: a.guest_email || a.account_email,
      },
    });
}
export function installClientRoutes(router, db, cid, { appointmentList }) {
  router.get('/admin/management', async (req, res) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await agendaAccess(tx, cid, req.user.id);
          return {
            company: access.company,
            editable: access.editable,
            entitlement: access.entitlement,
            plan:
              (await getPlanCatalog(tx)).find((p) => p.code === access.entitlement.planCode) ||
              null,
          };
        },
        { readOnly: true },
      ),
    );
  });
  router.use('/admin/clients', (req, _res, next) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
    next();
  });
  router.get('/admin/clients', async (req, res) => {
    const { page, q } = paging.parse(req.query);
    res.json(
      await db.transaction(async (tx) => {
        const access = await agendaAccess(tx, cid, req.user.id);
        await ensureCompanyClients(tx, cid);
        // Treat wildcard characters literally; phone search accepts formatted numbers.
        const pattern = '%' + q.toLowerCase().replace(/[!%_]/g, (c) => '!' + c) + '%',
          digits = q.replace(/\D/g, '');
        const where =
          "company_id=? AND (lower(name) LIKE ? ESCAPE '!' OR lower(COALESCE(email,'')) LIKE ? ESCAPE '!' OR phone LIKE ? ESCAPE '!')";
        const args = [
          cid,
          pattern,
          pattern,
          '%' + (digits || q).replace(/[!%_]/g, (c) => '!' + c) + '%',
        ];
        const total = Number(
          (await tx.get('SELECT COUNT(*) AS n FROM company_clients WHERE ' + where, args)).n,
        );
        const items = await tx.all(
          'SELECT id,name,phone,email,version FROM company_clients WHERE ' +
            where +
            ' ORDER BY name,id LIMIT 30 OFFSET ?',
          [...args, (page - 1) * 30],
        );
        return { items, total, page, pageSize: 30, editable: access.editable };
      }),
    );
  });
  router.get('/admin/clients/:id', async (req, res) => {
    const { page, status } = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        status: z.enum(['confirmed', 'completed', 'cancelled', 'no-show']).optional(),
      })
      .strict()
      .parse(req.query);
    res.json(
      await db.transaction(async (tx) => {
        const access = await agendaAccess(tx, cid, req.user.id);
        await ensureCompanyClients(tx, cid);
        const client = await findClient(tx, cid, String(req.params.id));
        const where =
          'a.id IN (SELECT appointment_id FROM client_appointments WHERE company_id=? AND client_id=?)' +
          (status ? ' AND a.status=?' : '');
        const args = [cid, client.id, ...(status ? [status] : [])];
        const total = Number(
          (
            await tx.get(
              'SELECT COUNT(*) AS n FROM appointments a WHERE a.company_id=? AND ' + where,
              [cid, ...args],
            )
          ).n,
        );
        const now = await currentTime(tx),
          today = dateInTimezone(now, access.company.timezone),
          time = new Intl.DateTimeFormat('en-GB', {
            timeZone: access.company.timezone,
            hourCycle: 'h23',
            hour: '2-digit',
            minute: '2-digit',
          }).format(now);
        const next = await appointmentList(
          cid,
          "a.status='confirmed' AND (a.date>? OR (a.date=? AND a.start_minute>?)) AND a.id IN (SELECT appointment_id FROM client_appointments WHERE company_id=? AND client_id=?)",
          [today, today, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), cid, client.id],
          tx,
          { limit: 1, offset: 0 },
        );
        const minimize = (a) => ({
          id: a.id,
          date: a.date,
          time: clock(a.start_minute),
          professionalName: a.barber_name,
          status: a.status,
          totalCents: a.total,
          services: a.services.map((s) => s.name),
        });
        return {
          timezone: access.company.timezone,
          client: {
            id: client.id,
            name: client.name,
            phone: client.phone,
            email: client.email,
            notes: client.notes,
            version: client.version,
            created_at: client.created_at,
          },
          editable: access.editable,
          history: (
            await appointmentList(cid, where, args, tx, { limit: 30, offset: (page - 1) * 30 })
          ).map(minimize),
          next: next[0] ? minimize(next[0]) : null,
          total,
          page,
          pageSize: 30,
        };
      }),
    );
  });
  router.post('/admin/clients', async (req, res) => {
    const data = clientSchema.parse(req.body),
      key = requestKey(req);
    const result = await db.transaction(async (tx) => {
      await agendaAccess(tx, cid, req.user.id);
      return idempotent(tx, cid, 'client-create', key, data, async () => {
        await agendaAccess(tx, cid, req.user.id, true);
        await lockResource(tx, cid, 'clients', 'catalog');
        const duplicate = await tx.get(
          "SELECT id FROM company_clients WHERE company_id=? AND lower(name)=lower(?) AND phone=? AND COALESCE(email,'')=?",
          [cid, data.name, data.phone, data.email || ''],
        );
        if (duplicate)
          domainError(
            409,
            'CLIENT_ALREADY_EXISTS',
            'Já existe um cliente com estes mesmos dados. Localize o cadastro antes de continuar.',
          );
        const id = randomUUID(),
          stamp = new Date().toISOString();
        await tx.run(
          "INSERT INTO company_clients(id,company_id,name,phone,email,notes,source_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,'manual',?,?)",
          [id, cid, data.name, data.phone, data.email, data.notes, stamp, stamp],
        );
        return { id, ...data, version: 0 };
      });
    });
    res.status(201).json(result);
  });
  router.put('/admin/clients/:id', async (req, res) => {
    const { version, ...data } = clientSchema
        .extend({ version: z.number().int().nonnegative() })
        .parse(req.body),
      id = String(req.params.id);
    await db.transaction(async (tx) => {
      await agendaAccess(tx, cid, req.user.id, true);
      await lockResource(tx, cid, 'clients', 'catalog');
      const before = await findClient(tx, cid, id);
      if (before.version !== version)
        domainError(
          409,
          'CLIENT_CHANGED',
          'O cadastro foi alterado em outra aba. Atualize antes de salvar.',
        );
      await tx.run(
        'UPDATE company_clients SET name=?,phone=?,email=?,notes=?,version=version+1,updated_at=? WHERE company_id=? AND id=?',
        [data.name, data.phone, data.email, data.notes, new Date().toISOString(), cid, id],
      );
    });
    res.json({ id, ...data, version: version + 1 });
  });
}
