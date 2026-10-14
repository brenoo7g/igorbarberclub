import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { runMigrations, migrations, readMigration } from '../../server/migrations.js';
import { reconstructBeforeSiteEditor } from './site-editor-migration.js';

export async function assertCompanyOnboarding(t, db, second = db) {
  const secret = 'onboarding-company-disposable-test-secret';
  const cookies = {};
  for (const id of [
    'new-owner',
    'other-owner',
    'race-owner',
    'rollback-owner',
    'legacy-owner',
    'active-owner',
    'slug-owner-a',
    'slug-owner-b',
  ]) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','test','client','2026')",
      [id, id, `${id}@example.test`],
    );
    cookies[id] =
      `session=${jwt.sign({ version: 0 }, secret, { subject: id, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  }
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('igor-barber-club','active-owner','owner','2026')",
  );
  const legacySnapshot = async () =>
    Promise.all(
      [
        'companies',
        'company_members',
        'company_settings',
        'barbers',
        'services',
        'appointments',
        'appointment_services',
        'notifications',
      ].map((table) =>
        db.all(
          `SELECT * FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}='igor-barber-club' ORDER BY 1`,
        ),
      ),
    );
  const before = await legacySnapshot();
  let failOn = null;
  const faulty = {
    ...db,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (failOn && sql.startsWith(failOn)) {
              failOn = null;
              throw Object.assign(new Error('injected business failure'), { status: 503 });
            }
            return tx.run(sql, args);
          },
        }),
      ),
  };
  const servers = [db, second, faulty].map((source) =>
    createApp(source, { secret, test: true, serveStatic: false }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((server) => once(server, 'listening')));
  t.after(async () => {
    for (const server of servers) await new Promise((resolve) => server.close(resolve));
  });
  const payload = {
    name: 'Nova Barbearia',
    slug: 'nova-barbearia',
    description: 'Atendimento com hora marcada.',
    phone: '(21) 99999-8888',
    whatsapp: '21999998888',
    instagram: 'https://instagram.com/nova_barbearia/',
    city: 'Rio de Janeiro',
    region: 'RJ',
    address: 'Rua de Teste, 10',
    planCode: 'individual',
    nicheCode: 'barbershop',
    templateCode: 'barber-classic',
  };
  const request = async (
    user = 'new-owner',
    body = payload,
    key = 'create-business-001',
    instance = 0,
    path = '/onboarding/business',
    method = body === null ? 'GET' : 'POST',
    headers = {},
  ) => {
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(user ? { Cookie: cookies[user] } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
          ...headers,
        },
        ...(body === null ? {} : { body: JSON.stringify(body) }),
      },
    );
    return { status: response.status, data: await response.json() };
  };
  await t.test(
    'authentication, reserved/duplicate slugs, catalogs and strict payload validation',
    async () => {
      assert.equal((await request(null)).status, 401);
      assert.equal((await request(null, null)).status, 401);
      for (const slug of [
        'admin',
        'APP',
        'api',
        'preview',
        'agendar',
        'minha-conta',
        'images',
        'assets',
        'bad/name',
        'muito--ruim',
      ])
        assert.equal((await request('new-owner', { ...payload, slug })).status, 400);
      for (const body of [
        { ...payload, planCode: 'fake' },
        { ...payload, companyId: 'igor-barber-club' },
        { ...payload, phone: '123' },
        { ...payload, region: 'XX' },
        { ...payload, instagram: 'javascript:alert(1)' },
      ])
        assert.equal((await request('new-owner', body)).status, 400);
      for (const body of [
        { ...payload, nicheCode: 'salon' },
        { ...payload, templateCode: 'fake' },
      ])
        assert.equal((await request('new-owner', body)).status, 409);
      await db.run("UPDATE plans SET active=0 WHERE id='individual'");
      assert.equal((await request()).data.code, 'PLAN_UNAVAILABLE');
      await db.run("UPDATE plans SET active=1 WHERE id='individual'");
      await db.run("UPDATE templates SET active=0 WHERE id='barber-classic'");
      assert.equal((await request()).data.code, 'SELECTION_UNAVAILABLE');
      await db.run("UPDATE templates SET active=1 WHERE id='barber-classic'");
      assert.equal(
        (await request('new-owner', { ...payload, slug: 'igor-barber-club' })).data.code,
        'SLUG_UNAVAILABLE',
      );
      assert.equal(
        (await request('active-owner', { ...payload, slug: 'existing-owner' })).data.code,
        'COMPANY_ALREADY_CONFIGURED',
      );
    },
  );
  let company;
  await t.test(
    'atomic company/settings/owner and pending plan, no automatic Igor or subscription',
    async () => {
      const result = await request();
      assert.equal(result.status, 201);
      company = result.data.company;
      assert.equal(company.plan.code, 'individual');
      assert.equal(company.onboardingStatus, 'pending');
      assert.equal(company.settings.phone, '21999998888');
      assert.equal(
        (await db.get('SELECT status FROM companies WHERE id=?', [company.id])).status,
        'suspended',
      );
      const member = await db.get('SELECT * FROM company_members WHERE company_id=?', [company.id]);
      assert.equal(member.user_id, 'new-owner');
      assert.equal(member.role, 'owner');
      assert.equal(member.status, 'active');
      assert.equal(
        Number(
          (await db.get('SELECT COUNT(*) AS n FROM subscriptions WHERE company_id=?', [company.id]))
            .n,
        ),
        0,
      );
      assert.equal(
        await db.get(
          "SELECT * FROM company_members WHERE user_id='new-owner' AND company_id='igor-barber-club'",
        ),
        undefined,
      );
    },
  );
  await t.test(
    'same key/payload replays lost response; changed payload conflicts; legacy repeat cannot duplicate',
    async () => {
      assert.deepEqual((await request()).data.company, company);
      assert.equal((await request('new-owner', { ...payload, name: 'Changed' })).status, 409);
      assert.equal(
        (await request('new-owner', payload, 'different-key-001')).data.code,
        'COMPANY_ALREADY_CONFIGURED',
      );
      assert.equal(
        (await request('other-owner', { ...payload, slug: 'other-business' })).status,
        201,
      );
      assert.equal(
        (await request('legacy-owner', { ...payload, slug: 'legacy-business' }, null)).status,
        201,
      );
      assert.equal(
        (await request('legacy-owner', { ...payload, slug: 'legacy-business' }, null)).status,
        409,
      );
    },
  );
  await t.test(
    'simultaneous requests across independent connections create exactly one company',
    async () => {
      const body = { ...payload, slug: 'race-business' };
      const results = await Promise.all([
        request('race-owner', body, 'same-key-race-001', 0),
        request('race-owner', body, 'same-key-race-001', 1),
      ]);
      assert.ok(results.every((result) => result.status === 201));
      assert.deepEqual(results[0].data, results[1].data);
      assert.equal(
        Number((await db.get("SELECT COUNT(*) AS n FROM companies WHERE slug='race-business'")).n),
        1,
      );
      const differentKeys = await Promise.all([
        request('race-owner', body, 'other-key-race-001', 0),
        request('race-owner', { ...body, slug: 'different-slug' }, 'other-key-race-002', 1),
      ]);
      assert.ok(differentKeys.every((result) => result.status === 409));
    },
  );
  await t.test(
    'two creators racing to reserve a slug yield one winner and no partial business',
    async () => {
      const body = { ...payload, slug: 'shared-slug' };
      const results = await Promise.all([
        request('slug-owner-a', body, 'slug-race-001', 0),
        request('slug-owner-b', body, 'slug-race-001', 1),
      ]);
      assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
      assert.equal(
        Number((await db.get("SELECT COUNT(*) AS n FROM companies WHERE slug='shared-slug'")).n),
        1,
      );
    },
  );
  await t.test(
    'rollback at every write, including idempotency response, and same-key retry succeeds',
    async () => {
      const body = { ...payload, slug: 'rollback-business' };
      for (const statement of [
        'INSERT INTO company_members',
        'INSERT INTO company_settings',
        'INSERT INTO company_onboarding',
        'INSERT INTO idempotency_keys',
      ]) {
        failOn = statement;
        assert.equal((await request('rollback-owner', body, 'rollback-key-001', 2)).status, 503);
        assert.equal(
          await db.get("SELECT id FROM companies WHERE slug='rollback-business'"),
          undefined,
        );
        assert.equal(
          await db.get("SELECT company_id FROM company_members WHERE user_id='rollback-owner'"),
          undefined,
        );
      }
      assert.equal((await request('rollback-owner', body, 'rollback-key-001', 2)).status, 201);
    },
  );
  await t.test(
    'resume is authorized by owner, public/admin access stays closed and Igor is preserved',
    async () => {
      assert.deepEqual((await request('new-owner', null, null)).data.company, company);
      assert.notEqual((await request('other-owner', null, null)).data.company.id, company.id);
      assert.equal((await request('active-owner', null, null)).data.company, null);
      assert.deepEqual((await request('new-owner', null, null, 0, '/companies')).data, []);
      assert.equal(
        (await request('new-owner', null, null, 0, `/public/${company.slug}/site`)).status,
        404,
      );
      for (const selected of [company.id, 'igor-barber-club'])
        assert.equal(
          (
            await request('new-owner', null, null, 0, '/admin/metrics', 'GET', {
              'X-Gradefy-Company-Id': selected,
            })
          ).status,
          403,
        );
      assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM subscriptions')).n), 0);
      assert.deepEqual(await legacySnapshot(), before);
      assert.deepEqual(await runMigrations(db), []);
      await db.run(
        "UPDATE company_members SET status='inactive' WHERE company_id=? AND user_id='new-owner'",
        [company.id],
      );
      assert.equal((await request('new-owner', null, null)).data.company, null);
      assert.equal((await request()).status, 403);
    },
  );
}

export async function assertOnboardingMigration(t, db) {
  await reconstructBeforeSiteEditor(db);
  await db.run(
    "INSERT INTO idempotency_keys(company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at) VALUES('igor-barber-club',?,'booking',?,?,?,'2026-01-01','2099-01-01')",
    ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), '{"legacy":true}'],
  );
  // Test-only reconstruction of 008, never a rollback command for a deployed database.
  await db.run('DROP TABLE company_onboarding');
  await db.run('ALTER TABLE companies DROP COLUMN site_published');
  await db.run('DELETE FROM schema_migrations WHERE version>=9');
  const before = await db.all('SELECT * FROM idempotency_keys ORDER BY 1');
  const faulty = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('INSERT INTO schema_migrations'))
              throw new Error('injected 009 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(faulty), /injected 009 failure/);
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=9'), undefined);
  await assert.rejects(db.all('SELECT * FROM company_onboarding'));
  assert.deepEqual(await db.all('SELECT * FROM idempotency_keys ORDER BY 1'), before);
  assert.deepEqual(await runMigrations(db), [9, 10, 11, 12, 13, 14, 15, 16, 17]);
  assert.deepEqual(await runMigrations(db), []);
  assert.equal(
    (await db.get('SELECT checksum FROM schema_migrations WHERE version=9')).checksum,
    readMigration(migrations[8]).checksum,
  );
  assert.deepEqual(await db.all('SELECT * FROM idempotency_keys ORDER BY 1'), before);
  for (const values of [
    [null, 'missing', 'individual'],
    ['igor-barber-club', 'missing', 'individual'],
    ['igor-barber-club', null, 'individual'],
  ])
    await assert.rejects(
      db.run(
        "INSERT INTO company_onboarding(company_id,created_by,plan_id,created_at,updated_at) VALUES(?,?,?,'2026','2026')",
        values,
      ),
    );
}
