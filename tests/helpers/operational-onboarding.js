import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { runMigrations, migrations, readMigration } from '../../server/migrations.js';
import { availableSlots } from '../../server/domain.js';
import { seed } from '../../server/seed.js';
import { reconstructBeforeSiteEditor } from './site-editor-migration.js';

export async function assertOperationalMigration(db) {
  await reconstructBeforeSiteEditor(db);
  // A real 7D.1 pending row must stay private when upgraded from 009.
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('upgrade-owner','Upgrade','upgrade@example.test','','test','client','2026')",
  );
  await db.run(
    "INSERT INTO companies(id,slug,name,niche_id,template_id,status,created_at,updated_at) VALUES('upgrade-pending','upgrade-pending','Upgrade','barbershop','barber-classic','suspended','2026','2026')",
  );
  await db.run(
    "INSERT INTO company_onboarding(company_id,created_by,plan_id,created_at,updated_at) VALUES('upgrade-pending','upgrade-owner','individual','2026','2026')",
  );
  const checksums = await db.all(
    'SELECT version,checksum FROM schema_migrations WHERE version<10 ORDER BY version',
  );
  await db.run('ALTER TABLE company_onboarding DROP COLUMN subscription_id');
  await db.run('ALTER TABLE company_onboarding DROP COLUMN completed_at');
  await db.run('ALTER TABLE company_onboarding DROP COLUMN current_step');
  await db.run('ALTER TABLE companies DROP COLUMN site_published');
  await db.run('DELETE FROM schema_migrations WHERE version=10');
  const faulty = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('INSERT INTO schema_migrations'))
              throw new Error('injected 010 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(faulty), /injected 010 failure/);
  await assert.rejects(db.all('SELECT site_published FROM companies'));
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=10'), undefined);
  assert.deepEqual(await runMigrations(db), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(
    await db.all(
      'SELECT version,checksum FROM schema_migrations WHERE version<10 ORDER BY version',
    ),
    checksums,
  );
  assert.equal(
    (await db.get('SELECT checksum FROM schema_migrations WHERE version=10')).checksum,
    readMigration(migrations[9]).checksum,
  );
  assert.equal(
    (await db.get("SELECT site_published FROM companies WHERE id='igor-barber-club'"))
      .site_published,
    1,
  );
  assert.equal(
    (await db.get("SELECT site_published FROM companies WHERE id='upgrade-pending'"))
      .site_published,
    0,
  );
  await db.run("DELETE FROM company_onboarding WHERE company_id='upgrade-pending'");
  await db.run("DELETE FROM companies WHERE id='upgrade-pending'");
  await db.run("DELETE FROM users WHERE id='upgrade-owner'");
}

export async function assertOperationalOnboarding(t, db, second = db) {
  await seed(db);
  const secret = 'operational-disposable-test-secret';
  const cookies = {};
  for (const id of ['ops-owner-a', 'ops-owner-b', 'ops-outsider', 'ops-rollback']) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','test','client','2026')",
      [id, id, `${id}@example.test`],
    );
    cookies[id] =
      `session=${jwt.sign({ version: 0 }, secret, { subject: id, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  }
  const snapshotIgor = async () =>
    Promise.all(
      [
        'companies',
        'company_settings',
        'company_members',
        'services',
        'barbers',
        'barber_services',
        'barber_working_hours',
        'subscriptions',
      ].map((table) =>
        db.all(
          `SELECT * FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}='igor-barber-club' ORDER BY 1`,
        ),
      ),
    );
  const legacy = await snapshotIgor();
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
              throw Object.assign(new Error('injected completion failure'), { status: 503 });
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
  async function req(
    user,
    path = '',
    method = 'GET',
    body = null,
    key = null,
    instance = 0,
    headers = {},
  ) {
    const r = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path.startsWith('/api:') ? path.slice(5) : '/onboarding/operations' + path}`,
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
    return { status: r.status, data: await r.json() };
  }
  async function create(user, planCode) {
    const r = await req(user, '/api:/onboarding/business', 'POST', {
      name: 'Espaço Teste',
      slug: user,
      phone: '21999998888',
      city: 'Rio de Janeiro',
      region: 'RJ',
      planCode,
      nicheCode: 'barbershop',
      templateCode: 'barber-classic',
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.company;
  }
  const A = await create('ops-owner-a', 'individual'),
    B = await create('ops-owner-b', 'team'),
    C = await create('ops-rollback', 'individual');
  const service = {
    name: 'Corte',
    description: '',
    duration: 40,
    price: 3000,
    category: 'Corte',
    active: true,
  };
  const complete = (user, key = 'finish-key-001', instance = 0) =>
    req(user, '/complete', 'POST', {}, key, instance);
  const serviceCreate = (user, body = service, key = 'service-key-001') =>
    req(user, '/services', 'POST', body, key);
  let sA, pA, sB;
  await t.test(
    'owner-only routes, no subscription requirement or Igor fallback, empty closed setup',
    async () => {
      assert.equal((await req(null)).status, 401);
      assert.equal((await req('ops-outsider')).status, 403);
      assert.equal(
        (await req('ops-owner-a', '', 'GET', null, null, 0, { 'X-Gradefy-Company-Id': B.id }))
          .status,
        403,
      );
      assert.equal(
        (
          await req('ops-owner-a', '/api:/admin/professionals', 'GET', null, null, 0, {
            'X-Gradefy-Company-Id': A.id,
          })
        ).status,
        403,
      );
      const state = (await req('ops-owner-a')).data;
      assert.deepEqual(state.services, []);
      assert.deepEqual(state.professionals, []);
      assert.equal(state.company.trial, null);
      assert.equal((await complete('ops-owner-a')).data.code, 'ONBOARDING_INCOMPLETE');
      assert.equal((await req('ops-owner-a', '/anything', 'POST', {})).status, 404);
    },
  );
  await t.test(
    'service CRUD, validation, persisted idempotency and cross-company references',
    async () => {
      assert.equal((await serviceCreate('ops-owner-a', { ...service, duration: 0 })).status, 400);
      const first = await serviceCreate('ops-owner-a');
      assert.equal(first.status, 201);
      sA = first.data;
      assert.deepEqual((await serviceCreate('ops-owner-a')).data, sA);
      assert.equal((await serviceCreate('ops-owner-a', { ...service, price: 4000 })).status, 409);
      sB = (await serviceCreate('ops-owner-b')).data;
      assert.notEqual(sA.id, sB.id);
      assert.equal((await req('ops-owner-b', `/services/${sA.id}`, 'PUT', service)).status, 404);
      assert.equal(
        (
          await req('ops-owner-a', `/services/${sA.id}`, 'PUT', {
            ...service,
            name: 'Corte atualizado',
            active: false,
          })
        ).status,
        200,
      );
      assert.equal((await req('ops-owner-a')).data.services[0].active, 0);
      assert.equal((await req('ops-owner-a', `/services/${sA.id}`, 'PUT', service)).status, 200);
      assert.equal(
        (await req('ops-owner-a', '/professionals', 'POST', { name: 'Pessoa', services: [sB.id] }))
          .data.code,
        'INVALID_PROFESSIONAL_SERVICE',
      );
    },
  );
  await t.test(
    'Individual simultaneous quota, no-login staff, inactive seats and owner links',
    async () => {
      const body = { name: 'Proprietário', services: [sA.id], userId: 'ops-owner-a' };
      const same = await Promise.all([
        req('ops-owner-a', '/professionals', 'POST', body, 'professional-same', 0),
        req('ops-owner-a', '/professionals', 'POST', body, 'professional-same', 1),
      ]);
      assert.ok(
        same.every((r) => r.status === 201),
        JSON.stringify(same),
      );
      assert.deepEqual(same[0].data, same[1].data);
      pA = same[0].data;
      assert.equal(pA.user_id, 'ops-owner-a');
      assert.deepEqual(pA.services, [sA.id]);
      const detail = {
        name: 'Responsável editado',
        specialty: 'Cortes',
        services: [sA.id],
        userId: 'ops-owner-a',
      };
      assert.equal(
        (await req('ops-owner-a', `/professionals/${pA.id}`, 'PUT', detail)).status,
        200,
      );
      assert.equal(
        (
          await req('ops-owner-a', `/professionals/${pA.id}`, 'PUT', {
            ...detail,
            services: [sB.id],
          })
        ).data.code,
        'INVALID_PROFESSIONAL_SERVICE',
      );
      assert.deepEqual((await req('ops-owner-a', `/professionals/${pA.id}`)).data.services, [
        sA.id,
      ]);
      assert.equal(
        (await req('ops-owner-b', `/professionals/${pA.id}`, 'PUT', detail)).status,
        404,
      );
      const initial = (await req('ops-owner-a')).data.schedules[0];
      assert.equal(initial.days.length, 7);
      assert.ok(initial.days.every((d) => !d.active));
      assert.equal(
        (
          await req('ops-owner-a', '/professionals', 'POST', {
            name: 'Excedente',
            services: [sA.id],
          })
        ).data.code,
        'PROFESSIONAL_LIMIT_REACHED',
      );
      const inactive = await req('ops-owner-a', '/professionals', 'POST', {
        name: 'Inativo',
        services: [sA.id],
        active: false,
      });
      assert.equal(inactive.status, 201);
      assert.equal(inactive.data.user_id, null);
      assert.equal(
        (await req('ops-owner-a', `/professionals/${inactive.data.id}/schedule`)).status,
        200,
      );
      assert.equal(
        (
          await req('ops-owner-a', `/professionals/${inactive.data.id}/status`, 'PATCH', {
            active: true,
          })
        ).status,
        409,
      );
      await req('ops-owner-a', `/professionals/${pA.id}/status`, 'PATCH', { active: false });
      const competing = await Promise.all([
        req('ops-owner-a', `/professionals/${pA.id}/status`, 'PATCH', { active: true }, null, 0),
        req(
          'ops-owner-a',
          `/professionals/${inactive.data.id}/status`,
          'PATCH',
          { active: true },
          null,
          1,
        ),
      ]);
      assert.deepEqual(competing.map((r) => r.status).sort(), [200, 409]);
      await req('ops-owner-a', `/professionals/${inactive.data.id}/status`, 'PATCH', {
        active: false,
      });
      await req('ops-owner-a', `/professionals/${pA.id}/status`, 'PATCH', { active: true });
      for (let i = 0; i < 2; i++)
        assert.equal(
          (
            await req('ops-owner-b', '/professionals', 'POST', {
              name: `Pessoa ${i}`,
              services: [sB.id],
            })
          ).status,
          201,
        );
      assert.equal((await req('ops-owner-b', `/professionals/${pA.id}`)).status, 404);
      assert.equal((await req('ops-owner-b', `/professionals/${pA.id}/schedule`)).status, 404);
    },
  );
  const hours = () => ({
    agenda_mode: 'auto',
    max_days_ahead: 15,
    version: 0,
    days: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      active: weekday === 2,
      start_time: '09:00',
      end_time: '19:00',
      breaks:
        weekday === 2
          ? [
              { start_time: '12:20', end_time: '14:00' },
              { start_time: '16:00', end_time: '16:20' },
            ]
          : [],
    })),
  });
  await t.test(
    'schedule validations, multiple breaks, duration fit, revision and durable progress',
    async () => {
      const path = `/professionals/${pA.id}/schedule`;
      const bad = hours();
      bad.days[2].breaks.push({ start_time: '13:00', end_time: '15:00' });
      assert.equal((await req('ops-owner-a', path, 'PUT', bad)).status, 400);
      assert.equal((await req('ops-owner-a', path, 'PUT', hours())).status, 200);
      assert.equal((await req('ops-owner-a', path, 'PUT', hours())).status, 409);
      const read = await req('ops-owner-a', path);
      assert.equal(read.status, 200);
      assert.equal(read.data.days[2].breaks.length, 2);
      const slots = availableSlots({
        date: '2099-01-06',
        duration: 40,
        workingDay: read.data.days[2],
        now: new Date(0),
      });
      assert.ok(slots.includes('11:40'));
      assert.ok(slots.includes('14:00'));
      assert.ok(!slots.includes('12:00'));
      assert.equal((await req('ops-owner-a', '/progress', 'PUT', { step: 'review' })).status, 200);
      const resumed = (await req('ops-owner-a', '', 'GET', null, null, 1)).data;
      assert.equal(resumed.company.currentStep, 'review');
      assert.deepEqual(resumed.issues, []);
      assert.equal(resumed.company.trial, null);
      assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM subscriptions')).n), 0);
      await req('ops-owner-a', `/services/${sA.id}`, 'PUT', { ...service, duration: 480 });
      assert.equal((await complete('ops-owner-a')).data.code, 'ONBOARDING_INCOMPLETE');
      await req('ops-owner-a', `/services/${sA.id}`, 'PUT', service);
      await db.run("UPDATE templates SET active=0 WHERE id='barber-classic'");
      assert.equal((await complete('ops-owner-a')).data.code, 'SELECTION_UNAVAILABLE');
      await db.run("UPDATE templates SET active=1 WHERE id='barber-classic'");
    },
  );
  await t.test(
    'completion rollback includes activation, subscription, progress and idempotency; retry',
    async () => {
      const s = (await serviceCreate('ops-rollback')).data;
      const p = (
        await req('ops-rollback', '/professionals', 'POST', {
          name: 'Responsável',
          services: [s.id],
        })
      ).data;
      assert.equal(
        (await req('ops-rollback', `/professionals/${p.id}/schedule`, 'PUT', hours())).status,
        200,
      );
      for (const statement of [
        'INSERT INTO subscriptions',
        'UPDATE company_onboarding',
        'INSERT INTO idempotency_keys',
      ]) {
        failOn = statement;
        assert.equal((await complete('ops-rollback', 'rollback-trial-key', 2)).status, 503);
        assert.equal(
          (await db.get('SELECT status FROM companies WHERE id=?', [C.id])).status,
          'suspended',
        );
        assert.equal(
          Number(
            (await db.get('SELECT COUNT(*) AS n FROM subscriptions WHERE company_id=?', [C.id])).n,
          ),
          0,
        );
        assert.equal((await req('ops-rollback')).data.company.onboardingStatus, 'pending');
      }
      assert.equal((await complete('ops-rollback', 'rollback-trial-key', 2)).status, 200);
    },
  );
  await t.test(
    'historical trial cannot be restarted; failure preserves pending state',
    async () => {
      const state = (await req('ops-owner-b')).data;
      for (const p of state.professionals)
        assert.equal(
          (await req('ops-owner-b', `/professionals/${p.id}/schedule`, 'PUT', hours())).status,
          200,
        );
      await db.run(
        "INSERT INTO subscriptions(id,company_id,plan_id,status,source,trial_started_at,trial_ends_at,created_at,updated_at) VALUES('old-trial',?,'team','cancelled','manual','2020-01-01T00:00:00.000Z','2020-01-08T00:00:00.000Z','2020','2020')",
        [B.id],
      );
      const prior = await db.get('SELECT * FROM subscriptions WHERE company_id=?', [B.id]);
      assert.equal((await complete('ops-owner-b')).data.code, 'TRIAL_UNAVAILABLE');
      assert.equal(
        (await db.get('SELECT status FROM companies WHERE id=?', [B.id])).status,
        'suspended',
      );
      assert.deepEqual(
        await db.get('SELECT * FROM subscriptions WHERE company_id=?', [B.id]),
        prior,
      );
    },
  );
  await t.test(
    'concurrent completion and lost-response replay start exactly one seven-day trial, no publication',
    async () => {
      const start = Date.now();
      const results = await Promise.all([
        complete('ops-owner-a', 'finish-same-key', 0),
        complete('ops-owner-a', 'finish-same-key', 1),
      ]);
      assert.ok(
        results.every((r) => r.status === 200),
        JSON.stringify(results),
      );
      assert.deepEqual(results[0].data, results[1].data);
      const business = results[0].data.company;
      assert.equal(business.onboardingStatus, 'completed');
      assert.equal(business.trial.status, 'trialing');
      const subscription = await db.get('SELECT * FROM subscriptions WHERE company_id=?', [A.id]);
      assert.equal(
        Date.parse(subscription.trial_ends_at) - Date.parse(subscription.trial_started_at),
        7 * 86400000,
      );
      assert.ok(
        Date.parse(subscription.trial_started_at) >= start &&
          Date.parse(subscription.trial_started_at) <= Date.now(),
      );
      assert.equal(
        Number(
          (await db.get('SELECT COUNT(*) AS n FROM subscriptions WHERE company_id=?', [A.id])).n,
        ),
        1,
      );
      assert.equal((await complete('ops-owner-a', 'finish-other-key')).data.company.id, A.id);
      assert.equal(
        (await req('ops-owner-a')).data.company.trial.trial_started_at,
        business.trial.trial_started_at,
      );
      const row = await db.get('SELECT status,site_published FROM companies WHERE id=?', [A.id]);
      assert.deepEqual({ ...row }, { status: 'active', site_published: 0 });
      for (const path of [
        `/public/${A.slug}/site`,
        `/public/${A.slug}/services`,
        `/public/${A.slug}/barbers`,
      ])
        assert.equal((await req('ops-owner-a', '/api:' + path)).status, 404);
      assert.equal(
        (await req('ops-owner-a', '/services', 'POST', service)).data.code,
        'ONBOARDING_COMPLETED',
      );
      assert.equal(
        (
          await req(
            'ops-owner-a',
            '/api:/admin/professionals',
            'POST',
            { name: 'Excedente', services: [sA.id] },
            null,
            0,
            { 'X-Gradefy-Company-Id': A.id },
          )
        ).data.code,
        'PROFESSIONAL_LIMIT_REACHED',
      );
      await db.run(
        "UPDATE subscriptions SET trial_started_at='2020-01-01T00:00:00.000Z',trial_ends_at='2020-01-08T00:00:00.000Z' WHERE company_id=?",
        [A.id],
      );
      const historical = await db.get('SELECT * FROM subscriptions WHERE company_id=?', [A.id]);
      assert.equal((await complete('ops-owner-a', 'no-new-trial-key')).status, 200);
      assert.deepEqual(
        await db.get('SELECT * FROM subscriptions WHERE company_id=?', [A.id]),
        historical,
      );
      assert.equal(
        (
          await req(
            'ops-owner-a',
            '/api:/admin/professionals',
            'POST',
            { name: 'Excedente', services: [sA.id] },
            null,
            0,
            { 'X-Gradefy-Company-Id': A.id },
          )
        ).data.code,
        'TRIAL_EXPIRED',
      );
      assert.deepEqual(await snapshotIgor(), legacy);
      assert.equal((await req(null, '/api:/public/igor-barber-club/site')).status, 200);
      await db.run(
        "UPDATE company_members SET status='inactive' WHERE company_id=? AND user_id='ops-owner-b'",
        [B.id],
      );
      assert.equal((await req('ops-owner-b')).status, 403);
    },
  );
}
