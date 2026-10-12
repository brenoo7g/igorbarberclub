import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { seed } from '../../server/seed.js';
import { createApp } from '../../server/app.js';
import { reportsSnapshot, reportPeriod, csvCell } from '../../server/reports.js';
import { companyClock } from '../../server/dashboard.js';
import { installBusinessBrowserFixture } from './business-browser.js';

const cid = 'business-browser-team',
  other = 'business-browser-one',
  actor = 'business-browser-owner';
export function assertReportPeriods() {
  assert.deepEqual(reportPeriod('2024-03-01', { period: 'previous-month' }), {
    from: '2024-02-01',
    to: '2024-02-29',
  });
  assert.deepEqual(reportPeriod('2025-01-01', { period: 'previous-month' }), {
    from: '2024-12-01',
    to: '2024-12-31',
  });
  assert.deepEqual(reportPeriod('2024-03-01', { period: 'last7' }), {
    from: '2024-02-24',
    to: '2024-03-01',
  });
  assert.deepEqual(reportPeriod('2024-03-01', { period: 'last30' }), {
    from: '2024-02-01',
    to: '2024-03-01',
  });
  assert.deepEqual(reportPeriod('2024-03-01', { period: 'today' }), {
    from: '2024-03-01',
    to: '2024-03-01',
  });
  assert.throws(() =>
    reportPeriod('2024-03-01', { period: 'custom', from: '2024-02-30', to: '2024-03-01' }),
  );
  assert.throws(() =>
    reportPeriod('2024-03-01', { period: 'custom', from: '2023-01-01', to: '2024-03-01' }),
  );
  assert.throws(() =>
    reportPeriod('2024-03-01', { period: 'custom', from: '2024-03-01', to: '2024-02-01' }),
  );
  for (const v of [
    '=1+1',
    '+SUM(1)',
    '-evil',
    '@SUM(1)',
    ' \t=1+1',
    '\r\n=1+1',
    '\ufeff=1+1',
    '\u0000=1+1',
    '\u0001@SUM(1)',
  ])
    assert.match(csvCell(v), /^"'/);
  assert.equal(csvCell('Corte; "bom"\nLinha 2'), '"Corte; ""bom""\nLinha 2"');
  assert.equal(csvCell(-2000), '"-2000"');
}
export async function assertReports(t, db) {
  await seed(db);
  await installBusinessBrowserFixture(db, 'fixture');
  const secret = 'reports-disposable-test-secret',
    stamp = '2024-02-01T12:00:00.000Z';
  for (const [id, role, company] of [
    ['report-manager', 'manager', cid],
    ['report-pro', 'professional', cid],
    ['report-outsider', 'owner', other],
  ]) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','fixture','client',?)",
      [id, id, id + '@example.test', stamp],
    );
    await db.run(
      'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
      [company, id, role, stamp],
    );
  }
  await db.run(
    "INSERT INTO barbers(id,company_id,name,specialty,active) VALUES('report-inactive',?,'=HYPERLINK(" +
      '"unsafe"' +
      ")','Histórico',0)",
    [cid],
  );
  await db.run(
    "INSERT INTO services(id,company_id,name,description,duration,price,category,active) VALUES('report-service-b',?,'Nome atual diferente','',40,99999,'Cabelo',0)",
    [cid],
  );
  const aps = [
    ['report-free', '2000-01-01', 'completed', 0, cid + '-pro'],
    ['report-done-one', '2024-02-28', 'completed', 4500, cid + '-pro'],
    ['report-done-split', '2024-02-29', 'completed', 7000, cid + '-pro'],
    ['report-done-inactive', '2024-02-29', 'completed', 5000, 'report-inactive'],
    ['report-cancelled', '2024-02-28', 'cancelled', 4500, 'report-inactive'],
    ['report-no-show', '2024-02-29', 'no-show', 4500, cid + '-pro'],
    ['report-confirmed', '2024-02-29', 'confirmed', 4500, cid + '-pro'],
  ];
  for (const [id, date, status, total, pro] of aps) {
    await db.run(
      "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,guest_email,guest_phone,created_at) VALUES(?,?,?, ?,780,820,?,?,'Cliente privado','private@example.test','21999991111',?)",
      [id, cid, pro, date, total, status, stamp],
    );
    if (id === 'report-done-split') {
      await db.run(
        "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,' \t=1+1',4000,20)",
        [cid, id, cid + '-service'],
      );
      await db.run(
        "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,'Serviço B histórico',3000,20)",
        [cid, id, 'report-service-b'],
      );
    } else
      await db.run(
        'INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,?,?,40)',
        [
          cid,
          id,
          id === 'report-done-inactive' ? 'report-service-b' : cid + '-service',
          id === 'report-done-inactive' ? 'Serviço B histórico' : 'Corte clássico histórico',
          total,
        ],
      );
  }
  for (const [id, apid, amount, date, method] of [
    ['report-p1', 'report-done-split', 2000, '2024-02-29', 'pix'],
    ['report-p2', 'report-done-split', 3000, '2024-02-29', 'cash'],
    ['report-pcancel', 'report-cancelled', 1000, '2024-02-28', 'cash'],
  ])
    await db.run(
      'INSERT INTO financial_payments(id,company_id,appointment_id,amount_cents,received_at,received_date,method,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?, ?,?,?)',
      [id, cid, apid, amount, date + 'T15:00:00.000Z', date, method, 'Nota privada', actor, stamp],
    );
  await db.run(
    "INSERT INTO financial_payment_reversals(id,company_id,payment_id,reason,created_by,created_at,event_date) VALUES('report-reversal',?,'report-p1','Correção do registro',?,'2024-03-01T15:00:00.000Z','2024-03-01')",
    [cid, actor],
  );
  for (const [id, amount, date, status, paid] of [
    ['report-expense', 500, '2024-02-28', 'void', '2024-02-28'],
    ['report-correct-expense', 700, '2024-03-01', 'paid', '2024-03-01'],
    ['report-pending-expense', 10000, '2024-02-29', 'pending', null],
  ])
    await db.run(
      "INSERT INTO financial_expenses(id,company_id,description,category,amount_cents,date,status,paid_at,paid_date,created_by,created_at,updated_at) VALUES(?,?,?,'materials',?,?,?,?,?,?,?,?)",
      [
        id,
        cid,
        id,
        amount,
        date,
        status,
        paid ? paid + 'T15:00:00.000Z' : null,
        paid,
        actor,
        stamp,
        stamp,
      ],
    );
  await db.run(
    "INSERT INTO financial_expense_events(id,company_id,expense_id,action,before_json,after_json,reason,paid_reversal_cents,created_by,created_at,event_date) VALUES('report-expense-void',?,'report-expense','void','{}','{}','Correção',500,?,'2024-03-01T15:00:00.000Z','2024-03-01')",
    [cid, actor],
  );
  const app = createApp(db, { secret, test: true, serveStatic: false, siteStorage: null }),
    server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((r) => server.close(r)));
  async function request(
    q = '',
    { user = actor, company = cid, path = '/api/admin/reports', csv = false } = {},
  ) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path + q, {
      headers: {
        ...(company ? { 'X-Gradefy-Company-Id': company } : {}),
        ...(user
          ? {
              Cookie:
                'session=' +
                jwt.sign({ version: 0 }, secret, {
                  subject: user,
                  issuer: 'igor-barber-club',
                  audience: 'barber-web',
                  expiresIn: '1h',
                }),
            }
          : {}),
      },
    });
    return {
      status: response.status,
      data: csv && response.ok ? await response.text() : await response.json(),
      headers: response.headers,
    };
  }
  const range = 'period=custom&from=2024-02-01&to=2024-02-29';
  const tables = [
    'appointments',
    'appointment_services',
    'financial_payments',
    'financial_payment_reversals',
    'financial_expenses',
    'financial_expense_events',
    'subscriptions',
    'schema_migrations',
  ];
  const snapshot = () =>
    Promise.all(tables.map((table) => db.all('SELECT * FROM ' + table + ' ORDER BY 1')));
  const original = await snapshot();
  await t.test(
    'empty reports, zero denominators, authorization and explicit cross-company scope',
    async () => {
      const r = await request('?' + range, { company: other });
      assert.equal(r.status, 200);
      assert.deepEqual(r.data.metrics, {
        expectedCents: 0,
        completedCents: 0,
        receivedCents: 0,
        paidExpensesCents: 0,
        balanceCents: 0,
      });
      assert.equal(r.data.services.total, 0);
      assert.equal(r.data.financialSeries.length, 29);
      assert.equal((await request('?' + range, { user: null })).status, 401);
      assert.equal((await request('?' + range, { company: null })).status, 409);
      for (const user of ['report-pro', 'report-outsider']) {
        assert.equal((await request('?' + range, { user })).status, 403);
        assert.equal(
          (await request('?' + range, { user, path: '/api/admin/reports/export', csv: true }))
            .status,
          403,
        );
      }
      assert.equal((await request('?' + range, { user: 'report-manager' })).status, 200);
      for (const filter of ['professionalId=' + other + '-pro', 'serviceId=' + other + '-service'])
        assert.equal((await request('?area=services&' + range + '&' + filter)).status, 404);
      assert.equal(
        (await request('?' + range, { path: '/api/public/' + cid + '/admin/reports' })).status,
        404,
      );
      assert.equal(
        (
          await request('?' + range, {
            path: '/api/public/' + cid + '/admin/reports/export',
            csv: true,
            user: null,
          })
        ).status,
        404,
      );
      assert.equal((await request('?' + range, { path: '/api/reports' })).status, 404);
    },
  );
  await t.test(
    'shared cash policy preserves prior periods, partial receipts, cancellation and paid expense corrections',
    async () => {
      const feb = (await request('?' + range)).data;
      assert.deepEqual(feb.metrics, {
        expectedCents: 21000,
        completedCents: 16500,
        receivedCents: 6000,
        paidExpensesCents: 500,
        balanceCents: 5500,
      });
      assert.equal(feb.appointments.total, 6);
      assert.equal(feb.appointments.completed, 3);
      assert.equal(feb.appointments.cancelled, 1);
      assert.equal(feb.appointments.noShow, 1);
      const fin = (await request('?from=2024-02-01&to=2024-02-29', { path: '/api/admin/finance' }))
        .data;
      assert.deepEqual(feb.metrics, fin.metrics);
      const mar = (await request('?area=finance&period=custom&from=2024-03-01&to=2024-03-01')).data;
      assert.equal(mar.metrics.receivedCents, -2000);
      assert.equal(mar.metrics.paidExpensesCents, 200);
      assert.equal(mar.metrics.balanceCents, -2200);
      assert.equal(mar.financialSeries[0].balanceCents, -2200);
      const total = feb.financialSeries.reduce((n, r) => n + r.receivedCents, 0);
      assert.equal(total, feb.metrics.receivedCents);
      const all = (await request('?area=finance&period=custom&from=2024-02-01&to=2024-03-01')).data;
      assert.equal(all.metrics.receivedCents, 4000);
      assert.equal(all.metrics.paidExpensesCents, 700);
      assert.equal(
        (await request('?area=finance&' + range + '&type=payments&method=pix')).data.metrics
          .receivedCents,
        2000,
      );
      assert.equal(
        (await request('?area=finance&' + range + '&type=payments&method=cash')).data.metrics
          .receivedCents,
        4000,
      );
      const expenses = (await request('?area=finance&' + range + '&type=expenses')).data.metrics;
      assert.equal(expenses.receivedCents, 0);
      assert.equal(expenses.balanceCents, -500);
    },
  );
  await t.test(
    'historic service snapshots, multiservice nonduplication, rankings, combined filters and inactive professionals',
    async () => {
      const r = (await request('?area=services&' + range)).data;
      assert.equal(r.services.total, 3);
      assert.equal(r.services.serviceValueCents, 16500);
      const b = r.services.items.find((v) => v.id === 'report-service-b');
      assert.equal(b.quantity, 2);
      assert.equal(b.valueCents, 8000);
      assert.equal(b.active, 0);
      assert.equal(b.sharePercent, 48.48);
      const free = (await request('?area=services&period=custom&from=2000-01-01&to=2000-01-01'))
        .data;
      assert.equal(free.services.items[0].quantity, 1);
      assert.equal(free.services.items[0].valueCents, 0);
      assert.equal(free.services.items[0].sharePercent, null);
      assert.ok(
        r.services.items.some(
          (v) => v.name === 'Corte clássico histórico' && v.valueCents === 4500,
        ),
      );
      const filtered = (
        await request(
          '?area=services&' + range + '&professionalId=' + cid + '-pro&serviceId=report-service-b',
        )
      ).data;
      assert.equal(filtered.appointments.completed, 1);
      assert.equal(filtered.services.items[0].valueCents, 3000);
      const pros = (await request('?area=professionals&' + range + '&sort=value')).data;
      assert.equal(pros.professionals.items[0].quantity, 2);
      assert.equal(pros.professionals.items[0].valueCents, 11500);
      const inactive = pros.professionals.items.find((v) => v.id === 'report-inactive');
      assert.equal(inactive.active, 0);
      assert.equal(inactive.quantity, 1);
      assert.equal(inactive.cancelled, 1);
      assert.equal(inactive.valueCents, 5000);
      const one = (
        await request(
          '?area=professionals&' +
            range +
            '&serviceId=report-service-b&professionalId=' +
            cid +
            '-pro',
        )
      ).data;
      assert.equal(one.professionals.items[0].valueCents, 7000);
      const done = (
        await request(
          '?area=appointments&' + range + '&status=completed&professionalId=' + cid + '-pro',
        )
      ).data;
      assert.equal(done.appointments.total, 2);
      assert.equal(done.appointments.completed, 2);
      const cancelled = (await request('?area=appointments&' + range + '&status=cancelled')).data;
      assert.equal(cancelled.appointments.total, 1);
    },
  );
  await t.test(
    'company clock, leap dates, exact daily edges and future criteria use backend time',
    async () => {
      const now = new Date('2024-02-29T15:00:00Z');
      const snap = await db.transaction(
        (tx) =>
          reportsSnapshot(tx, cid, actor, { area: 'appointments', period: 'today' }, false, now),
        { readOnly: true },
      );
      assert.equal(snap.from, '2024-02-29');
      assert.equal(snap.appointments.future, 1);
      assert.equal(snap.appointments.total, 4);
      const started = await db.transaction(
        (tx) =>
          reportsSnapshot(
            tx,
            cid,
            actor,
            { area: 'appointments', period: 'today' },
            false,
            new Date('2024-02-29T16:00:00.001Z'),
          ),
        { readOnly: true },
      );
      assert.equal(started.appointments.future, 0);
      await db.run("UPDATE companies SET timezone='Pacific/Kiritimati' WHERE id=?", [other]);
      const tz = await db.transaction(
        (tx) =>
          reportsSnapshot(
            tx,
            other,
            actor,
            { period: 'today' },
            false,
            new Date('2024-02-29T23:30:00Z'),
          ),
        { readOnly: true },
      );
      assert.equal(tz.today, '2024-03-01');
      assert.equal(
        companyClock(new Date('2024-03-01T01:00Z'), 'America/Sao_Paulo').today,
        '2024-02-29',
      );
      await db.run("UPDATE companies SET timezone='America/Sao_Paulo' WHERE id=?", [other]);
      for (const q of [
        'area=finance&' + range + '&professionalId=' + cid + '-pro',
        'area=services&' + range + '&status=cancelled',
        'area=appointments&' + range + '&type=payments',
        'area=finance&' + range + '&method=pix',
        'area=finance&' + range + '&type=expenses&method=pix',
        'period=custom&from=2024-02-30&to=2024-03-01',
        'period=custom&from=2020-01-01&to=2024-03-01',
        'period=custom&from=2024-03-01&to=2024-02-01',
        'period=today&from=2024-02-01&to=2024-02-02',
        'period=custom',
        'page=0',
        'unexpected=1',
      ])
        assert.equal((await request('?' + q)).status, 400, q);
    },
  );
  await t.test(
    'CSV uses full filtered SQL aggregates, Brazilian cents, formula neutralization and no client PII',
    async () => {
      const cash = await request('?area=finance&' + range, {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.equal(cash.status, 200);
      assert.match(cash.headers.get('content-type'), /text\/csv/);
      assert.match(
        cash.headers.get('content-disposition'),
        /attachment; filename="gradefy-finance-/,
      );
      assert.match(cash.data, /"Recebimentos registrados";"60,00"/);
      assert.match(cash.data, /"Saldo operacional registrado";"55,00"/);
      assert.ok(cash.data.includes('\r\n'));
      assert.doesNotMatch(cash.data, /private@example|21999991111|Cliente privado|Nota privada/);
      const service = await request('?area=services&' + range + '&page=2', {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.equal(service.status, 200);
      assert.match(service.data, /"' \t=1\+1"/);
      assert.match(service.data, /"Serviço B histórico";"Inativo";"2";"80,00"/);
      const pro = await request('?area=professionals&' + range, {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.match(pro.data, /"'=HYPERLINK\(""unsafe""\)"/);
      const filtered = await request('?area=finance&' + range + '&type=payments&method=pix', {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.match(filtered.data, /"Recebimentos registrados";"20,00"/);
      const march = await request('?area=finance&period=custom&from=2024-03-01&to=2024-03-01', {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.match(march.data, /"Recebimentos registrados";"-20,00"/);
    },
  );
  await t.test(
    'read-only reporting preserves all records; legacy Igor and expired historical access remain intact',
    async () => {
      assert.deepEqual(await snapshot(), original);
      await db.run("UPDATE subscriptions SET status='expired' WHERE company_id=?", [cid]);
      const expired = await request('?' + range);
      assert.equal(expired.status, 200);
      assert.equal(expired.data.editable, false);
      assert.equal(
        (await request('?' + range, { path: '/api/admin/reports/export', csv: true })).status,
        200,
      );
      await db.run("UPDATE subscriptions SET status='active' WHERE company_id=?", [cid]);
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('igor-barber-club',?,'owner',?)",
        [actor, stamp],
      );
      assert.equal((await request('?' + range, { company: 'igor-barber-club' })).status, 200);
      const config = await request('', { path: '/api/config', user: null, company: null });
      assert.equal(config.status, 200);
      assert.match(
        (await db.get("SELECT name FROM companies WHERE id='igor-barber-club'")).name,
        /Igor/i,
      );
    },
  );
  await t.test(
    'large volume: database aggregates, bounded pagination and complete export beyond current page',
    async () => {
      const count = 10005;
      await db.transaction(async (tx) => {
        for (let start = 0; start < count; start += 200) {
          const size = Math.min(200, count - start),
            args = [],
            snap = [],
            cash = [];
          for (let i = start; i < start + size; i++) {
            args.push(
              'report-volume-' + i,
              cid,
              cid + '-pro',
              '2024-04-01',
              540,
              580,
              1,
              'completed',
              stamp,
            );
            snap.push(
              cid,
              'report-volume-' + i,
              cid + '-service',
              'Histórico ' + String(i).padStart(5, '0'),
              1,
              40,
            );
            cash.push(
              'report-cash-volume-' + i,
              cid,
              'report-volume-' + i,
              1,
              '2024-04-01T15:00:00.000Z',
              '2024-04-01',
              'cash',
              actor,
              stamp,
            );
          }
          await tx.run(
            'INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,created_at) VALUES ' +
              Array.from({ length: size }, () => '(?,?,?,?,?,?,?,?,?)').join(','),
            args,
          );
          await tx.run(
            'INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES ' +
              Array.from({ length: size }, () => '(?,?,?,?,?,?)').join(','),
            snap,
          );
          await tx.run(
            'INSERT INTO financial_payments(id,company_id,appointment_id,amount_cents,received_at,received_date,method,created_by,created_at) VALUES ' +
              Array.from({ length: size }, () => '(?,?,?,?,?,?,?,?,?)').join(','),
            cash,
          );
        }
      });
      const q = 'area=services&period=custom&from=2024-04-01&to=2024-04-01';
      const page = await request('?' + q + '&page=2');
      assert.equal(page.status, 200);
      assert.equal(page.data.services.total, count);
      assert.equal(page.data.services.items.length, 30);
      assert.equal(page.data.services.serviceValueCents, count);
      assert.equal(page.data.appointments.completed, count);
      const finance = (await request('?' + q.replace('area=services', 'area=finance'))).data;
      assert.equal(finance.metrics.receivedCents, count);
      assert.equal(finance.financialSeries.length, 1);
      assert.equal(finance.financialSeries[0].receivedCents, count);
      const exportedCash = await request('?' + q.replace('area=services', 'area=finance'), {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.equal(exportedCash.status, 200);
      assert.match(exportedCash.data, /"Recebimentos registrados";"100,05"/);
      assert.equal(
        (await request('?' + q, { path: '/api/admin/reports/export', csv: true })).status,
        413,
      );
      const professional = await request('?' + q.replace('area=services', 'area=professionals'), {
        path: '/api/admin/reports/export',
        csv: true,
      });
      assert.equal(professional.status, 200);
      assert.match(professional.data, /"10005";"0";"0";"100,05"/);
      // Narrowing by a professional with no entries permits an empty full export.
      assert.equal(
        (
          await request('?' + q + '&professionalId=report-inactive', {
            path: '/api/admin/reports/export',
            csv: true,
          })
        ).status,
        200,
      );
    },
  );
}
