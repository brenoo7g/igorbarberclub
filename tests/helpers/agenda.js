import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { runMigrations, migrations, readMigration } from '../../server/migrations.js';
import { reconstructBeforeAgenda } from './site-editor-migration.js';
import { addDays, dateInBrazil, isFuture, availableSlots } from '../../server/domain.js';
import { checkExpected, reservationFingerprint } from '../../server/agenda.js';

export async function assertAgendaMigration(t, db) {
  await seed(db);
  await db.run(
    "INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES('igor-barber-club','agenda-migration-preserved','igor','2050-01-01',540,580,3500,'confirmed','Legado migration','2026')",
  );
  const before = await db.all('SELECT id,date,status,total FROM appointments ORDER BY id');
  await reconstructBeforeAgenda(db);
  await db.run(
    "INSERT INTO idempotency_keys(company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at) VALUES('igor-barber-club',?,'booking',?,?,'{\"preserved\":true}','2026-01-01','2030-01-01')",
    ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)],
  );
  const keysBefore = await db.all(
    'SELECT * FROM idempotency_keys ORDER BY company_id,operation,key_hash',
  );
  await assert.rejects(
    db.run(
      "INSERT INTO idempotency_keys(company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at) VALUES('igor-barber-club',?,'manual-booking',?,?,'{}','2026-01-01','2030-01-01')",
      ['a'.repeat(64), 'd'.repeat(64), 'c'.repeat(64)],
    ),
  );
  const history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const faulty = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('INSERT INTO schema_migrations'))
              throw new Error('injected 012 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(faulty), /injected 012 failure/);
  await assert.rejects(db.all('SELECT notes FROM appointments'));
  assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), history);
  assert.deepEqual(
    await db.all('SELECT * FROM idempotency_keys ORDER BY company_id,operation,key_hash'),
    keysBefore,
  );
  assert.deepEqual(await runMigrations(db), [12, 13, 14, 15, 16, 17]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(
    await db.all('SELECT id,date,status,total FROM appointments ORDER BY id'),
    before,
  );
  assert.ok((await db.all('SELECT notes FROM appointments')).every((a) => a.notes === ''));
  assert.deepEqual(
    await db.all('SELECT * FROM idempotency_keys ORDER BY company_id,operation,key_hash'),
    keysBefore,
  );
  const sample = before[0].id;
  await assert.rejects(db.run('UPDATE appointments SET notes=NULL WHERE id=?', [sample]));
  await assert.rejects(
    db.run('UPDATE appointments SET notes=? WHERE id=?', ['x'.repeat(1001), sample]),
  );
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<12 ORDER BY version'),
    history,
  );
  const recorded = await db.get('SELECT checksum FROM schema_migrations WHERE version=12');
  assert.equal(recorded.checksum, readMigration(migrations[11]).checksum);
  t.diagnostic(
    '012 additive notes: rollback, repeated execution, legacy preservation and original checksums passed',
  );
}
export async function assertAgenda(t, db, second = db) {
  await seed(db);
  const legacy = await db.all(
    "SELECT * FROM appointments WHERE company_id='igor-barber-club' ORDER BY id",
  );
  const secret = 'agenda-disposable-test-secret',
    cookies = {};
  for (const user of ['owner', 'manager', 'professional', 'outsider', 'customer', 'customer-b']) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999999999','test','client','2026')",
      ['agenda-' + user, 'Cliente ' + user, user + '@agenda.test'],
    );
    cookies[user] =
      'session=' +
      jwt.sign({ version: 0 }, secret, {
        subject: 'agenda-' + user,
        issuer: 'igor-barber-club',
        audience: 'barber-web',
      });
  }
  for (const cid of ['agenda-a', 'agenda-b']) {
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',0,'2026','2026')",
      [cid, cid, cid],
    );
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,'team','active','manual','2026','2026')",
      [cid + '-sub', cid],
    );
    await db.run("INSERT INTO company_settings(company_id,updated_at) VALUES(?,'2026')", [cid]);
    await db.run(
      "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,'Corte','',40,4500,'Corte')",
      [cid, cid + '-service'],
    );
    for (const id of ['p1', 'p2']) {
      await db.run("INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,?,?,'')", [
        cid,
        cid + '-' + id,
        cid + ' ' + id,
      ]);
      await db.run(
        "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,'2026')",
        [cid, cid + '-' + id, cid + '-service'],
      );
      for (let day = 0; day < 7; day++) {
        await db.run(
          "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,'09:00','18:00')",
          [cid, cid + '-' + id, day],
        );
        await db.run(
          "INSERT INTO barber_working_breaks(company_id,barber_id,weekday,position,start_time,end_time) VALUES(?,?,?,0,'12:20','14:00')",
          [cid, cid + '-' + id, day],
        );
      }
    }
  }
  for (const [cid, user, role] of [
    ['agenda-a', 'owner', 'owner'],
    ['agenda-b', 'owner', 'owner'],
    ['agenda-a', 'manager', 'manager'],
    ['agenda-a', 'professional', 'professional'],
  ])
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,'2026')",
      [cid, 'agenda-' + user, role],
    );
  let failWrite = false;
  const faulty = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (failWrite && sql.includes('INSERT INTO notifications')) {
                failWrite = false;
                throw Object.assign(new Error('injected outbox rollback'), { status: 503 });
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [faulty, second].map((source) =>
    createApp(source, { secret, test: true, serveStatic: false, siteStorage: null }).listen(
      0,
      '127.0.0.1',
    ),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const server of servers) await new Promise((done) => server.close(done));
  });
  async function req(
    path = '',
    { user = 'owner', cid = 'agenda-a', method = 'GET', body, key, instance = 0, raw = false } = {},
  ) {
    const r = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${raw ? path : '/admin/agenda' + path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Cookie: cookies[user] } : {}),
          ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie') };
  }
  const day = addDays(dateInBrazil(), 3),
    guest = { name: 'Cliente Sem Conta', email: 'manual@agenda.test', phone: '21999998888' };
  const payload = (time = '09:00', barberId = 'agenda-a-p1') => ({
    services: ['agenda-a-service'],
    barberId,
    date: day,
    time,
    guest,
    notes: 'Cliente prefere acabamento natural.',
  });
  const create = (body, key, opts = {}) => req('', { method: 'POST', body, key, ...opts });
  const row = async (id, cid = 'agenda-a') =>
    db.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [cid, id]);
  const events = async (id) =>
    Number(
      (
        await db.get(
          'SELECT COUNT(*) AS n FROM notifications WHERE company_id=? AND appointment_id=?',
          ['agenda-a', id],
        )
      ).n,
    );
  let original;
  await t.test(
    'owner/manager authorization, no Igor fallback, strict queries and protected personal details',
    async () => {
      assert.equal((await req('', { user: null })).status, 401);
      for (const user of ['professional', 'outsider', 'customer'])
        assert.equal((await req('', { user })).status, 403);
      assert.equal((await req('', { cid: null })).status, 409);
      assert.equal((await req('', { cid: 'absent' })).status, 403);
      assert.equal((await req('', { user: 'manager' })).status, 200);
      assert.equal((await req('', { user: 'manager', cid: null })).status, 409);
      assert.equal((await req('?from=2026-02-30')).status, 400);
      assert.equal((await req('?company_id=agenda-b')).status, 400);
      assert.equal((await req('/catalog')).data.clients.length, 0);
      assert.equal((await req('/public/agenda-a/admin/agenda', { raw: true })).status, 404);
      assert.equal((await req('/public/agenda-a/site', { raw: true })).status, 404);
    },
  );
  await t.test(
    'private manual booking uses actual duration, breaks, snapshots, notes and atomic existing outbox without customer account/cookie',
    async () => {
      const times = (
        await req('/availability?date=' + day + '&barberId=agenda-a-p1&services=agenda-a-service')
      ).data.slots;
      assert.ok(times.includes('11:40'));
      assert.ok(!times.includes('12:00'));
      assert.ok(times.includes('14:00'));
      assert.ok(!times.includes('17:40'));
      const made = await create(payload(), 'manual-original-0001', { user: 'manager' });
      assert.equal(made.status, 201);
      original = made.data;
      assert.equal(made.cookie, null);
      assert.equal(original.user_id, null);
      assert.equal(original.client_name, guest.name);
      assert.equal(original.notes, payload().notes);
      assert.equal(original.total, 4500);
      assert.equal(original.end_minute - original.start_minute, 40);
      assert.equal(await events(original.id), 2);
      assert.equal(
        Number((await db.get('SELECT COUNT(*) AS n FROM users WHERE email=?', [guest.email])).n),
        0,
      );
      assert.equal((await create(payload(), 'manual-occupied-0001')).status, 409);
      assert.equal(
        (await create({ ...payload('11:40'), notes: 'x'.repeat(1001) }, 'invalid-notes-0001'))
          .status,
        400,
      );
      assert.equal(
        (await create({ ...payload('11:40'), expectedTotal: 1 }, 'invalid-price-0001')).status,
        412,
      );
      const listed = await req('?from=' + day);
      assert.equal(listed.data.items.length, 1);
      assert.ok(!JSON.stringify(listed.data).includes(guest.email));
      assert.ok(!JSON.stringify(listed.data).includes(guest.phone));
    },
  );
  await t.test(
    'same key replay/lost response, payload mismatch, actor/company scopes and concurrent retries',
    async () => {
      const made = await create(payload('09:40'), 'manual-retry-0001');
      assert.equal(made.status, 201);
      const replay = await create(payload('09:40'), 'manual-retry-0001', { instance: 1 });
      assert.deepEqual(replay.data, made.data);
      assert.equal(await events(made.data.id), 2);
      assert.equal((await create(payload('10:20'), 'manual-retry-0001')).status, 409);
      const pair = await Promise.all(
        [0, 1].map((instance) =>
          create(payload('10:20'), 'manual-simultaneous-0001', { instance }),
        ),
      );
      assert.deepEqual(
        pair.map((r) => r.status),
        [201, 201],
      );
      assert.equal(pair[0].data.id, pair[1].data.id);
      assert.equal(await events(pair[0].data.id), 2);
      const other = await create(
        { ...payload('09:40'), services: ['agenda-b-service'], barberId: 'agenda-b-p1' },
        'manual-retry-0001',
        { cid: 'agenda-b' },
      );
      assert.equal(other.status, 201);
      assert.notEqual(other.data.id, made.data.id);
      const differentActor = await create(payload('11:00'), 'manual-retry-0001', {
        user: 'manager',
      });
      assert.equal(differentActor.status, 201);
    },
  );
  await t.test(
    'two operators racing for one slot create exactly one booking; associations and outbox roll back after failure',
    async () => {
      const pair = await Promise.all(
        [0, 1].map((instance) =>
          create(payload('14:00'), 'manual-race-' + instance + '-0001', { instance }),
        ),
      );
      assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409]);
      failWrite = true;
      const body = payload('14:40');
      assert.equal((await create(body, 'manual-rollback-0001')).status, 503);
      assert.equal(
        Number(
          (
            await db.get(
              'SELECT COUNT(*) AS n FROM appointments WHERE company_id=? AND date=? AND start_minute=880',
              ['agenda-a', day],
            )
          ).n,
        ),
        0,
      );
      const retry = await create(body, 'manual-rollback-0001');
      assert.equal(retry.status, 201);
      assert.equal(await events(retry.data.id), 2);
      assert.equal(
        Number(
          (
            await db.get(
              'SELECT COUNT(*) AS n FROM appointment_services WHERE company_id=? AND appointment_id=?',
              ['agenda-a', retry.data.id],
            )
          ).n,
        ),
        1,
      );
    },
  );
  await t.test(
    'reschedule retains identity, client, original prices/duration/notes; conflict and changed fingerprint fail safely',
    async () => {
      const before = await row(original.id),
        expected = reservationFingerprint(before);
      const body = {
        services: ['agenda-a-service'],
        barberId: 'agenda-a-p2',
        date: day,
        time: '14:00',
        expected,
        notes: 'Após o almoço.',
      };
      await db.run(
        "UPDATE services SET duration=60,price=7777 WHERE company_id='agenda-a' AND id='agenda-a-service'",
      );
      const r = await req('/' + original.id + '/reschedule', {
        method: 'PATCH',
        body,
        key: 'reschedule-original-0001',
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.id, original.id);
      assert.equal(r.data.total, 4500);
      assert.equal(r.data.end_minute - r.data.start_minute, 40);
      assert.equal(r.data.client_name, guest.name);
      assert.equal(r.data.notes, body.notes);
      assert.equal(await events(original.id), 4);
      assert.equal(
        (
          await req('/' + original.id + '/reschedule', {
            method: 'PATCH',
            body,
            key: 'reschedule-original-0001',
            instance: 1,
          })
        ).status,
        200,
      );
      assert.equal(await events(original.id), 4);
      assert.equal(
        (
          await req('/' + original.id + '/reschedule', {
            method: 'PATCH',
            body: { ...body, time: '14:40' },
            key: 'reschedule-stale-0001',
          })
        ).status,
        409,
      );
      const fresh = reservationFingerprint(await row(original.id));
      const changedNotes = { ...(await row(original.id)), notes: 'Observação alterada' };
      assert.throws(() => checkExpected(changedNotes, fresh), /alterado por outra pessoa/);
      assert.equal(
        (
          await req('/' + original.id + '/reschedule', {
            method: 'PATCH',
            body: { ...body, barberId: 'agenda-a-p1', time: '09:40', expected: fresh },
            key: 'reschedule-conflict-0001',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req('/' + original.id + '/reschedule', {
            method: 'PATCH',
            body: { ...body, guest },
            key: 'reschedule-client-change',
          })
        ).status,
        400,
      );
      await db.run(
        "UPDATE services SET duration=40,price=4500 WHERE company_id='agenda-a' AND id='agenda-a-service'",
      );
    },
  );
  await t.test(
    'cancel/reschedule concurrency is serialized; cancellation preserves history and one notification event',
    async () => {
      const expected = reservationFingerprint(await row(original.id));
      const results = await Promise.all([
        req('/' + original.id + '/reschedule', {
          method: 'PATCH',
          body: {
            services: ['agenda-a-service'],
            barberId: 'agenda-a-p2',
            date: day,
            time: '15:20',
            expected,
          },
          key: 'cancel-race-reschedule',
          instance: 1,
        }),
        req('/' + original.id + '/status', {
          method: 'PATCH',
          body: { status: 'cancelled', expected },
          key: 'cancel-race-cancel',
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 200).length, 1);
      assert.ok([400, 409].includes(results.find((r) => r.status !== 200).status));
      const fresh = await row(original.id);
      if (fresh.status === 'confirmed')
        assert.equal(
          (
            await req('/' + original.id + '/status', {
              method: 'PATCH',
              body: { status: 'cancelled', expected: reservationFingerprint(fresh) },
              key: 'cancel-final-0001',
            })
          ).status,
          200,
        );
      const before = await events(original.id);
      assert.equal(
        (
          await req('/' + original.id + '/status', {
            method: 'PATCH',
            body: { status: 'cancelled' },
          })
        ).status,
        200,
      );
      assert.equal(await events(original.id), before);
      assert.equal((await row(original.id)).guest_email, guest.email);
      assert.equal(
        (
          await req('/' + original.id + '/reschedule', {
            method: 'PATCH',
            body: {
              services: ['agenda-a-service'],
              barberId: 'agenda-a-p2',
              date: day,
              time: '16:00',
            },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/' + original.id + '/status', {
            method: 'PATCH',
            body: { status: 'completed' },
          })
        ).status,
        400,
      );
      const detail = await req('/' + original.id);
      assert.deepEqual(detail.data.actions, { cancel: false, reschedule: false, complete: false });
    },
  );
  await t.test(
    'completion obeys end time, is idempotent, preserves integer price and updates dashboard without payment',
    async () => {
      assert.equal(
        (
          await req(
            '/' +
              (await create(payload('16:00', 'agenda-a-p2'), 'completion-future-0001')).data.id +
              '/status',
            { method: 'PATCH', body: { status: 'completed' } },
          )
        ).status,
        400,
      );
      const yesterday = addDays(dateInBrazil(), -1);
      await db.run(
        "INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name,guest_email,guest_phone,notes) VALUES('agenda-a','past-completion','agenda-a-p1',?,540,580,12345,'confirmed','2026','Cliente Passado','past@agenda.test','21999999999','Preservar')",
        [yesterday],
      );
      const expected = reservationFingerprint(await row('past-completion'));
      const pair = await Promise.all(
        [0, 1].map((instance) =>
          req('/past-completion/status', {
            method: 'PATCH',
            body: { status: 'completed', expected },
            key: 'complete-retry-0001',
            instance,
          }),
        ),
      );
      assert.deepEqual(
        pair.map((r) => r.status),
        [200, 200],
      );
      const done = await row('past-completion');
      assert.equal(done.total, 12345);
      assert.equal(done.notes, 'Preservar');
      assert.equal(done.status, 'completed');
      assert.equal(await events(done.id), 0);
      assert.equal(
        (await req('/past-completion/status', { method: 'PATCH', body: { status: 'cancelled' } }))
          .status,
        400,
      );
      const dashboard = await req('/dashboard', { raw: true });
      assert.ok(
        dashboard.data.metrics.completedAppointments >=
          (yesterday.slice(0, 7) === dateInBrazil().slice(0, 7) ? 1 : 0),
      );
      assert.equal('revenue' in dashboard.data.metrics, false);
    },
  );
  await t.test(
    'filtering/pagination and existing account clients never expose foreign identities',
    async () => {
      const existingBody = { ...payload('16:00'), userId: 'agenda-customer-b' };
      delete existingBody.guest;
      assert.equal((await create(existingBody, 'foreign-client-0001')).status, 404);
      await db.run(
        "INSERT INTO appointments(company_id,id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at) VALUES('agenda-a','own-client','agenda-customer','agenda-a-p1',?,0,1,100,'cancelled','2026')",
        [day],
      );
      existingBody.userId = 'agenda-customer';
      assert.equal((await create(existingBody, 'own-client-0001')).status, 201);
      const clients = (await req('/catalog')).data.clients;
      assert.ok(clients.some((c) => c.name === 'Cliente customer'));
      assert.ok(!clients.some((c) => c.name === 'Cliente customer-b'));
      const filter = await req(
        '?from=' + day + '&professionalId=agenda-a-p2&status=confirmed&view=week',
      );
      assert.ok(
        filter.data.items.every((a) => a.barberId === 'agenda-a-p2' && a.status === 'confirmed'),
      );
      assert.equal((await req('/' + original.id, { cid: 'agenda-b' })).status, 404);
      assert.equal(
        (
          await req('/' + original.id + '/status', {
            cid: 'agenda-b',
            method: 'PATCH',
            body: { status: 'cancelled' },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req('/' + original.id + '/reschedule', {
            cid: 'agenda-b',
            method: 'PATCH',
            body: {
              services: ['agenda-b-service'],
              barberId: 'agenda-b-p1',
              date: day,
              time: '14:00',
            },
          })
        ).status,
        404,
      );
      for (let i = 0; i < 35; i++)
        await db.run(
          "INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name) VALUES('agenda-a',?,'agenda-a-p2',?,1,2,0,'cancelled','2026','Histórico')",
          ['page-' + i, day],
        );
      const first = await req('?from=' + day + '&status=cancelled'),
        last = await req('?from=' + day + '&status=cancelled&page=2');
      assert.equal(first.data.items.length, 30);
      assert.ok(last.data.items.length >= 5);
      assert.equal(
        new Set([...first.data.items, ...last.data.items].map((a) => a.id)).size,
        first.data.total,
      );
    },
  );
  await t.test(
    'trial expiry, pending onboarding, revocation and private publication cannot be bypassed by direct writes',
    async () => {
      await db.run("UPDATE subscriptions SET status='expired' WHERE company_id='agenda-a'");
      assert.equal((await create(payload('17:00'), 'expired-create-0001')).status, 409);
      assert.equal((await req()).data.editable, false);
      await db.run("UPDATE subscriptions SET status='active' WHERE company_id='agenda-a'");
      await db.run(
        "UPDATE company_members SET status='inactive' WHERE company_id='agenda-a' AND user_id='agenda-manager'",
      );
      assert.equal((await req('', { user: 'manager' })).status, 403);
      assert.equal(
        (
          await req('/public/agenda-a/appointments/guest', {
            raw: true,
            method: 'POST',
            body: payload('17:00'),
          })
        ).status,
        404,
      );
      await db.run(
        "INSERT INTO company_onboarding(company_id,created_by,plan_id,created_at,updated_at) VALUES('agenda-a','agenda-owner','team','2026','2026')",
      );
      assert.equal((await create(payload('17:00'), 'pending-create-0001')).status, 409);
      await db.run("DELETE FROM company_onboarding WHERE company_id='agenda-a'");
      assert.deepEqual(
        await db.all("SELECT * FROM appointments WHERE company_id='igor-barber-club' ORDER BY id"),
        legacy,
      );
      assert.equal((await req('/services', { raw: true })).status, 200);
    },
  );
  await t.test(
    'company timezone and shared slot engine respect exact seconds and working breaks',
    async () => {
      const now = new Date('2026-10-10T00:00:01Z');
      assert.equal(isFuture('2026-10-10', 540, now, 'Asia/Tokyo'), false);
      assert.equal(isFuture('2026-10-10', 580, now, 'Asia/Tokyo'), true);
      const slots = availableSlots({
        date: '2026-10-10',
        duration: 40,
        now,
        timezone: 'Asia/Tokyo',
        workingDay: {
          active: true,
          start_time: '09:00',
          end_time: '18:00',
          breaks: [{ start_time: '12:20', end_time: '14:00' }],
        },
      });
      assert.ok(!slots.includes('09:00'));
      assert.ok(slots.includes('11:40'));
      assert.ok(!slots.includes('12:00'));
      assert.ok(slots.includes('14:00'));
    },
  );
}
