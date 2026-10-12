import { reconstructBeforeBarberClassic } from './barber-classic-migration.js';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { startTrial } from '../../server/entitlements.js';
import { runMigrations, readMigration, migrations } from '../../server/migrations.js';

export async function assertProfessionalIdempotency(t, db, second = db) {
  const secret = 'professional-idempotency-disposable-secret-32';
  for (const id of ['idem-owner', 'idem-manager'])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999999999','fixture','client','2026')",
      [id, id, `${id}@example.test`],
    );
  for (const [company, plan] of [
    ['idem-a', 'team'],
    ['idem-b', 'team'],
    ['idem-c', 'individual'],
  ]) {
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,'Teste','barbershop','barber-classic','2026','2026')",
      [company, company],
    );
    for (const user of ['idem-owner', 'idem-manager'])
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,'manager','2026')",
        [company, user],
      );
    await db.run(
      "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,'Corte','Teste',40,4000,'Corte')",
      [company, `${company}-cut`],
    );
    await startTrial(db, company, plan);
  }
  let failure = null;
  const faulty = {
    ...db,
    transaction: (perform) =>
      db.transaction((tx) =>
        perform({
          ...tx,
          run: async (sql, args) => {
            if (failure && sql.startsWith(failure)) {
              failure = null;
              throw new Error('injected creation failure');
            }
            return tx.run(sql, args);
          },
        }),
      ),
  };
  const servers = [db, second, faulty].map((source) =>
    createApp(source, { secret, test: true, serveStatic: false }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const s of servers) await new Promise((done) => s.close(done));
  });
  const call = async (company, key, extra = {}, instance = 0, user = 'idem-owner') => {
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api/admin/professionals`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gradefy-Company-Id': company,
          Cookie: `session=${jwt.sign({ version: 0 }, secret, { subject: user, issuer: 'igor-barber-club', audience: 'barber-web' })}`,
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        body: JSON.stringify({
          name: 'Idempotent Professional',
          services: [`${company}-cut`],
          ...extra,
        }),
      },
    );
    return { status: response.status, body: await response.json() };
  };
  const count = async (table, company) =>
    Number((await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id=?`, [company])).n);

  await t.test('same POST, lost response, persistent replay and payload conflict', async () => {
    const first = await call('idem-a', 'repeat-key-001');
    assert.equal(first.status, 201);
    assert.deepEqual(await call('idem-a', 'repeat-key-001', {}, 1), first);
    // Simulated response loss: discard result after the server committed, retry on another instance.
    await call('idem-a', 'lost-response-001');
    const recovered = await call('idem-a', 'lost-response-001', {}, 1);
    assert.equal(recovered.status, 201);
    assert.equal(await count('barbers', 'idem-a'), 2);
    assert.equal((await call('idem-a', 'repeat-key-001', { name: 'Different' })).status, 409);
    assert.equal(await count('barbers', 'idem-a'), 2);
    const association = await db.all(
      'SELECT service_id FROM barber_services WHERE company_id=? AND barber_id=?',
      ['idem-a', first.body.id],
    );
    assert.deepEqual(
      association.map((r) => r.service_id),
      ['idem-a-cut'],
    );
    // Replay must be the original snapshot even after an edit or expired subscription.
    await db.run('UPDATE barbers SET name=? WHERE id=?', ['Edited', first.body.id]);
    await db.run(
      "UPDATE subscriptions SET trial_ends_at='2026-01-02T00:00:00.000Z',trial_started_at='2026-01-01T00:00:00.000Z' WHERE company_id='idem-a'",
    );
    assert.deepEqual(await call('idem-a', 'repeat-key-001'), first);
    await db.run(
      "UPDATE subscriptions SET trial_ends_at='2099-01-02T00:00:00.000Z' WHERE company_id='idem-a'",
    );
  });
  await t.test(
    'simultaneous same key creates one; company and actor scopes are independent',
    async () => {
      const before = await count('barbers', 'idem-a');
      const pair = await Promise.all([
        call('idem-a', 'concurrent-001'),
        call('idem-a', 'concurrent-001', {}, 1),
      ]);
      assert.equal(pair[0].status, 201);
      assert.deepEqual(pair[0], pair[1]);
      assert.equal(await count('barbers', 'idem-a'), before + 1);
      const other = await call('idem-b', 'concurrent-001');
      assert.equal(other.status, 201);
      assert.notEqual(other.body.id, pair[0].body.id);
      const actor = await call('idem-a', 'concurrent-001', {}, 1, 'idem-manager');
      assert.equal(actor.status, 201);
      assert.notEqual(actor.body.id, pair[0].body.id);
    },
  );
  await t.test(
    'failures roll back profile, relations, schedule and key; same key can retry',
    async () => {
      for (const point of ['INSERT INTO barber_working_hours', 'INSERT INTO idempotency_keys']) {
        const before = {};
        for (const table of [
          'barbers',
          'barber_services',
          'barber_settings',
          'barber_working_hours',
          'idempotency_keys',
        ])
          before[table] = await count(table, 'idem-a');
        failure = point;
        const key = point.includes('working') ? 'rollback-hours-001' : 'rollback-key-001';
        assert.equal((await call('idem-a', key, {}, 2)).status, 500);
        for (const [table, n] of Object.entries(before))
          assert.equal(await count(table, 'idem-a'), n);
        assert.equal((await call('idem-a', key, {}, 1)).status, 201);
      }
      const before = await count('barbers', 'idem-a');
      assert.equal(
        (await call('idem-a', 'invalid-service-001', { services: ['idem-b-cut'] })).status,
        400,
      );
      assert.equal(await count('barbers', 'idem-a'), before);
      assert.equal((await call('idem-a', 'invalid-service-001')).status, 201);
    },
  );
  await t.test(
    'Individual concurrent retry and distinct keys preserve one active slot; legacy works',
    async () => {
      const pair = await Promise.all([
        call('idem-c', 'individual-same-001'),
        call('idem-c', 'individual-same-001', {}, 1),
      ]);
      assert.equal(pair[0].status, 201);
      assert.deepEqual(pair[0], pair[1]);
      await db.run("UPDATE barbers SET active=0 WHERE company_id='idem-c'");
      const race = await Promise.all([
        call('idem-c', 'individual-race-001'),
        call('idem-c', 'individual-race-002', {}, 1),
      ]);
      assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        Number(
          (await db.get("SELECT COUNT(*) AS n FROM barbers WHERE company_id='idem-c' AND active=1"))
            .n,
        ),
        1,
      );
      assert.equal((await call('idem-c', 'inactive-create-001', { active: false })).status, 201);
      assert.equal((await call('idem-b', null)).status, 201);
    },
  );

  await t.test(
    '007 upgrade preserves every existing key; rollback, repeat and checksum',
    async () => {
      const rows = await db.all(
        'SELECT * FROM idempotency_keys ORDER BY company_id,actor_hash,operation,key_hash',
      );
      // Reconstruct only the pre-007 operation constraint in this disposable fixture.
      await reconstructBeforeBarberClassic(db);
      await db.run("DELETE FROM idempotency_keys WHERE operation='professional-create'");
      await db.run("INSERT INTO idempotency_keys VALUES('idem-a',?,'booking',?,?,?,? ,?)", [
        'a'.repeat(64),
        'b'.repeat(64),
        'c'.repeat(64),
        '{"legacy":true}',
        '2026-01-01',
        '2099-01-01',
      ]);
      const legacy = await db.all('SELECT * FROM idempotency_keys');
      if (db.dialect === 'postgres') {
        await db.run(
          'ALTER TABLE idempotency_keys DROP CONSTRAINT idempotency_keys_operation_check',
        );
        await db.run(
          "ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_operation_check CHECK(operation IN ('booking','guest-booking','block'))",
        );
      } else {
        await db.run('ALTER TABLE idempotency_keys RENAME TO idempotency_previous');
        await db.run('DROP INDEX idempotency_expiration');
        await db.run(readMigration(migrations[4]).statements[0]);
        await db.run('INSERT INTO idempotency_keys SELECT * FROM idempotency_previous');
        await db.run('DROP TABLE idempotency_previous');
        await db.run(
          'CREATE INDEX idempotency_expiration ON idempotency_keys(company_id,expires_at)',
        );
      }
      await db.run('DELETE FROM schema_migrations WHERE version=7');
      const failing = {
        ...db,
        transaction: (fn) =>
          db.transaction((tx) =>
            fn({
              ...tx,
              run: async (sql, args) => {
                if (sql.startsWith('INSERT INTO schema_migrations'))
                  throw new Error('injected 007 failure');
                return tx.run(sql, args);
              },
            }),
          ),
      };
      await assert.rejects(runMigrations(failing), /injected 007 failure/);
      assert.deepEqual(await db.all('SELECT * FROM idempotency_keys'), legacy);
      assert.equal(
        await db.get('SELECT version FROM schema_migrations WHERE version=7'),
        undefined,
      );
      assert.deepEqual(await runMigrations(db), [7, 8, 9, 10, 11, 12, 13, 14]);
      assert.deepEqual(await db.all('SELECT * FROM idempotency_keys'), legacy);
      assert.deepEqual(await runMigrations(db), []);
      const original = await db.get('SELECT checksum FROM schema_migrations WHERE version=7');
      await db.run('UPDATE schema_migrations SET checksum=? WHERE version=7', ['0'.repeat(64)]);
      await assert.rejects(runMigrations(db), /Hist/);
      await db.run('UPDATE schema_migrations SET checksum=? WHERE version=7', [original.checksum]);
      assert.ok(rows.length > 0);
    },
  );
}
