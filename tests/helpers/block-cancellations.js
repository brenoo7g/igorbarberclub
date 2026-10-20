import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { addDays, dateInTimezone } from '../../server/domain.js';
import { runMigrations } from '../../server/migrations.js';
import {
  createNotificationProcessor,
  NOTIFICATION_MAX_ATTEMPTS,
} from '../../server/notifications.js';
import { installProfessionalBrowserFixture } from './professional-browser.js';
import { reconstructBeforeBlockCancellation } from './block-cancellation-migration.js';

export async function assertBlockCancellationMigration(t, db) {
  const journal = await db.all('SELECT * FROM schema_migrations WHERE version<21 ORDER BY version');
  const legacy = await db.all(
    'SELECT id,status,date,start_minute,end_minute,total FROM appointments ORDER BY id',
  );
  await reconstructBeforeBlockCancellation(db);
  await assert.rejects(
    runMigrations({
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            ...tx,
            run(sql, args) {
              if (sql.includes('CREATE TABLE agenda_block_cancellations'))
                throw Error('injected 021 failure');
              return tx.run(sql, args);
            },
          }),
        ),
    }),
    /injected 021/,
  );
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=21'), undefined);
  await assert.rejects(db.all('SELECT * FROM agenda_block_operations'));
  await assert.rejects(db.all('SELECT cancellation_reason FROM appointments'));
  assert.deepEqual(await runMigrations(db), [21]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<21 ORDER BY version'),
    journal,
  );
  assert.deepEqual(
    await db.all(
      'SELECT id,status,date,start_minute,end_minute,total FROM appointments ORDER BY id',
    ),
    legacy,
  );
  await assert.rejects(
    db.run(
      "INSERT INTO agenda_block_operations(id,company_id,barber_id,actor_id,from_date,to_date,start_minute,end_minute,reason_code,public_reason,created_at) VALUES(NULL,'igor-barber-club','igor','missing','2030-01-01','2030-01-01',0,1440,'other','Motivo público','2026')",
    ),
  );
  t.diagnostic(
    '021 additive, repeated, atomic rollback, mandatory IDs and previous checksums preserved',
  );
}

export async function assertBlockCancellations(t, db, second = db) {
  const transportEnvironment = Object.fromEntries(
    ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'].map((k) => [k, process.env[k]]),
  );
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  t.after(() => {
    for (const [key, value] of Object.entries(transportEnvironment))
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
  await seed(db);
  await installProfessionalBrowserFixture(db, 'test-only-password');
  const cid = 'staff-browser-a',
    pid = cid + '-p2',
    secret = 'block-cancellation-test-signing-key-only';
  await db.run("UPDATE companies SET template_id='gradefy-minisite',site_published=1 WHERE id=?", [
    cid,
  ]);
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('block-client','Cliente Cancelamento','block-client@example.test','21988887777','test','client','2026')",
  );
  let inject = false;
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run(sql, args) {
              if (inject && sql.startsWith('INSERT INTO agenda_block_cancellations')) {
                inject = false;
                throw Error('injected cancellation rollback');
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((connection) =>
    createApp(connection, { secret, test: true, serveStatic: false }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));
  const fetchHttp = globalThis.fetch;
  const token = (id, audience = 'barber-web') =>
    jwt.sign({ version: 0 }, secret, { subject: id, issuer: 'igor-barber-club', audience });
  async function req(
    path,
    {
      method = 'GET',
      body,
      user = 'staff-browser-second',
      company = cid,
      key,
      instance = 0,
      client = false,
    } = {},
  ) {
    const r = await fetchHttp(
      'http://127.0.0.1:' + servers[instance].address().port + '/api' + path,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(user
            ? {
                Cookie:
                  (client ? 'gradefy-client=' : 'session=') +
                  token(user, client ? 'gradefy-client' : 'barber-web'),
              }
            : {}),
          ...(company ? { 'X-Gradefy-Company-Id': company } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, data: await r.json() };
  }
  const today = dateInTimezone(),
    base = addDays(today, 4);
  const makePeriod = (offset = 0, patch = {}) => ({
    from: addDays(base, offset),
    to: addDays(base, offset),
    fullDay: false,
    start: '09:00',
    end: '10:00',
    ...patch,
  });
  async function appointment(
    date,
    start = 540,
    { status = 'confirmed', barber = pid, email = 'block-client@example.test', user = null } = {},
  ) {
    const id = randomUUID();
    await db.run(
      'INSERT INTO appointments(id,company_id,user_id,barber_id,date,start_minute,end_minute,total,status,guest_name,guest_email,guest_phone,created_at) VALUES(?,?,?,?,?,?,?,4500,?,?,?,?,?)',
      [
        id,
        cid,
        user,
        barber,
        date,
        start,
        start + 40,
        status,
        user ? null : 'Cliente Snapshot',
        user ? null : email,
        '21988887777',
        new Date().toISOString(),
      ],
    );
    await db.run(
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,'Serviço Histórico',4500,40)",
      [cid, id, cid + '-service'],
    );
    return id;
  }
  const preview = async (period, opts = {}) => {
    const r = await req('/professional/blocks/preview', { method: 'POST', body: period, ...opts });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  };
  const body = (p, patch = {}) => ({
    period: p.period,
    previewToken: p.previewToken,
    confirmed: true,
    reasonCode: 'unavailable',
    internalNotes: 'Observação interna confidencial',
    ...patch,
  });
  const confirm = (p, opts = {}, patch = {}) =>
    req('/professional/blocks/confirm', {
      method: 'POST',
      body: body(p, patch),
      key: randomUUID(),
      ...opts,
    });
  const status = async (id) =>
    (await db.get('SELECT status FROM appointments WHERE company_id=? AND id=?', [cid, id])).status;

  await t.test(
    'preview and explicit confirmation; abandoning the preview writes nothing; invalid permissions and dates fail',
    async () => {
      const id = await appointment(base);
      const before = await db.get('SELECT COUNT(*) AS n FROM blocks');
      const p = await preview(makePeriod());
      assert.equal(p.count, 1);
      assert.equal(p.appointments[0].id, id);
      assert.equal((await db.get('SELECT COUNT(*) AS n FROM blocks')).n, before.n);
      assert.equal(await status(id), 'confirmed');
      assert.equal(
        (
          await req('/professional/blocks/confirm', {
            method: 'POST',
            key: randomUUID(),
            body: body(p, { confirmed: false }),
          })
        ).status,
        400,
      );
      assert.equal((await confirm(p, { key: undefined })).status, 428);
      assert.equal(
        (
          await req('/professional/blocks/preview', {
            method: 'POST',
            body: makePeriod(),
            user: null,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await req('/professional/blocks/preview', {
            method: 'POST',
            body: makePeriod(),
            company: 'staff-browser-b',
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await req('/professional/blocks/preview', {
            method: 'POST',
            body: makePeriod(0, { professionalId: cid + '-p1' }),
          })
        ).status,
        400,
      );
      for (const from of ['2026-02-30', '0000-00-00', 'invalid'])
        assert.equal(
          (
            await req('/professional/blocks/preview', {
              method: 'POST',
              body: makePeriod(0, { from }),
            })
          ).status,
          400,
        );
      assert.equal(
        (
          await req('/professional/blocks/preview', {
            method: 'POST',
            body: makePeriod(0, { from: addDays(today, -1), to: today }),
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'empty block, single confirmed booking, public reason, audit, idempotent loss/replay and changed payload',
    async () => {
      const empty = await confirm(await preview(makePeriod(1)));
      assert.equal(empty.status, 201);
      assert.equal(empty.data.cancelled, 0);
      const p = await preview(makePeriod()),
        key = randomUUID();
      const saved = await confirm(p, { key });
      assert.equal(saved.status, 201);
      assert.equal(saved.data.cancelled, 1);
      assert.equal(saved.data.notifications.attention, 1);
      assert.equal(saved.data.notifications.processed, 0);
      const repeated = await confirm(p, { key });
      assert.equal(repeated.data.id, saved.data.id);
      assert.deepEqual(repeated.data.appointmentIds, saved.data.appointmentIds);
      assert.equal((await confirm(p, { key }, { reasonCode: 'personal' })).status, 409);
      assert.equal(
        Number(
          (
            await db.get(
              'SELECT COUNT(*) AS n FROM agenda_block_cancellations WHERE operation_id=?',
              [saved.data.id],
            )
          ).n,
        ),
        1,
      );
      const audit = await db.get('SELECT * FROM agenda_block_operations WHERE id=?', [
        saved.data.id,
      ]);
      assert.equal(audit.actor_id, 'staff-browser-second');
      assert.equal(audit.internal_notes, 'Observação interna confidencial');
      const notification = await db.get(
        'SELECT payload FROM notifications WHERE id=(SELECT notification_id FROM agenda_block_cancellations WHERE operation_id=?)',
        [saved.data.id],
      );
      assert.ok(!notification.payload.includes('confidencial'));
    },
  );
  await t.test(
    'partial overlap uses appointment duration; boundaries, completed, cancelled and other professionals remain untouched',
    async () => {
      const d = addDays(base, 2),
        ids = await Promise.all([
          appointment(d, 540),
          appointment(d, 580),
          appointment(d, 550, { status: 'completed' }),
          appointment(d, 550, { status: 'cancelled' }),
          appointment(d, 550, { barber: cid + '-p1' }),
        ]);
      const p = await preview(makePeriod(2, { start: '09:20', end: '09:40' }));
      assert.equal(p.count, 1);
      assert.equal((await confirm(p)).data.cancelled, 1);
      assert.deepEqual(await Promise.all(ids.map(status)), [
        'cancelled',
        'confirmed',
        'completed',
        'cancelled',
        'confirmed',
      ]);
    },
  );
  await t.test(
    'whole day, multiple days and full week cancel only matching confirmed bookings with one outbox email each',
    async () => {
      for (const [offset, days] of [
        [4, 1],
        [6, 3],
        [12, 7],
      ]) {
        const ids = [];
        for (let i = 0; i < days; i++)
          for (const start of [540, 1000])
            ids.push(await appointment(addDays(base, offset + i), start));
        const p = await preview(
          makePeriod(offset, {
            to: addDays(base, offset + days - 1),
            fullDay: true,
            start: undefined,
            end: undefined,
          }),
        );
        assert.equal(p.count, ids.length);
        const saved = await confirm(p);
        assert.equal(saved.status, 201);
        assert.equal(saved.data.cancelled, ids.length);
        assert.equal(
          Number(
            (
              await db.get(
                'SELECT COUNT(*) AS n FROM agenda_block_cancellations WHERE operation_id=?',
                [saved.data.id],
              )
            ).n,
          ),
          ids.length,
        );
        assert.ok((await Promise.all(ids.map(status))).every((s) => s === 'cancelled'));
      }
    },
  );
  await t.test(
    'invalid email is a visible manual-contact failure; public history, financial receipts and snapshots are preserved',
    async () => {
      const d = addDays(base, 22),
        bad = await appointment(d, 540, { email: 'invalid' }),
        paid = await appointment(d, 600, { user: 'block-client' });
      await db.run(
        "INSERT INTO financial_payments(id,company_id,appointment_id,amount_cents,received_at,received_date,method,created_by,created_at) VALUES(?,?,?,1000,?,?,'pix','staff-browser-owner',?)",
        [randomUUID(), cid, paid, new Date().toISOString(), today, new Date().toISOString()],
      );
      const before = await db.get('SELECT * FROM appointments WHERE id=?', [paid]);
      const p = await preview(makePeriod(22, { fullDay: true, start: undefined, end: undefined }));
      const saved = await confirm(
        p,
        {},
        { reasonCode: 'other', publicReason: 'Manutenção <programada> & ajustes.' },
      );
      assert.equal(saved.data.cancelled, 2);
      const badJob = await db.get(
        'SELECT n.* FROM notifications n JOIN agenda_block_cancellations c ON c.notification_id=n.id AND c.company_id=n.company_id WHERE c.appointment_id=?',
        [bad],
      );
      assert.equal(badJob.status, 'failed');
      assert.equal(badJob.attempts, 0);
      const history = await req('/public/' + cid + '/appointments', {
        user: 'block-client',
        client: true,
      });
      assert.equal(history.status, 200);
      assert.equal(
        history.data.find((a) => a.id === paid).cancellation_reason,
        'Manutenção <programada> & ajustes.',
      );
      assert.ok(!JSON.stringify(history.data).includes('confidencial'));
      const after = await db.get('SELECT * FROM appointments WHERE id=?', [paid]);
      for (const field of ['id', 'date', 'start_minute', 'end_minute', 'total', 'created_at'])
        assert.equal(after[field], before[field]);
      assert.equal(
        Number(
          (
            await db.get('SELECT COUNT(*) AS n FROM financial_payments WHERE appointment_id=?', [
              paid,
            ])
          ).n,
        ),
        1,
      );
      assert.equal(
        Number((await db.get('SELECT COUNT(*) AS n FROM financial_payment_reversals')).n),
        0,
      );
      const ops = await req('/admin/agenda/blocks/operations', { user: 'staff-browser-owner' });
      assert.equal(ops.status, 200);
      assert.equal(
        ops.data
          .find((o) => o.id === saved.data.id)
          .notifications.items.find((n) => n.appointmentId === paid).paidCents,
        1000,
      );
    },
  );
  await t.test(
    'changed impact requires a fresh confirmation; SQL failure rolls back blocks, cancellations, audit, outbox and key',
    async () => {
      let p = await preview(makePeriod(24));
      const id = await appointment(addDays(base, 24));
      assert.equal((await confirm(p)).status, 409);
      assert.equal(await status(id), 'confirmed');
      p = await preview(makePeriod(24));
      const before = {
        blocks: (await db.get('SELECT COUNT(*) AS n FROM blocks')).n,
        notifications: (await db.get('SELECT COUNT(*) AS n FROM notifications')).n,
        operations: (await db.get('SELECT COUNT(*) AS n FROM agenda_block_operations')).n,
      };
      inject = true;
      const key = randomUUID();
      assert.equal((await confirm(p, { key, instance: 2 })).status, 500);
      assert.equal(await status(id), 'confirmed');
      for (const [table, expected] of [
        ['blocks', before.blocks],
        ['notifications', before.notifications],
        ['agenda_block_operations', before.operations],
      ])
        assert.equal((await db.get('SELECT COUNT(*) AS n FROM ' + table)).n, expected);
      assert.equal((await confirm(p, { key })).status, 201);
    },
  );
  await t.test(
    'two initializations confirming the same key create one operation and one cancellation',
    async () => {
      const id = await appointment(addDays(base, 25)),
        p = await preview(makePeriod(25)),
        key = randomUUID();
      const pair = await Promise.all([confirm(p, { key }), confirm(p, { key, instance: 1 })]);
      assert.deepEqual(
        pair.map((r) => r.status),
        [201, 201],
      );
      assert.equal(pair[0].data.id, pair[1].data.id);
      assert.equal(await status(id), 'cancelled');
    },
  );
  await t.test(
    'real reservation and block race cannot both succeed over an unseen appointment',
    async () => {
      const dates = (await req('/public/' + cid + '/barbers/' + pid + '/schedule', { user: null }))
        .data.dates;
      const date = dates.find((d) => d > addDays(today, 1) && d < base);
      assert.ok(date, 'fixture offers a nearby free future day');
      const p = await preview({
        from: date,
        to: date,
        fullDay: false,
        start: '09:00',
        end: '10:00',
      });
      const pair = await Promise.all([
        confirm(p),
        req('/public/' + cid + '/appointments', {
          method: 'POST',
          client: true,
          user: 'block-client',
          instance: 1,
          body: {
            services: [cid + '-service'],
            barberId: pid,
            date,
            time: '09:00',
            expectedTotal: 4500,
            expectedDuration: 40,
          },
        }),
      ]);
      assert.equal(pair.filter((r) => r.status === 201).length, 1, JSON.stringify(pair));
      assert.ok(pair.some((r) => r.status === 409));
    },
  );
  await t.test(
    'reschedule racing a block cannot move a cancelled historical reservation',
    async () => {
      const date = addDays(today, 1),
        id = await appointment(date, 620, { user: 'block-client' });
      const p = await preview({
        from: date,
        to: date,
        fullDay: false,
        start: '10:00',
        end: '11:00',
      });
      const pair = await Promise.all([
        confirm(p),
        req('/public/' + cid + '/appointments/' + id + '/reschedule', {
          method: 'PATCH',
          user: 'block-client',
          client: true,
          instance: 1,
          body: {
            services: [cid + '-service'],
            barberId: pid,
            date,
            time: '14:00',
            expectedTotal: 4500,
            expectedDuration: 40,
          },
        }),
      ]);
      const row = await db.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [cid, id]);
      if (pair[0].status === 201) {
        assert.ok([400, 409].includes(pair[1].status), JSON.stringify(pair));
        assert.equal(row.status, 'cancelled');
        assert.equal(row.start_minute, 620);
        assert.equal(row.date, date);
      } else {
        assert.equal(pair[0].status, 409, JSON.stringify(pair));
        assert.equal(pair[1].status, 200);
        assert.equal(row.status, 'confirmed');
        assert.equal(row.start_minute, 840);
      }
    },
  );
  await t.test(
    'provider absent does not send; simulated retry reuses key/payload, records acceptance only and isolates customer emails',
    async (ct) => {
      const old = Object.fromEntries(
        ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'].map((k) => [k, process.env[k]]),
      );
      ct.after(() => {
        for (const [k, v] of Object.entries(old))
          v === undefined ? delete process.env[k] : (process.env[k] = v);
      });
      delete process.env.RESEND_API_KEY;
      delete process.env.EMAIL_FROM;
      let calls = 0;
      const sent = new Map();
      let fail = true;
      ct.mock.method(globalThis, 'fetch', async (url, options) => {
        assert.equal(url, 'https://api.resend.com/emails');
        calls++;
        const key = options.headers['Idempotency-Key'];
        const payload = JSON.parse(options.body);
        assert.equal(payload.to.length, 1);
        assert.ok(payload.to[0].endsWith('@example.test'));
        assert.ok(!options.body.includes('confidencial'));
        const previous = sent.get(key);
        if (previous) assert.equal(previous.body, options.body);
        else sent.set(key, { body: options.body, payload });
        if (fail) return new Response('{}', { status: 503 });
        return Response.json({ id: 'provider-' + key });
      });
      const worker = createNotificationProcessor(db, cid, { batchSize: 100 });
      await worker();
      assert.equal(calls, 0);
      process.env.RESEND_API_KEY = 'mock-only';
      process.env.EMAIL_FROM = 'Teste <test@example.test>';
      process.env.APP_URL = 'https://gradefy.example.test';
      await worker();
      assert.ok(calls > 0);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM notifications WHERE company_id=? AND status='sent'",
              [cid],
            )
          ).n,
        ),
        0,
      );
      fail = false;
      await db.run(
        "UPDATE notifications SET next_attempt_at='2000-01-01' WHERE company_id=? AND status='pending'",
        [cid],
      );
      await Promise.all([worker(), createNotificationProcessor(second, cid, { batchSize: 100 })()]);
      const job = await db.get(
        "SELECT * FROM notifications WHERE company_id=? AND payload LIKE '%Manutenção%' AND status='sent'",
        [cid],
      );
      assert.ok(job);
      assert.equal(job.attempts, 2);
      assert.ok(job.submitted_at);
      assert.equal(job.provider_message_id, 'provider-' + job.id);
      const email = sent.get(job.id).payload;
      assert.equal(email.subject, 'Seu agendamento foi cancelado — Equipe de Atendimento');
      assert.ok(email.text.includes('Cliente Cancelamento'));
      assert.ok(email.text.includes('Serviço Histórico'));
      assert.ok(email.text.includes('Maria Profissional'));
      assert.ok(email.text.includes('10:00'));
      assert.ok(email.text.includes('Manutenção <programada> & ajustes.'));
      assert.ok(email.html.includes('&lt;programada&gt; &amp; ajustes.'));
      assert.ok(email.html.includes('https://gradefy.example.test/' + cid + '/agendar'));
      assert.ok(!email.html.includes('/app/'));
      const count = calls;
      await worker();
      assert.equal(calls, count);
      const failedId = await appointment(addDays(base, 27));
      await confirm(await preview(makePeriod(27)));
      await db.run(
        'UPDATE notifications SET attempts=?,first_attempt_at=?,delivery_payload=? WHERE company_id=? AND appointment_id=?',
        [NOTIFICATION_MAX_ATTEMPTS, new Date().toISOString(), '{}', cid, failedId],
      );
      await worker();
      assert.equal(
        (
          await db.get('SELECT status FROM notifications WHERE company_id=? AND appointment_id=?', [
            cid,
            failedId,
          ])
        ).status,
        'failed',
      );
    },
  );
}
