import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { runMigrations, readMigration, migrations } from '../../server/migrations.js';
import { financeInstant, financeLocalTime } from '../../server/finance.js';
import { dateInBrazil, addDays } from '../../server/domain.js';
import { installBusinessBrowserFixture } from './business-browser.js';
import { reconstructBeforeFinance, financialTables } from './finance-migration.js';
const cid = 'business-browser-team',
  other = 'business-browser-one';
export function assertFinancialDates() {
  const now = new Date('2026-10-11T14:00:00Z');
  assert.equal(
    financeInstant('2026-10-11T10:30', 'America/Sao_Paulo', now),
    '2026-10-11T13:30:00.000Z',
  );
  assert.equal(
    financeInstant('2026-10-11T00:15', 'Pacific/Kiritimati', now),
    '2026-10-10T10:15:00.000Z',
  );
  assert.equal(
    financeInstant('2026-10-11T01:00', 'Asia/Kathmandu', now),
    '2026-10-10T19:15:00.000Z',
  );
  for (const [local, tz] of [
    ['2026-02-30T12:00', 'America/Sao_Paulo'],
    ['2026-03-08T02:30', 'America/New_York'],
    ['2025-11-02T01:30', 'America/New_York'],
    ['2026-10-11T12:00', 'America/Sao_Paulo'],
    ['2026-10-11T25:00', 'America/Sao_Paulo'],
  ])
    assert.throws(() => financeInstant(local, tz, now));
}
export async function assertFinanceMigration(t, db) {
  await seed(db);
  const before = await db.all('SELECT * FROM appointments ORDER BY company_id,id'),
    services = await db.all(
      'SELECT * FROM appointment_services ORDER BY company_id,appointment_id,service_id',
    );
  await reconstructBeforeFinance(db);
  const journal = await db.all('SELECT * FROM schema_migrations ORDER BY version'),
    keys = await db.all('SELECT * FROM idempotency_keys');
  const broken = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('CREATE TABLE financial_expense_events'))
              throw new Error('injected finance migration');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(broken), /injected finance migration/);
  for (const table of financialTables) await assert.rejects(db.all('SELECT * FROM ' + table));
  assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), journal);
  assert.deepEqual(await runMigrations(db), [14]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(await db.all('SELECT * FROM appointments ORDER BY company_id,id'), before);
  assert.deepEqual(
    await db.all(
      'SELECT * FROM appointment_services ORDER BY company_id,appointment_id,service_id',
    ),
    services,
  );
  assert.deepEqual(await db.all('SELECT * FROM idempotency_keys'), keys);
  for (const table of financialTables)
    assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM ' + table)).n), 0);
  assert.equal(
    (await db.get('SELECT checksum FROM schema_migrations WHERE version=13')).checksum,
    readMigration(migrations[12]).checksum,
  );
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=14', ['0'.repeat(64)]);
  await assert.rejects(runMigrations(db), /Hist/);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=14', [
    readMigration(migrations[13]).checksum,
  ]);
  t.diagnostic(
    '014: atomic rollback, repeat, empty financial ledger, legacy snapshots and immutable 013 checksum',
  );
}
export async function assertFinance(t, db, second = db) {
  assertFinancialDates();
  await installBusinessBrowserFixture(db, 'unused-fixture');
  const stamp = new Date().toISOString(),
    today = dateInBrazil(),
    localNow = financeLocalTime(new Date(), 'America/Sao_Paulo'),
    secret = 'gradefy-finance-test-secret';
  for (const name of ['manager', 'professional', 'outsider'])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999999999','fixture','client',?)",
      ['finance-' + name, name, name + '-finance@example.test', stamp],
    );
  for (const [user, role, company] of [
    ['manager', 'manager', cid],
    ['professional', 'professional', cid],
    ['outsider', 'owner', other],
  ])
    await db.run(
      'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
      [company, 'finance-' + user, role, stamp],
    );
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('igor-barber-club','finance-manager','owner',?)",
    [stamp],
  );
  for (const [id, company, date, status, total] of [
    ['finance-race', cid, addDays(today, 3), 'confirmed', 7000],
    ['finance-past', cid, addDays(today, 4), 'confirmed', 5000],
    ['finance-other', other, today, 'confirmed', 4500],
    ['finance-complete', cid, addDays(today, -3), 'confirmed', 4500],
  ]) {
    await db.run(
      "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES(?,?,?, ?,540,580,?,?,'Cliente Financeiro',?)",
      [id, company, company + '-pro', date, total, status, stamp],
    );
    await db.run(
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,'Serviço histórico',?,40)",
      [company, id, company + '-service', total],
    );
  }
  await db.run("UPDATE appointments SET user_id='business-browser-owner' WHERE id='finance-race'");
  let failOn = '';
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (failOn && sql.startsWith(failOn)) {
                failOn = '';
                throw Object.assign(new Error('injected financial write'), { status: 503 });
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((d) =>
    createApp(d, { secret, test: true, serveStatic: false, siteStorage: null }).listen(
      0,
      '127.0.0.1',
    ),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const s of servers) await new Promise((done) => s.close(done));
  });
  const actorId = (u) => (u === 'owner' ? 'business-browser-owner' : 'finance-' + u);
  async function req(
    path = '',
    {
      method = 'GET',
      body,
      key = 'finance-key-default',
      company = cid,
      user = 'owner',
      instance = 0,
    } = {},
  ) {
    const r = await fetch('http://127.0.0.1:' + servers[instance].address().port + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(company ? { 'X-Gradefy-Company-Id': company } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...(user
          ? {
              Cookie:
                'session=' +
                jwt.sign({ version: 0 }, secret, {
                  subject: actorId(user),
                  issuer: 'igor-barber-club',
                  audience: 'barber-web',
                  expiresIn: '1h',
                }),
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const root = '/admin/finance',
    period = '?from=' + today + '&to=' + today;
  const payment = (
    appointmentId,
    amountCents,
    expectedReceivedCents = 0,
    receivedLocal = localNow,
  ) => ({
    appointmentId,
    amountCents,
    expectedReceivedCents,
    receivedLocal,
    method: 'pix',
    notes: 'Registro de teste',
  });
  const expenseBody = {
    description: 'Materiais de atendimento',
    category: 'materials',
    amountCents: 1000,
    date: today,
    status: 'pending',
    notes: '',
  };
  let first, full, exp;
  await t.test(
    'access: explicit owner/manager context, no public financial data, unauthorized and cross-company IDs',
    async () => {
      for (const [user, status] of [
        [null, 401],
        ['professional', 403],
        ['outsider', 403],
        ['manager', 200],
      ])
        assert.equal((await req(root, { user })).status, status);
      assert.equal((await req(root, { company: null })).status, 409);
      assert.equal((await req(root + '?company_id=' + other)).status, 400);
      assert.equal((await req('/public/' + cid + '/finance', { user: null })).status, 404);
      assert.equal((await req('/public/' + cid + '/admin/finance', { user: null })).status, 404);
      assert.equal((await req(root + '/appointments/finance-other')).status, 404);
      assert.equal(
        (
          await req(root + '/payments', {
            method: 'POST',
            body: payment('finance-other', 100),
            key: 'finance-other-denied',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req(root + '/payments', {
            method: 'POST',
            body: payment('finance-race', 100),
            key: null,
          })
        ).status,
        428,
      );
    },
  );
  await t.test(
    'partial and full receipts: integer validation, snapshots, repeated/lost responses and actor attribution',
    async () => {
      const before = await db.get(
          "SELECT * FROM appointments WHERE id='business-browser-completed'",
        ),
        snapshot = await db.all(
          "SELECT * FROM appointment_services WHERE appointment_id='business-browser-completed'",
        );
      for (const invalid of [0, -1, 1.5, NaN, 100000001, '4500'])
        assert.equal(
          (
            await req(root + '/payments', {
              method: 'POST',
              body: payment(before.id, invalid),
              key: 'invalid-finance-amount',
            })
          ).status,
          400,
        );
      first = await req(root + '/payments', {
        method: 'POST',
        body: payment(before.id, 2000),
        key: 'finance-partial',
      });
      assert.equal(first.status, 201, JSON.stringify(first.data));
      assert.equal(first.data.remainingCents, 2500);
      assert.deepEqual(
        await req(root + '/payments', {
          method: 'POST',
          body: payment(before.id, 2000),
          key: 'finance-partial',
        }),
        first,
      );
      assert.equal(
        (
          await req(root + '/payments', {
            method: 'POST',
            body: payment(before.id, 2001),
            key: 'finance-partial',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req(root + '/payments', {
            method: 'POST',
            body: payment(before.id, 2600, 2000),
            key: 'finance-overpay',
          })
        ).data.code,
        'PAYMENT_EXCEEDS_BALANCE',
      );
      full = await req(root + '/payments', {
        method: 'POST',
        body: payment(before.id, 2500, 2000),
        key: 'finance-full',
        user: 'manager',
      });
      assert.equal(full.status, 201);
      assert.equal(full.data.remainingCents, 0);
      assert.equal(
        (await db.get('SELECT created_by FROM financial_payments WHERE id=?', [full.data.id]))
          .created_by,
        'finance-manager',
      );
      assert.deepEqual(await db.get('SELECT * FROM appointments WHERE id=?', [before.id]), before);
      assert.deepEqual(
        await db.all('SELECT * FROM appointment_services WHERE appointment_id=?', [before.id]),
        snapshot,
      );
      const detail = (await req(root + '/appointments/' + before.id)).data;
      assert.equal(detail.items.length, 2);
      assert.equal(detail.receivedCents, 4500);
      assert.equal(
        (
          await req(root + '/payments', {
            method: 'POST',
            body: payment('business-browser-cancelled', 10),
            key: 'finance-cancelled-denied',
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    'concurrency: same key creates one receipt and distinct keys cannot overpay or repeat a stale partial',
    async () => {
      const options = {
        method: 'POST',
        body: payment('finance-race', 4000),
        key: 'finance-race-same',
      };
      const results = await Promise.all([
        req(root + '/payments', options),
        req(root + '/payments', { ...options, instance: 1 }),
      ]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].status, 201);
      const pair = await Promise.all([
        req(root + '/payments', {
          method: 'POST',
          body: payment('finance-race', 3000, 4000),
          key: 'finance-race-a',
        }),
        req(root + '/payments', {
          method: 'POST',
          body: payment('finance-race', 3000, 4000),
          key: 'finance-race-b',
          instance: 1,
        }),
      ]);
      assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409]);
      assert.equal((await req(root + '/appointments/finance-race')).data.receivedCents, 7000);
      const stored = await db.get("SELECT * FROM appointments WHERE id='finance-race'");
      const reschedule = await req('/public/' + cid + '/appointments/finance-race/reschedule', {
        method: 'PATCH',
        body: {
          date: stored.date,
          time: '09:40',
          barberId: cid + '-pro',
          services: [cid + '-service'],
        },
        key: 'finance-price-change-denied',
      });
      assert.equal(reschedule.status, 409, JSON.stringify(reschedule.data));
      assert.equal(reschedule.data.code, 'FINANCIAL_HISTORY_PRICE_LOCKED');
      assert.deepEqual(await db.get("SELECT * FROM appointments WHERE id='finance-race'"), stored);
      const sameKeyDifferentCompany = await req(root + '/payments', {
        method: 'POST',
        company: other,
        body: payment('finance-other', 1000),
        key: 'finance-partial',
      });
      assert.equal(sameKeyDifferentCompany.status, 201);
      assert.equal(
        (
          await req(root + '/payments/' + sameKeyDifferentCompany.data.id + '/reverse', {
            method: 'POST',
            body: { reason: 'Empresa incorreta' },
            key: 'finance-foreign-reverse',
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    'completion creates no receipt; cancellation preserves existing payments; traceable reversal is exactly once',
    async () => {
      const completed = await req('/admin/agenda/finance-complete/status', {
        method: 'PATCH',
        body: { status: 'completed' },
        key: 'finance-complete-appointment',
      });
      assert.equal(completed.status, 200);
      assert.equal((await req(root + '/appointments/finance-complete')).data.receivedCents, 0);
      const original = await db.get('SELECT * FROM financial_payments WHERE id=?', [first.data.id]);
      await db.run(
        "UPDATE appointments SET status='cancelled' WHERE id='business-browser-completed'",
      );
      assert.equal(
        (await req(root + '/appointments/business-browser-completed')).data.receivedCents,
        4500,
      );
      const options = {
        method: 'POST',
        body: { reason: 'Devolução registrada manualmente' },
        key: 'finance-reversal-same',
      };
      const pair = await Promise.all([
        req(root + '/payments/' + first.data.id + '/reverse', options),
        req(root + '/payments/' + first.data.id + '/reverse', { ...options, instance: 1 }),
      ]);
      assert.equal(pair[0].status, 201);
      assert.deepEqual(pair[0], pair[1]);
      assert.equal(pair[0].data.receivedCents, 2500);
      assert.deepEqual(
        await db.get('SELECT * FROM financial_payments WHERE id=?', [first.data.id]),
        original,
      );
      const reversal = await db.get(
        'SELECT * FROM financial_payment_reversals WHERE payment_id=?',
        [first.data.id],
      );
      assert.equal(reversal.created_by, 'business-browser-owner');
      assert.equal(reversal.reason, options.body.reason);
      assert.ok(Number.isFinite(Date.parse(reversal.created_at)));
      assert.equal(
        (
          await req(root + '/payments/' + first.data.id + '/reverse', {
            method: 'POST',
            body: options.body,
            key: 'finance-reverse-again',
          })
        ).data.code,
        'PAYMENT_ALREADY_REVERSED',
      );
      assert.equal(
        (await db.get("SELECT status FROM appointments WHERE id='business-browser-completed'"))
          .status,
        'cancelled',
      );
    },
  );
  await t.test(
    'expenses: pending edits retain audit, only actual payment counts, paid edits require explicit reversal',
    async () => {
      const created = await req(root + '/expenses', {
        method: 'POST',
        body: expenseBody,
        key: 'finance-expense-create',
      });
      assert.equal(created.status, 201);
      exp = created.data;
      const duplicate = await req(root + '/expenses', {
        method: 'POST',
        body: expenseBody,
        key: 'finance-expense-create',
      });
      assert.deepEqual(duplicate, created);
      assert.equal((await req(root + period)).data.metrics.paidExpensesCents, 0);
      const edit = {
        description: 'Material corrigido',
        category: 'products',
        amountCents: 1500,
        date: today,
        notes: 'Compra revisada',
        version: 0,
        reason: 'Correção do valor da nota',
      };
      assert.equal(
        (
          await req(root + '/expenses/' + exp.id, {
            method: 'PUT',
            body: edit,
            key: 'finance-expense-edit',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await req(root + '/expenses/' + exp.id, {
            method: 'PUT',
            body: edit,
            key: 'finance-expense-edit-stale',
          })
        ).data.code,
        'EXPENSE_CHANGED',
      );
      const paid = await req(root + '/expenses/' + exp.id + '/pay', {
        method: 'POST',
        body: { version: 1, paidLocal: localNow },
        key: 'finance-expense-pay',
      });
      assert.equal(paid.status, 200);
      assert.equal(paid.data.version, 2);
      assert.equal((await req(root + period)).data.metrics.paidExpensesCents, 1500);
      assert.equal(
        (
          await req(root + '/expenses/' + exp.id, {
            method: 'PUT',
            body: { ...edit, version: 2 },
            key: 'finance-paid-edit-denied',
          })
        ).data.code,
        'EXPENSE_NOT_PENDING',
      );
      const history = (await req(root + '/expenses/' + exp.id)).data;
      assert.equal(history.events.length, 3);
      const correction = history.events.find((e) => e.action === 'edit');
      assert.equal(JSON.parse(correction.before_json).amount_cents, 1000);
      assert.equal(JSON.parse(correction.after_json).amount_cents, 1500);
      assert.equal((await req(root + '/expenses/' + exp.id, { company: other })).status, 404);
      assert.equal(
        (
          await req(root + '/expenses/' + exp.id + '/void', {
            method: 'POST',
            body: { version: 2, reason: 'Lançamento pago incorreto' },
            key: 'finance-expense-void',
          })
        ).status,
        200,
      );
      assert.equal((await req(root + period)).data.metrics.paidExpensesCents, 0);
      assert.equal(
        Number(
          (
            await db.get('SELECT COUNT(*) AS n FROM financial_expense_events WHERE expense_id=?', [
              exp.id,
            ])
          ).n,
        ),
        4,
      );
      assert.equal(
        (
          await req(root + '/expenses/' + exp.id + '/void', {
            method: 'POST',
            body: { version: 3, reason: 'Anular novamente' },
            key: 'finance-expense-void-again',
          })
        ).status,
        409,
      );
      const valid = await req(root + '/expenses', {
        method: 'POST',
        body: { ...expenseBody, amountCents: 500, status: 'paid', paidLocal: localNow },
        key: 'finance-valid-paid-expense',
      });
      assert.equal(valid.status, 201);
      const metrics = (await req(root + period)).data.metrics;
      assert.equal(metrics.receivedCents, 9500);
      assert.equal(metrics.paidExpensesCents, 500);
      assert.equal(metrics.balanceCents, 9000);
      for (const bad of [
        { ...expenseBody, amountCents: -1 },
        { ...expenseBody, status: 'paid' },
        { ...expenseBody, paidLocal: localNow },
        { ...expenseBody, category: 'invalid' },
      ])
        assert.equal(
          (
            await req(root + '/expenses', {
              method: 'POST',
              body: bad,
              key: 'finance-invalid-expense',
            })
          ).status,
          400,
        );
    },
  );
  await t.test(
    'periods follow financial local dates and reversal dates; pagination and forecast use original dashboard criteria',
    async () => {
      const past = await req(root + '/payments', {
        method: 'POST',
        body: payment('finance-past', 1000, 0, '2001-01-31T23:59'),
        key: 'finance-period-boundary',
      });
      assert.equal(past.status, 201);
      const jan = (await req(root + '?from=2001-01-01&to=2001-01-31')).data;
      assert.equal(jan.metrics.receivedCents, 1000);
      assert.equal(jan.total, 1);
      const feb = (await req(root + '?from=2001-02-01&to=2001-02-28')).data;
      assert.equal(feb.metrics.receivedCents, 0);
      assert.equal(
        (
          await req(root + '/payments/' + past.data.id + '/reverse', {
            method: 'POST',
            body: { reason: 'Correção em outro período' },
            key: 'finance-period-reverse',
          })
        ).status,
        201,
      );
      assert.equal(
        (await req(root + '?from=2001-01-01&to=2001-01-31')).data.metrics.receivedCents,
        1000,
      );
      assert.equal((await req(root + period)).data.metrics.receivedCents, 8500);
      for (const q of [
        '?from=2026-02-30&to=2026-03-01',
        '?from=2026-02-02&to=2026-02-01',
        '?from=2001-01-01&to=2026-01-01',
        '?from=2026-01-01',
      ])
        assert.equal((await req(root + q)).status, 400);
      const dashboard = (await req('/dashboard')).data;
      const overview = (
        await req(root + '?from=' + dashboard.period.start + '&to=' + dashboard.period.end)
      ).data;
      assert.equal(overview.metrics.expectedCents, dashboard.metrics.expectedValueCents);
      assert.equal(overview.metrics.completedCents, 4500);
      for (let i = 0; i < 31; i++)
        await req(root + '/expenses', {
          method: 'POST',
          body: { ...expenseBody, description: 'Despesa de página ' + i },
          key: 'finance-page-' + i,
        });
      const listed = (await req(root + period + '&type=expenses')).data;
      assert.equal(listed.items.length, 30);
      assert.ok(listed.total > 30);
      assert.ok((await req(root + period + '&type=expenses&page=2')).data.items.length > 0);
    },
  );
  await t.test(
    'atomic rollback releases key and audit; version serializes concurrent expense payment',
    async () => {
      const before = Number((await db.get('SELECT COUNT(*) AS n FROM financial_expenses')).n);
      failOn = 'INSERT INTO financial_expense_events';
      const options = {
        method: 'POST',
        body: expenseBody,
        key: 'finance-write-rollback',
        instance: 2,
      };
      assert.equal((await req(root + '/expenses', options)).status, 503);
      assert.equal(
        Number((await db.get('SELECT COUNT(*) AS n FROM financial_expenses')).n),
        before,
      );
      const valid = await req(root + '/expenses', options);
      assert.equal(valid.status, 201);
      const pair = await Promise.all([
        req(root + '/expenses/' + valid.data.id + '/pay', {
          method: 'POST',
          body: { version: 0, paidLocal: localNow },
          key: 'finance-pay-concurrent-a',
        }),
        req(root + '/expenses/' + valid.data.id + '/pay', {
          method: 'POST',
          body: { version: 0, paidLocal: localNow },
          key: 'finance-pay-concurrent-b',
          instance: 1,
        }),
      ]);
      assert.deepEqual(pair.map((r) => r.status).sort(), [200, 409]);
      failOn = 'INSERT INTO idempotency_keys';
      const pay = {
        method: 'POST',
        body: payment('finance-past', 500),
        key: 'finance-payment-rollback',
        instance: 2,
      };
      assert.equal((await req(root + '/payments', pay)).status, 503);
      assert.equal((await req(root + '/appointments/finance-past')).data.receivedCents, 0);
      assert.equal((await req(root + '/payments', pay)).status, 201);
    },
  );
  await t.test(
    'database required IDs/FKs, expired read-only access, private notes and legacy Igor compatibility',
    async () => {
      for (const [id, company, appt, actor] of [
        [null, cid, 'finance-race', 'business-browser-owner'],
        ['bad-company', 'missing', 'finance-race', 'business-browser-owner'],
        ['cross-company', cid, 'finance-other', 'business-browser-owner'],
        ['bad-actor', cid, 'finance-race', 'missing'],
      ])
        await assert.rejects(
          db.run(
            "INSERT INTO financial_payments(id,company_id,appointment_id,amount_cents,received_at,received_date,method,created_by,created_at) VALUES(?,?,?,1,? ,?,'pix',?,?)",
            [id, company, appt, stamp, today, actor, stamp],
          ),
        );
      const publicData = (await req('/public/' + cid + '/site', { user: null })).data;
      assert.ok(!JSON.stringify(publicData).includes('Registro de teste'));
      const list = (await req(root)).data.items;
      assert.ok(list.every((r) => !('notes' in r) && !('email' in r) && !('phone' in r)));
      await db.run('UPDATE subscriptions SET ends_at=? WHERE company_id=?', ['2000-01-01', cid]);
      assert.equal((await req(root)).data.editable, false);
      assert.equal(
        (
          await req(root + '/expenses', {
            method: 'POST',
            body: expenseBody,
            key: 'finance-expired-write',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req(root + '/payments/' + full.data.id + '/reverse', {
            method: 'POST',
            body: { reason: 'Estorno sem assinatura' },
            key: 'finance-expired-reverse',
          })
        ).status,
        409,
      );
      const legacy = await db.get(
        "SELECT user_id FROM company_members WHERE company_id='igor-barber-club' AND role='owner' LIMIT 1",
      );
      assert.ok(legacy);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM subscriptions WHERE company_id='igor-barber-club'",
            )
          ).n,
        ),
        0,
      );
      assert.equal(
        (await req('/services', { company: 'igor-barber-club', user: null })).status,
        200,
      );
      assert.equal(
        (await db.get("SELECT price_cents FROM plans WHERE id='individual'")).price_cents,
        2299,
      );
      assert.equal(
        (await db.get("SELECT price_cents FROM plans WHERE id='team'")).price_cents,
        3299,
      );
    },
  );
}
