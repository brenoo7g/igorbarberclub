import { reconstructPhaseFive } from './professionals-migration.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { addDays, dateInBrazil } from '../../server/domain.js';
import { lockBarbers, lockCatalog } from '../../server/scheduling-locks.js';
import {
  enqueueNotification,
  claimNotification,
  createNotificationProcessor,
} from '../../server/notifications.js';
import { runMigrations } from '../../server/migrations.js';
import { notificationLeaseColumns } from './notification-migration.js';
import { idempotent, cleanIdempotency } from '../../server/idempotency.js';

export async function assertReliabilityMigration(t, db) {
  await reconstructPhaseFive(db);
  // Disposable fixture only: reconstruct the exact 004 schema, then exercise 005 upgrade.
  await db.run('DROP TABLE idempotency_keys');
  await db.run('DROP INDEX notification_recovery');
  for (const column of notificationLeaseColumns)
    await db.run(`ALTER TABLE notifications DROP COLUMN ${column}`);
  await db.run('DELETE FROM schema_migrations WHERE version=5');
  const history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const before = JSON.stringify(await db.all('SELECT * FROM notifications'));
  const failing = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('CREATE INDEX notification_recovery'))
              throw new Error('injected 005 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(failing), /injected 005 failure/);
  assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), history);
  assert.equal(JSON.stringify(await db.all('SELECT * FROM notifications')), before);
  await assert.rejects(db.all('SELECT * FROM idempotency_keys'));
  await assert.rejects(db.all('SELECT claim_token FROM notifications'));
  assert.deepEqual(
    await runMigrations(db),
    [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
  );
  assert.deepEqual(await runMigrations(db), []);
  const version = await db.get('SELECT * FROM schema_migrations WHERE version=5');
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=5', ['0'.repeat(64)]);
  await assert.rejects(runMigrations(db), /Histórico de migrations incompatível/);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=5', [version.checksum]);
  assert.deepEqual(await runMigrations(db), []);
  for (const row of await db.all('SELECT * FROM notifications'))
    for (const column of notificationLeaseColumns) assert.equal(row[column], null);
  t.diagnostic(
    '005: upgrade 004, transactional DDL rollback, repeat, checksum and NULL defaults passed',
  );
}

export async function assertSchedulingReliability(t, db, second = db, repetitions = 5) {
  const A = 'igor-barber-club',
    B = 'reliability-b';
  await assert.rejects(lockBarbers(db, A), /Profissional obrigatório/);
  await assert.rejects(lockBarbers(db, A, ''), /Profissional obrigatório/);
  await db.run(
    "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,'Fixture','barbershop','barber-classic','2026','2026')",
    [B, B],
  );
  const secret = 'reliability-test-secret-at-least-thirty-two-characters';
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('reliability-user','Cliente Teste','reliability@example.test','21999999999','fixture','client','2026')",
  );
  for (const company of [A, B]) {
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'reliability-user','manager','2026')",
      [company],
    );
    await db.run(
      "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,'Serviço','Descrição',40,4000,'Corte')",
      [company, company + '-service'],
    );
  }
  for (const [company, id] of [
    [A, 'reliable-a'],
    [A, 'reliable-a2'],
    [B, 'reliable-b'],
  ]) {
    await db.run(
      "INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,?,'Profissional','Corte')",
      [company, id],
    );
    for (let weekday = 0; weekday < 7; weekday++)
      await db.run(
        "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,'09:00','19:00')",
        [company, id, weekday],
      );
  }
  await db.run(
    "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) SELECT b.company_id,b.id,s.id,'2026' FROM barbers b JOIN services s ON s.company_id=b.company_id",
  );
  const cookie = `session=${jwt.sign({ version: 0 }, secret, { subject: 'reliability-user', issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  const servers = [];
  async function start(source) {
    const server = createApp(source, { secret, test: true, serveStatic: false }).listen(
      0,
      '127.0.0.1',
    );
    await once(server, 'listening');
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}/api`;
  }
  const urls = [await start(db), await start(second)];
  t.after(async () => {
    for (const server of servers) await new Promise((done) => server.close(done));
  });
  const nativeFetch = globalThis.fetch;
  async function request(
    path,
    body,
    { method = 'POST', company = A, key, instance = 0, guestCookie } = {},
  ) {
    const response = await nativeFetch(urls[instance] + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: guestCookie ?? cookie,
        'X-Gradefy-Company-Id': company,
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const date = addDays(dateInBrazil(), 3);
  const body = (
    company = A,
    barberId = company === A ? 'reliable-a' : 'reliable-b',
    time = '09:00',
  ) => ({ barberId, date, time, services: [company + '-service'] });
  const path = (company = A) => (company === A ? '/appointments' : `/public/${B}/appointments`);
  const clear = async () => {
    for (const table of [
      'client_appointments',
      'notifications',
      'guest_appointments',
      'appointment_services',
      'appointments',
      'blocks',
      'idempotency_keys',
    ])
      await db.run(`DELETE FROM ${table}`);
  };
  const count = async (table) => Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n);
  const booking = async (company = A, options = {}) =>
    request(path(company), body(company), { company, ...options });
  await t.test(
    `A/D/E/F/G: ${repetitions} repetitions of same-slot, block, reschedule, cancel and duplicate-key races`,
    async () => {
      for (let iteration = 0; iteration < repetitions; iteration++) {
        await clear();
        let results = await Promise.all([booking(), booking(A, { instance: 1 })]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal(await count('appointments'), 1);
        assert.equal(await count('appointment_services'), 1);
        assert.equal(await count('notifications'), 2);
        await clear();
        results = await Promise.all([
          booking(),
          request(
            '/admin/blocks',
            { barberId: 'reliable-a', date, start: '09:00', end: '09:40', reason: 'Teste' },
            { instance: 1 },
          ),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        assert.equal((await count('appointments')) + (await count('blocks')), 1);
        assert.equal(await count('notifications'), (await count('appointments')) * 2);
        await clear();
        const original = await booking();
        assert.equal(original.status, 201);
        results = await Promise.all(
          ['09:40', '10:20'].map((time, instance) =>
            request(`/appointments/${original.body.id}/reschedule`, body(A, 'reliable-a', time), {
              method: 'PATCH',
              instance,
            }),
          ),
        );
        assert.deepEqual(
          results.map((r) => r.status),
          [200, 200],
        );
        assert.equal(await count('appointments'), 1);
        assert.equal(await count('appointment_services'), 1);
        assert.equal(await count('notifications'), 6);
        const current = await db.get('SELECT * FROM appointments');
        assert.ok([580, 620].includes(current.start_minute));
        assert.equal(current.end_minute - current.start_minute, 40);
        results = await Promise.all([
          request(`/appointments/${original.body.id}/reschedule`, body(A, 'reliable-a', '11:00'), {
            method: 'PATCH',
          }),
          request(`/appointments/${original.body.id}/cancel`, {}, { method: 'PATCH', instance: 1 }),
        ]);
        assert.equal(results[1].status, 200);
        assert.ok([200, 400].includes(results[0].status));
        assert.equal((await db.get('SELECT status FROM appointments')).status, 'cancelled');
        await clear();
        results = await Promise.all([
          booking(A, { key: 'same-key-123' }),
          booking(A, { key: 'same-key-123', instance: 1 }),
        ]);
        assert.deepEqual(
          results.map((r) => r.status),
          [201, 201],
        );
        assert.deepEqual(results[0].body, results[1].body);
        assert.equal(await count('appointments'), 1);
        assert.equal(await count('notifications'), 2);
        assert.equal(await count('idempotency_keys'), 1);
      }
    },
  );
  await t.test(
    'B/C/H/I: repeated independent companies/professionals, key scope, incompatible payload, replay original snapshot',
    async () => {
      for (let iteration = 0; iteration < repetitions; iteration++) {
        await clear();
        const results = await Promise.all([
          booking(A, { key: 'shared-key-123' }),
          booking(B, { key: 'shared-key-123', instance: 1 }),
          request('/appointments', body(A, 'reliable-a2')),
        ]);
        assert.deepEqual(
          results.map((r) => r.status),
          [201, 201, 201],
        );
        assert.equal(
          (
            await request('/appointments', body(A, 'reliable-a', '09:40'), {
              key: 'shared-key-123',
            })
          ).status,
          409,
        );
        assert.equal(
          (await request('/appointments', body(), { key: 'x'.repeat(129) })).status,
          400,
        );
        const original = results[0].body;
        assert.equal(
          (
            await request(
              `/appointments/${original.id}/reschedule`,
              body(A, 'reliable-a', '09:40'),
              {
                method: 'PATCH',
              },
            )
          ).status,
          200,
        );
        assert.deepEqual((await booking(A, { key: 'shared-key-123', instance: 1 })).body, original);
        // A's block does not suppress the corresponding B slot.
        assert.equal(
          (
            await request('/admin/blocks', {
              barberId: 'reliable-a',
              date,
              start: '11:00',
              end: '11:40',
              reason: 'Teste',
            })
          ).status,
          201,
        );
        assert.equal((await request(path(B), body(B, 'reliable-b', '11:00'))).status, 201);
        await assert.rejects(db.run("UPDATE idempotency_keys SET company_id='unknown-company'"));
        await assert.rejects(db.run('UPDATE idempotency_keys SET actor_hash=NULL'));
      }
    },
  );
  if (db.dialect === 'postgres')
    await t.test(
      'PG lock barrier proves B/other professional and read availability progress while A is locked',
      async () => {
        await clear();
        let unlock, ready;
        const barrier = new Promise((resolve) => {
          ready = resolve;
        });
        const release = new Promise((resolve) => {
          unlock = resolve;
        });
        const held = db.transaction(async (tx) => {
          await lockBarbers(tx, A, 'reliable-a');
          ready();
          await release;
        });
        await barrier;
        let timer;
        try {
          const independent = Promise.all([
            booking(B, { instance: 1 }),
            request('/appointments', body(A, 'reliable-a2'), { instance: 1 }),
            request(`/availability?date=${date}&barberId=reliable-a&services=${A}-service`, null, {
              method: 'GET',
              instance: 1,
            }),
          ]);
          const results = await Promise.race([
            independent,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('Independent agenda blocked')), 3000);
            }),
          ]);
          assert.deepEqual(
            results.map((r) => r.status),
            [201, 201, 200],
          );
        } finally {
          clearTimeout(timer);
          unlock();
          await held;
        }
      },
    );
  await t.test(
    'Service edit races use official price/duration and preserve snapshot; occupied target/admin cancellation',
    async () => {
      await clear();
      const results = await Promise.all([
        request('/appointments', { ...body(), expectedTotal: 4000, expectedDuration: 40 }),
        request(
          `/admin/services/${A}-service`,
          {
            name: 'Editado',
            description: 'Descrição',
            duration: 60,
            price: 6000,
            category: 'Corte',
          },
          { method: 'PUT', instance: 1 },
        ),
      ]);
      assert.equal(results[1].status, 200);
      assert.ok([201, 412].includes(results[0].status));
      if (results[0].status === 201) {
        const item = await db.get('SELECT * FROM appointment_services');
        assert.equal(item.duration, 40);
        assert.equal(item.price, 4000);
      }
      await db.run('UPDATE services SET duration=40,price=4000');
      await clear();
      const initial = await booking();
      const races = await Promise.all([
        request(`/appointments/${initial.body.id}/reschedule`, body(A, 'reliable-a', '09:40'), {
          method: 'PATCH',
        }),
        request('/appointments', body(A, 'reliable-a', '09:40'), { instance: 1 }),
      ]);
      assert.ok(races.some((r) => r.status === 409));
      const ending = await Promise.all([
        request(`/appointments/${initial.body.id}/reschedule`, body(A, 'reliable-a', '11:00'), {
          method: 'PATCH',
        }),
        request(
          `/admin/appointments/${initial.body.id}/status`,
          { status: 'cancelled' },
          { method: 'PATCH', instance: 1 },
        ),
      ]);
      assert.equal(ending[1].status, 200);
      assert.ok([200, 400].includes(ending[0].status));
      assert.equal(
        (await db.get('SELECT status FROM appointments WHERE id=?', [initial.body.id])).status,
        'cancelled',
      );
    },
  );
  if (db.dialect === 'postgres')
    await t.test(
      'PG catalog lock orders edits before confirmation; opposite barber moves never deadlock',
      async () => {
        await clear();
        let unlock, ready;
        const barrier = new Promise((resolve) => {
          ready = resolve;
        });
        const release = new Promise((resolve) => {
          unlock = resolve;
        });
        const held = db.transaction(async (tx) => {
          await lockCatalog(tx, A);
          await tx.run('UPDATE services SET duration=60,price=6000 WHERE company_id=?', [A]);
          ready();
          await release;
        });
        await barrier;
        let settled = false;
        const waiting = request(
          '/appointments',
          { ...body(), expectedTotal: 4000, expectedDuration: 40 },
          { instance: 1 },
        ).then((result) => {
          settled = true;
          return result;
        });
        try {
          assert.equal((await booking(B)).status, 201);
          assert.equal(settled, false);
        } finally {
          unlock();
          await held;
        }
        assert.equal((await waiting).status, 412);
        await db.run('UPDATE services SET duration=40,price=4000');
        for (let iteration = 0; iteration < repetitions; iteration++) {
          await clear();
          const x = await booking(),
            y = await request('/appointments', body(A, 'reliable-a2'));
          const moves = await Promise.all([
            request(`/appointments/${x.body.id}/reschedule`, body(A, 'reliable-a2', '09:40'), {
              method: 'PATCH',
            }),
            request(`/appointments/${y.body.id}/reschedule`, body(A, 'reliable-a', '09:40'), {
              method: 'PATCH',
              instance: 1,
            }),
          ]);
          assert.deepEqual(
            moves.map((r) => r.status),
            [200, 200],
          );
          assert.equal(await count('appointment_services'), 2);
        }
      },
    );
  await t.test(
    'Guest idempotency needs an opaque context, preserves history and returns the same booking',
    async () => {
      await clear();
      const data = {
        ...body(),
        guest: { name: 'Visitante Teste', email: 'guest@example.test', phone: '21999999999' },
      };
      assert.equal(
        (await request('/appointments/guest', data, { guestCookie: '', key: 'visitor-key-123' }))
          .status,
        428,
      );
      const context = await request('/auth/me', null, { method: 'GET', guestCookie: '' });
      assert.ok(context.cookie);
      const result = await request('/appointments/guest', data, {
        guestCookie: context.cookie,
        key: 'visitor-key-123',
      });
      assert.equal(result.status, 201);
      const repeated = await request('/appointments/guest', data, {
        guestCookie: context.cookie,
        key: 'visitor-key-123',
        instance: 1,
      });
      assert.deepEqual(repeated.body, result.body);
      assert.equal(await count('guest_appointments'), 1);
      assert.equal(
        (await request('/appointments', null, { method: 'GET', guestCookie: context.cookie })).body
          .length,
        1,
      );
    },
  );
  await t.test(
    'Outbox failure rolls back appointment, snapshots and idempotency; block creation replay',
    async () => {
      await clear();
      const broken = {
        ...db,
        transaction: (fn) =>
          db.transaction((tx) =>
            fn({
              ...tx,
              run: (sql, args) => {
                if (sql.includes('INSERT INTO notifications'))
                  throw new Error('injected outbox failure');
                return tx.run(sql, args);
              },
            }),
          ),
      };
      const brokenUrl = await start(broken);
      const result = await nativeFetch(brokenUrl + '/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          'Idempotency-Key': 'failed-key-123',
        },
        body: JSON.stringify(body()),
      });
      assert.equal(result.status, 500);
      for (const table of [
        'appointments',
        'appointment_services',
        'notifications',
        'idempotency_keys',
      ])
        assert.equal(await count(table), 0);
      const data = { barberId: 'reliable-a', date, start: '09:00', end: '09:40', reason: 'Teste' };
      const blocks = await Promise.all([
        request('/admin/blocks', data, { key: 'block-key-123' }),
        request('/admin/blocks', data, { key: 'block-key-123', instance: 1 }),
      ]);
      assert.deepEqual(
        blocks.map((r) => r.status),
        [201, 201],
      );
      assert.deepEqual(blocks[0].body, blocks[1].body);
      assert.equal(await count('blocks'), 1);
    },
  );
  await clear();
  const initial = await booking();
  assert.equal(initial.status, 201);
  await t.test(
    'Idempotency has a bounded per-actor quota and expiration frees capacity',
    async () => {
      const key = { actorHash: 'a'.repeat(64), keyHash: 'b'.repeat(64) };
      const args = [];
      for (let i = 0; i < 1000; i++)
        args.push(
          A,
          key.actorHash,
          'block',
          String(i).padStart(64, '0'),
          'c'.repeat(64),
          '{}',
          '2000-01-01',
          '2999-01-01',
        );
      await db.run(
        `INSERT INTO idempotency_keys(company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at) VALUES ${Array(1000).fill('(?,?,?,?,?,?,?,?)').join(',')}`,
        args,
      );
      let performed = 0;
      const perform = () => {
        performed++;
        return { id: 'quota-test' };
      };
      await assert.rejects(
        db.transaction((tx) => idempotent(tx, A, 'block', key, {}, perform)),
        { status: 429 },
      );
      assert.equal(performed, 0);
      await db.run('UPDATE idempotency_keys SET expires_at=? WHERE actor_hash=?', [
        '2000-01-02',
        key.actorHash,
      ]);
      await cleanIdempotency(db, A);
      assert.equal(
        Number(
          (
            await db.get('SELECT COUNT(*) AS n FROM idempotency_keys WHERE actor_hash=?', [
              key.actorHash,
            ])
          ).n,
        ),
        0,
      );
      assert.deepEqual(await db.transaction((tx) => idempotent(tx, A, 'block', key, {}, perform)), {
        id: 'quota-test',
      });
      assert.equal(performed, 1);
    },
  );
  const previousEnv = { ...process.env };
  process.env.RESEND_API_KEY = 'placeholder';
  process.env.EMAIL_FROM = 'test@example.test';
  delete process.env.TWILIO_CONTENT_SID;
  t.after(() => {
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'TWILIO_CONTENT_SID']) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });
  await t.test(
    `J/K/L: ${repetitions} repetitions of workers/lease recovery; stable payload, max retries and ambiguous delivery`,
    async () => {
      let calls = [],
        failure = false;
      const mocked = t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return new Response('{}', { status: failure ? 503 : 202 });
      });
      const reset = async () => {
        await db.run('DELETE FROM notifications');
        await enqueueNotification(db, A, initial.body.id, 'confirmed');
        await db.run("DELETE FROM notifications WHERE channel='whatsapp'");
        calls = [];
      };
      for (let i = 0; i < repetitions; i++) {
        await reset();
        await Promise.all([
          createNotificationProcessor(db, A)(),
          createNotificationProcessor(second, A)(),
        ]);
        assert.equal(calls.length, 1);
        assert.equal((await db.get('SELECT status FROM notifications')).status, 'sent');
        await reset();
        const claimed = await claimNotification(db, A, ['email']);
        assert.ok(claimed.claim_token);
        assert.equal(await claimNotification(second, A, ['email']), null);
        await db.run("UPDATE notifications SET lease_expires_at='2000'");
        await createNotificationProcessor(second, A)();
        assert.equal(calls.length, 1);
        const row = await db.get('SELECT * FROM notifications');
        assert.equal(row.status, 'sent');
        assert.equal(row.attempts, 2);
        assert.equal(calls[0].options.body, claimed.delivery_payload);
      }
      for (let iteration = 0; iteration < repetitions; iteration++) {
        await reset();
        failure = true;
        const processor = createNotificationProcessor(db, A);
        for (let attempt = 1; attempt <= 5; attempt++) {
          await processor();
          const row = await db.get('SELECT * FROM notifications');
          assert.equal(row.attempts, attempt);
          assert.equal(row.status, attempt === 5 ? 'failed' : 'pending');
          assert.ok(Date.parse(row.next_attempt_at) > Date.now());
          await db.run(
            "UPDATE users SET email='changed-reliability@example.test' WHERE id='reliability-user'",
          );
          await db.run("UPDATE notifications SET next_attempt_at='2000'");
        }
        await processor();
        assert.equal(calls.length, 5);
        assert.equal(new Set(calls.map((c) => c.options.body)).size, 1);
      }
      await reset();
      const orphan = await claimNotification(db, A, ['email']);
      await db.run("UPDATE notifications SET channel='whatsapp',lease_expires_at='2000'");
      assert.deepEqual(await claimNotification(db, A, ['whatsapp']), { skipped: true });
      assert.equal(
        (await db.get('SELECT status FROM notifications WHERE id=?', [orphan.id])).status,
        'review',
      );
      await reset();
      await claimNotification(db, A, ['email']);
      await db.run("UPDATE notifications SET lease_expires_at='2000',first_attempt_at='2000'");
      assert.deepEqual(await claimNotification(db, A, ['email']), { skipped: true });
      assert.equal((await db.get('SELECT status FROM notifications')).status, 'review');
      await reset();
      failure = false;
      let unblock, started;
      const barrier = new Promise((resolve) => {
        started = resolve;
      });
      const gate = new Promise((resolve) => {
        unblock = resolve;
      });
      let sends = 0;
      mocked.mock.mockImplementation(async (_url, options) => {
        calls.push({ options });
        if (++sends === 1) {
          started();
          await gate;
          return new Response('{}', { status: 503 });
        }
        return new Response('{}', { status: 202 });
      });
      const late = createNotificationProcessor(db, A)();
      await barrier;
      try {
        await db.run("UPDATE notifications SET lease_expires_at='2000'");
        await createNotificationProcessor(second, A)();
      } finally {
        unblock();
        await late;
      }
      const acknowledged = await db.get('SELECT * FROM notifications');
      assert.equal(acknowledged.status, 'sent');
      assert.equal(acknowledged.attempts, 2);
      assert.equal(acknowledged.error, null);
      assert.equal(
        calls[0].options.headers['Idempotency-Key'],
        calls[1].options.headers['Idempotency-Key'],
      );
      assert.equal(calls[0].options.body, calls[1].options.body);
      mocked.mock.restore();
    },
  );
  t.diagnostic(
    `${db.dialect}: A/B/C/D/E/F/G/H/I/J/K/L repeated ${repetitions} times; two application instances; PostgreSQL is the concurrency authority`,
  );
}
