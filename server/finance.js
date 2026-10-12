import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { agendaAccess, agendaDate } from './agenda.js';
import { appointmentTotals, companyClock, dashboardPeriod, metricInteger } from './dashboard.js';
import { currentTime, domainError } from './entitlements.js';
import { idempotent, requestKey } from './idempotency.js';
import { lockAppointment, lockResource } from './scheduling-locks.js';
import { financialTotals } from './financial-ledger.js';

const amount = z.number().int().min(1).max(100000000);
const notes = z.string().trim().max(1000).default('');
const reason = z.string().trim().min(3).max(1000);
const version = z.number().int().nonnegative();
const localSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/)
  .refine((v) => agendaDate.safeParse(v.slice(0, 10)).success, 'Informe data e horário válidos.');
const method = z.enum(['pix', 'cash', 'debit', 'credit', 'transfer', 'other']);
const category = z.enum([
  'rent',
  'materials',
  'products',
  'equipment',
  'utilities',
  'marketing',
  'other',
]);
const expenseFields = z.object({
  description: z.string().trim().min(2).max(200),
  category,
  amountCents: amount,
  date: agendaDate,
  notes,
});
const expenseCreate = expenseFields
  .extend({
    status: z.enum(['pending', 'paid']).default('pending'),
    paidLocal: localSchema.optional(),
  })
  .strict()
  .refine(
    (d) => (d.status === 'paid') === Boolean(d.paidLocal),
    'Informe o pagamento somente para uma despesa paga.',
  );
const querySchema = z
  .object({
    from: agendaDate.optional(),
    to: agendaDate.optional(),
    type: z.enum(['all', 'payments', 'expenses']).default('all'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict()
  .refine((d) => Boolean(d.from) === Boolean(d.to), 'Informe início e fim do período.');
const pageSchema = z
  .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .strict();

export function financeLocalTime(now, timezone) {
  const { today, minute } = companyClock(now, timezone);
  return (
    today +
    'T' +
    String(Math.floor(minute / 60)).padStart(2, '0') +
    ':' +
    String(Math.floor(minute % 60)).padStart(2, '0')
  );
}
// Resolve in the COMPANY timezone, never the browser/server OS timezone. Reject
// skipped or ambiguous DST minutes instead of silently moving a financial date.
export function financeInstant(local, timezone, now) {
  localSchema.parse(local);
  const naive = Date.parse(local + ':00Z'),
    offsets = new Set();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(naive + hours * 3600000);
    offsets.add(Date.parse(financeLocalTime(sample, timezone) + ':00Z') - sample.getTime());
  }
  const candidates = [...offsets]
    .map((offset) => new Date(naive - offset))
    .filter((date) => financeLocalTime(date, timezone) === local);
  if (candidates.length !== 1)
    domainError(
      400,
      'INVALID_FINANCIAL_TIME',
      'Esse horário não existe ou é ambíguo no fuso da empresa. Escolha outro horário.',
    );
  if (candidates[0] > now)
    domainError(
      400,
      'FUTURE_FINANCIAL_TIME',
      'Um recebimento ou pagamento não pode estar no futuro.',
    );
  return candidates[0].toISOString();
}
async function appointment(tx, cid, id) {
  const row = await tx.get(
    'SELECT a.id,a.date,a.start_minute,a.total,a.status,COALESCE(a.guest_name,u.name) AS client_name,b.name AS professional_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id JOIN barbers b ON b.company_id=a.company_id AND b.id=a.barber_id WHERE a.company_id=? AND a.id=?',
    [cid, id],
  );
  if (!row) domainError(404, 'APPOINTMENT_NOT_FOUND', 'Atendimento não encontrado.');
  return row;
}
export async function paymentBalance(tx, cid, id) {
  return metricInteger(
    (
      await tx.get(
        'SELECT COALESCE(SUM(p.amount_cents),0) AS n FROM financial_payments p WHERE p.company_id=? AND p.appointment_id=? AND NOT EXISTS(SELECT 1 FROM financial_payment_reversals r WHERE r.company_id=p.company_id AND r.payment_id=p.id)',
        [cid, id],
      )
    ).n,
  );
}
export async function appointmentFinance(tx, cid, id) {
  const row = await appointment(tx, cid, id),
    received = await paymentBalance(tx, cid, id);
  return {
    totalCents: metricInteger(row.total),
    receivedCents: received,
    remainingCents: metricInteger(row.total) - received,
    canReceive: ['confirmed', 'completed'].includes(row.status) && received < row.total,
  };
}
async function expense(tx, cid, id) {
  const row = await tx.get('SELECT * FROM financial_expenses WHERE company_id=? AND id=?', [
    cid,
    id,
  ]);
  if (!row) domainError(404, 'EXPENSE_NOT_FOUND', 'Despesa não encontrada.');
  return row;
}
function expenseExpected(row, expected) {
  if (row.version !== expected)
    domainError(
      409,
      'EXPENSE_CHANGED',
      'Esta despesa mudou. Atualize os dados antes de continuar.',
    );
}
async function expenseEvent(tx, cid, id, action, before, after, req, now, timezone, why = '') {
  await tx.run(
    'INSERT INTO financial_expense_events(id,company_id,expense_id,action,before_json,after_json,reason,paid_reversal_cents,created_by,created_at,event_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(),
      cid,
      id,
      action,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      why,
      action === 'void' && before.status === 'paid' ? before.amount_cents : 0,
      req.user.id,
      now.toISOString(),
      companyClock(now, timezone).today,
    ],
  );
}

const entriesSQL = `
SELECT p.id,'payment' AS type,'Recebimento manual' AS description,p.appointment_id,p.amount_cents,p.received_date AS date,p.received_at AS occurred_at,CASE WHEN r.id IS NULL THEN 'received' ELSE 'reversed' END AS status,p.method,CAST(NULL AS INTEGER) AS version,CAST(NULL AS TEXT) AS category
FROM financial_payments p LEFT JOIN financial_payment_reversals r ON r.company_id=p.company_id AND r.payment_id=p.id WHERE p.company_id=?
UNION ALL
SELECT r.id,'payment-reversal',r.reason,p.appointment_id,-p.amount_cents,r.event_date,r.created_at,'reversed',p.method,CAST(NULL AS INTEGER),CAST(NULL AS TEXT) FROM financial_payment_reversals r JOIN financial_payments p ON p.company_id=r.company_id AND p.id=r.payment_id WHERE r.company_id=?
UNION ALL
SELECT e.id,'expense',e.description,NULL,e.amount_cents,COALESCE(e.paid_date,e.date),COALESCE(e.paid_at,e.created_at),e.status,NULL,e.version,e.category FROM financial_expenses e WHERE e.company_id=?
UNION ALL
SELECT ev.id,'expense-reversal',ev.reason,NULL,-ev.paid_reversal_cents,ev.event_date,ev.created_at,'void',CAST(NULL AS TEXT),CAST(NULL AS INTEGER),CAST(NULL AS TEXT) FROM financial_expense_events ev WHERE ev.company_id=? AND ev.action='void' AND ev.paid_reversal_cents>0`;

export function installFinanceRoutes(router, db, cid) {
  router.use('/admin/finance', (req, _res, next) => {
    if (!req.get('X-Gradefy-Company-Id'))
      domainError(409, 'COMPANY_CONTEXT_REQUIRED', 'Selecione a empresa para continuar.');
    next();
  });
  router.get('/admin/finance', async (req, res) => {
    const q = querySchema.parse(req.query);
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await agendaAccess(tx, cid, req.user.id),
            now = await currentTime(tx);
          const local = companyClock(now, access.company.timezone),
            fallback = dashboardPeriod(local.today, 'month');
          const from = q.from || fallback.start,
            to = q.to || fallback.end;
          if (
            from > to ||
            (Date.parse(to + 'T12:00Z') - Date.parse(from + 'T12:00Z')) / 86400000 > 366
          )
            domainError(
              400,
              'INVALID_FINANCIAL_PERIOD',
              'Selecione um período de até 367 dias, com início anterior ao fim.',
            );
          const totals = await appointmentTotals(tx, cid, from, to);
          const cash = await financialTotals(tx, cid, from, to);
          const where =
            'date>=? AND date<=?' +
            (q.type === 'payments'
              ? " AND type IN ('payment','payment-reversal')"
              : q.type === 'expenses'
                ? " AND type IN ('expense','expense-reversal')"
                : '');
          const args = [cid, cid, cid, cid, from, to],
            source = `(${entriesSQL}) entries`;
          const total = metricInteger(
            (await tx.get(`SELECT COUNT(*) AS n FROM ${source} WHERE ${where}`, args)).n,
          );
          const items = await tx.all(
            `SELECT * FROM ${source} WHERE ${where} ORDER BY date DESC,occurred_at DESC,id DESC LIMIT 30 OFFSET ?`,
            [...args, (q.page - 1) * 30],
          );
          return {
            company: access.company,
            editable: access.editable,
            today: local.today,
            localNow: financeLocalTime(now, access.company.timezone),
            from,
            to,
            page: q.page,
            pageSize: 30,
            total,
            items,
            metrics: {
              expectedCents: totals.expected,
              completedCents: totals.completed_value,
              ...cash,
            },
          };
        },
        { readOnly: true },
      ),
    );
  });
  router.get('/admin/finance/appointments', async (req, res) => {
    const q = z
      .object({
        from: agendaDate,
        to: agendaDate,
        page: z.coerce.number().int().min(1).max(100000).default(1),
      })
      .strict()
      .parse(req.query);
    res.json(
      await db.transaction(
        async (tx) => {
          await agendaAccess(tx, cid, req.user.id);
          if (q.from > q.to) domainError(400, 'INVALID_FINANCIAL_PERIOD', 'Revise o período.');
          const args = [cid, q.from, q.to],
            where =
              "a.company_id=? AND a.date>=? AND a.date<=? AND a.status IN ('confirmed','completed')";
          const total = metricInteger(
            (await tx.get(`SELECT COUNT(*) AS n FROM appointments a WHERE ${where}`, args)).n,
          );
          const rows = await tx.all(
            `SELECT a.id,a.date,a.total,a.status,COALESCE(a.guest_name,u.name) AS client_name FROM appointments a LEFT JOIN users u ON u.id=a.user_id WHERE ${where} ORDER BY a.date DESC,a.start_minute,a.id LIMIT 30 OFFSET ?`,
            [...args, (q.page - 1) * 30],
          );
          const items = [];
          for (const row of rows)
            items.push({ ...row, ...(await appointmentFinance(tx, cid, row.id)) });
          return { items, total, page: q.page, pageSize: 30 };
        },
        { readOnly: true },
      ),
    );
  });
  router.get('/admin/finance/appointments/:id', async (req, res) => {
    const { page } = pageSchema.parse(req.query),
      id = String(req.params.id);
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await agendaAccess(tx, cid, req.user.id),
            row = await appointment(tx, cid, id);
          const total = metricInteger(
            (
              await tx.get(
                'SELECT COUNT(*) AS n FROM financial_payments WHERE company_id=? AND appointment_id=?',
                [cid, id],
              )
            ).n,
          );
          const items = await tx.all(
            'SELECT p.*,u.name AS created_by_name,r.id AS reversal_id,r.reason AS reversal_reason,r.created_at AS reversed_at,r.created_by AS reversed_by,ru.name AS reversed_by_name FROM financial_payments p JOIN users u ON u.id=p.created_by LEFT JOIN financial_payment_reversals r ON r.company_id=p.company_id AND r.payment_id=p.id LEFT JOIN users ru ON ru.id=r.created_by WHERE p.company_id=? AND p.appointment_id=? ORDER BY p.received_at DESC,p.id LIMIT 30 OFFSET ?',
            [cid, id, (page - 1) * 30],
          );
          return {
            appointment: row,
            ...(await appointmentFinance(tx, cid, id)),
            editable: access.editable,
            timezone: access.company.timezone,
            localNow: financeLocalTime(await currentTime(tx), access.company.timezone),
            items,
            total,
            page,
            pageSize: 30,
          };
        },
        { readOnly: true },
      ),
    );
  });
  router.get('/admin/finance/expenses/:id', async (req, res) => {
    const { page } = pageSchema.parse(req.query),
      id = String(req.params.id);
    res.json(
      await db.transaction(
        async (tx) => {
          const access = await agendaAccess(tx, cid, req.user.id),
            row = await expense(tx, cid, id);
          const total = metricInteger(
            (
              await tx.get(
                'SELECT COUNT(*) AS n FROM financial_expense_events WHERE company_id=? AND expense_id=?',
                [cid, id],
              )
            ).n,
          );
          const events = await tx.all(
            'SELECT e.*,u.name AS actor_name FROM financial_expense_events e JOIN users u ON u.id=e.created_by WHERE e.company_id=? AND e.expense_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 30 OFFSET ?',
            [cid, id, (page - 1) * 30],
          );
          return {
            expense: row,
            events,
            total,
            page,
            pageSize: 30,
            editable: access.editable,
            timezone: access.company.timezone,
            localNow: financeLocalTime(await currentTime(tx), access.company.timezone),
          };
        },
        { readOnly: true },
      ),
    );
  });
  async function write(req, res, action, data, perform, status = 200) {
    const key = requestKey(req);
    if (!key)
      domainError(
        428,
        'IDEMPOTENCY_REQUIRED',
        'Envie Idempotency-Key para registrar uma operação financeira.',
      );
    const result = await db.transaction(async (tx) => {
      await agendaAccess(tx, cid, req.user.id);
      return idempotent(
        tx,
        cid,
        'finance-write',
        key,
        { action, id: req.params.id || null, ...data },
        async () => {
          const access = await agendaAccess(tx, cid, req.user.id);
          if (!access.editable)
            domainError(
              409,
              access.entitlement.reason || 'PLAN_REQUIRED',
              'A assinatura permite consultar o financeiro, mas não registrar novos lançamentos ou correções.',
            );
          return perform(tx, access, await currentTime(tx));
        },
      );
    });
    res.status(status).json(result);
  }
  router.post('/admin/finance/payments', async (req, res) => {
    const d = z
      .object({
        appointmentId: z.string().min(1).max(200),
        amountCents: amount,
        expectedReceivedCents: z.number().int().nonnegative(),
        receivedLocal: localSchema,
        method,
        notes,
      })
      .strict()
      .parse(req.body);
    await write(
      req,
      res,
      'payment-create',
      d,
      async (tx, access, now) => {
        await lockAppointment(tx, cid, d.appointmentId);
        const balance = await appointmentFinance(tx, cid, d.appointmentId);
        if (balance.receivedCents !== d.expectedReceivedCents)
          domainError(
            409,
            'PAYMENT_BALANCE_CHANGED',
            'O saldo mudou. Atualize o atendimento antes de registrar.',
          );
        if (!balance.canReceive)
          domainError(409, 'PAYMENT_NOT_ALLOWED', 'Este atendimento não admite novo recebimento.');
        if (d.amountCents > balance.remainingCents)
          domainError(
            409,
            'PAYMENT_EXCEEDS_BALANCE',
            'O valor excede o saldo restante do atendimento.',
          );
        const receivedAt = financeInstant(d.receivedLocal, access.company.timezone, now),
          id = randomUUID();
        await tx.run(
          'INSERT INTO financial_payments(id,company_id,appointment_id,amount_cents,received_at,received_date,method,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [
            id,
            cid,
            d.appointmentId,
            d.amountCents,
            receivedAt,
            d.receivedLocal.slice(0, 10),
            d.method,
            d.notes,
            req.user.id,
            now.toISOString(),
          ],
        );
        return { id, ...(await appointmentFinance(tx, cid, d.appointmentId)) };
      },
      201,
    );
  });
  router.post('/admin/finance/payments/:id/reverse', async (req, res) => {
    const d = z.object({ reason }).strict().parse(req.body),
      id = String(req.params.id);
    await write(
      req,
      res,
      'payment-reverse',
      d,
      async (tx, access, now) => {
        const payment = await tx.get(
          'SELECT * FROM financial_payments WHERE company_id=? AND id=?',
          [cid, id],
        );
        if (!payment) domainError(404, 'PAYMENT_NOT_FOUND', 'Recebimento não encontrado.');
        await lockAppointment(tx, cid, payment.appointment_id);
        if (
          await tx.get(
            'SELECT id FROM financial_payment_reversals WHERE company_id=? AND payment_id=?',
            [cid, id],
          )
        )
          domainError(
            409,
            'PAYMENT_ALREADY_REVERSED',
            'Este recebimento já foi estornado no registro manual.',
          );
        const reversalId = randomUUID();
        await tx.run(
          'INSERT INTO financial_payment_reversals(id,company_id,payment_id,reason,created_by,created_at,event_date) VALUES(?,?,?,?,?,?,?)',
          [
            reversalId,
            cid,
            id,
            d.reason,
            req.user.id,
            now.toISOString(),
            companyClock(now, access.company.timezone).today,
          ],
        );
        return {
          id: reversalId,
          paymentId: id,
          ...(await appointmentFinance(tx, cid, payment.appointment_id)),
        };
      },
      201,
    );
  });
  router.post('/admin/finance/expenses', async (req, res) => {
    const d = expenseCreate.parse(req.body);
    await write(
      req,
      res,
      'expense-create',
      d,
      async (tx, access, now) => {
        const id = randomUUID(),
          paidAt = d.paidLocal ? financeInstant(d.paidLocal, access.company.timezone, now) : null;
        await tx.run(
          'INSERT INTO financial_expenses(id,company_id,description,category,amount_cents,date,status,paid_at,paid_date,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          [
            id,
            cid,
            d.description,
            d.category,
            d.amountCents,
            d.date,
            d.status,
            paidAt,
            d.paidLocal?.slice(0, 10) || null,
            d.notes,
            req.user.id,
            now.toISOString(),
            now.toISOString(),
          ],
        );
        const row = await expense(tx, cid, id);
        await expenseEvent(tx, cid, id, 'create', null, row, req, now, access.company.timezone);
        return row;
      },
      201,
    );
  });
  router.put('/admin/finance/expenses/:id', async (req, res) => {
    const d = expenseFields.extend({ version, reason }).strict().parse(req.body),
      id = String(req.params.id);
    await write(req, res, 'expense-edit', d, async (tx, access, now) => {
      await lockResource(tx, cid, 'expense', id);
      const before = await expense(tx, cid, id);
      expenseExpected(before, d.version);
      if (before.status !== 'pending')
        domainError(
          409,
          'EXPENSE_NOT_PENDING',
          'Somente despesas pendentes podem ser editadas. Estorne um registro pago antes de cadastrar a correção.',
        );
      await tx.run(
        'UPDATE financial_expenses SET description=?,category=?,amount_cents=?,date=?,notes=?,version=version+1,updated_at=? WHERE company_id=? AND id=?',
        [d.description, d.category, d.amountCents, d.date, d.notes, now.toISOString(), cid, id],
      );
      const after = await expense(tx, cid, id);
      await expenseEvent(
        tx,
        cid,
        id,
        'edit',
        before,
        after,
        req,
        now,
        access.company.timezone,
        d.reason,
      );
      return after;
    });
  });
  router.post('/admin/finance/expenses/:id/pay', async (req, res) => {
    const d = z.object({ version, paidLocal: localSchema }).strict().parse(req.body),
      id = String(req.params.id);
    await write(req, res, 'expense-pay', d, async (tx, access, now) => {
      await lockResource(tx, cid, 'expense', id);
      const before = await expense(tx, cid, id);
      expenseExpected(before, d.version);
      if (before.status !== 'pending')
        domainError(409, 'EXPENSE_NOT_PENDING', 'Esta despesa não está pendente.');
      const paidAt = financeInstant(d.paidLocal, access.company.timezone, now);
      await tx.run(
        "UPDATE financial_expenses SET status='paid',paid_at=?,paid_date=?,version=version+1,updated_at=? WHERE company_id=? AND id=?",
        [paidAt, d.paidLocal.slice(0, 10), now.toISOString(), cid, id],
      );
      const after = await expense(tx, cid, id);
      await expenseEvent(tx, cid, id, 'pay', before, after, req, now, access.company.timezone);
      return after;
    });
  });
  router.post('/admin/finance/expenses/:id/void', async (req, res) => {
    const d = z.object({ version, reason }).strict().parse(req.body),
      id = String(req.params.id);
    await write(req, res, 'expense-void', d, async (tx, access, now) => {
      await lockResource(tx, cid, 'expense', id);
      const before = await expense(tx, cid, id);
      expenseExpected(before, d.version);
      if (before.status === 'void')
        domainError(409, 'EXPENSE_ALREADY_VOID', 'Esta despesa já foi anulada.');
      await tx.run(
        "UPDATE financial_expenses SET status='void',version=version+1,updated_at=? WHERE company_id=? AND id=?",
        [now.toISOString(), cid, id],
      );
      const after = await expense(tx, cid, id);
      await expenseEvent(
        tx,
        cid,
        id,
        'void',
        before,
        after,
        req,
        now,
        access.company.timezone,
        d.reason,
      );
      return after;
    });
  });
}
