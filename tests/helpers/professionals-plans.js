import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import {
  startTrial,
  changeCompanyPlan,
  getCompanyEntitlements,
  activeProfessionalCount,
  lockEntitlements,
} from '../../server/entitlements.js';
import { lockBarbers } from '../../server/scheduling-locks.js';
import { addDays, dateInBrazil, weekday } from '../../server/domain.js';
import { seed } from '../../server/seed.js';

export async function assertProfessionalsPlans(t, db, second = db, repetitions = 5) {
  const secret = 'phase-five-disposable-test-secret-at-least-32';
  const cookies = {};
  for (const id of ['owner-a', 'owner-b', 'manager', 'professional', 'outsider']) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999999999','fixture','client','2026')",
      [id, id, `${id}@example.test`],
    );
    cookies[id] =
      `session=${jwt.sign({ version: 0 }, secret, { subject: id, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  }
  const servers = [db, second].map((source) =>
    createApp(source, { secret, test: true, serveStatic: false }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((server) => once(server, 'listening')));
  t.after(async () => {
    for (const server of servers) await new Promise((done) => server.close(done));
  });
  let sequence = 0;
  async function company(planCode = null, owner = 'owner-a') {
    const id = `professionals-${++sequence}`;
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,'Teste','barbershop','barber-classic','2026','2026')",
      [id, id],
    );
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,'owner','2026')",
      [id, owner],
    );
    for (const suffix of ['cut', 'beard'])
      await db.run(
        "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,?,'Teste',40,4000,'Corte')",
        [id, `${id}-${suffix}`, suffix],
      );
    if (planCode) await startTrial(db, id, planCode);
    return id;
  }
  const request = async (
    company,
    path,
    body,
    { user = 'owner-a', method = 'POST', instance = 0, legacy = false } = {},
  ) => {
    const prefix = path.startsWith('/admin') || legacy ? '/api' : `/api/public/${company}`;
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}${prefix}${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookies[user] || '',
          'X-Gradefy-Company-Id': company,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, body: await response.json() };
  };
  const create = (c, extra = {}, options = {}) =>
    request(
      c,
      '/admin/professionals',
      { name: 'Profissional Teste', specialty: 'Corte', services: [`${c}-cut`], ...extra },
      options,
    );
  const status = (c, id, active, options = {}) =>
    request(c, `/admin/professionals/${id}/status`, { active }, { method: 'PATCH', ...options });
  let date = addDays(dateInBrazil(), 5);
  while (weekday(date) === 0) date = addDays(date, 1);
  const booking = (c, id, service = 'cut', time = '09:00') =>
    request(c, '/appointments', { barberId: id, date, time, services: [`${c}-${service}`] });
  const configure = (c, id) =>
    request(
      c,
      `/admin/barbers/${id}/schedule`,
      {
        agenda_mode: 'auto',
        max_days_ahead: 90,
        version: 0,
        days: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          active: true,
          start_time: '09:00',
          end_time: '19:00',
          breaks: [],
        })),
      },
      { method: 'PUT' },
    );
  const availability = (c, id, service = 'cut') =>
    request(c, `/availability?barberId=${id}&date=${date}&services=${c}-${service}`, null, {
      method: 'GET',
    });

  await t.test(
    'A–J/M: Individual counts active professionals only, optional member link, inactive history, reactivation and Team',
    async () => {
      const c = await company('individual');
      for (const [user, role] of [
        ['manager', 'manager'],
        ['professional', 'professional'],
      ])
        await db.run(
          "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,'2026')",
          [c, user, role],
        );
      assert.equal(await activeProfessionalCount(db, c), 0);
      const first = await create(c, { userId: 'owner-a' });
      assert.equal(first.status, 201);
      assert.equal(first.body.user_id, 'owner-a');
      const inactive = [];
      for (let i = 0; i < 2; i++) {
        const result = await create(c, { active: false });
        assert.equal(result.status, 201);
        inactive.push(result.body.id);
      }
      assert.equal(await activeProfessionalCount(db, c), 1);
      const denied = await create(c);
      assert.equal(denied.status, 409);
      assert.equal(denied.body.code, 'PROFESSIONAL_LIMIT_REACHED');
      assert.equal((await status(c, inactive[0], true)).body.code, 'PROFESSIONAL_LIMIT_REACHED');
      assert.equal((await status(c, first.body.id, false)).status, 200);
      assert.equal((await status(c, inactive[0], true)).status, 200);
      assert.equal(await activeProfessionalCount(db, c), 1);
      assert.equal((await create(c, {}, { user: 'professional' })).status, 403);
      assert.equal((await create(c, {}, { user: 'outsider' })).status, 403);
      assert.equal(
        (await request(c, '/admin/professionals', null, { method: 'GET', user: 'manager' })).status,
        200,
      );
      await changeCompanyPlan(db, c, 'team');
      const ownDuplicate = await create(c, { userId: 'owner-a' });
      assert.equal(ownDuplicate.body.code, 'MEMBER_ALREADY_LINKED');
      assert.equal((await create(c, { userId: 'professional' })).status, 201);
      assert.equal((await create(c, {}, { user: 'manager' })).status, 201);
      assert.equal(await activeProfessionalCount(db, c), 3);
      assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM users')).n), 5);
    },
  );
  await t.test(
    'N/O/P/Q: no plan, expired trial, upgrade and refused downgrade preserve staff and appointments',
    async () => {
      const c = await company();
      for (const active of [true, false])
        assert.equal((await create(c, { active })).body.code, 'PLAN_REQUIRED');
      const trial = await startTrial(db, c, 'individual');
      assert.equal(
        Date.parse(trial.trial_ends_at) - Date.parse(trial.trial_started_at),
        7 * 86400000,
      );
      const first = await create(c);
      assert.equal(first.status, 201);
      const inactive = await create(c, { active: false });
      assert.equal(inactive.status, 201);
      assert.equal((await availability(c, first.body.id)).body.slots.length, 0);
      assert.equal((await booking(c, first.body.id)).status, 409);
      assert.equal((await configure(c, first.body.id)).status, 200);
      const booked = await booking(c, first.body.id);
      assert.equal(booked.status, 201);
      await changeCompanyPlan(db, c, 'team');
      const third = await create(c);
      assert.equal(third.status, 201);
      const stable = await db.get('SELECT * FROM subscriptions WHERE company_id=?', [c]);
      assert.equal(stable.trial_ends_at, trial.trial_ends_at);
      assert.equal(stable.ends_at, trial.ends_at);
      await assert.rejects(changeCompanyPlan(db, c, 'individual'), {
        code: 'PLAN_DOWNGRADE_REQUIRES_ACTION',
      });
      assert.deepEqual(await db.get('SELECT * FROM subscriptions WHERE company_id=?', [c]), stable);
      assert.equal(await activeProfessionalCount(db, c), 2);
      await status(c, third.body.id, false);
      await changeCompanyPlan(db, c, 'individual');
      assert.equal((await getCompanyEntitlements(db, c)).maxProfessionals, 1);
      const start = new Date(Date.now() - 9 * 86400000).toISOString(),
        end = new Date(Date.now() - 2 * 86400000).toISOString();
      await db.run(
        'UPDATE subscriptions SET starts_at=?,ends_at=?,trial_started_at=?,trial_ends_at=? WHERE company_id=?',
        [start, end, start, end, c],
      );
      assert.equal((await create(c)).body.code, 'TRIAL_EXPIRED');
      assert.equal((await status(c, inactive.body.id, true)).body.code, 'TRIAL_EXPIRED');
      assert.equal(
        (await db.get('SELECT status FROM appointments WHERE id=?', [booked.body.id])).status,
        'confirmed',
      );
      assert.equal((await booking(c, first.body.id, 'cut', '09:40')).status, 201);
      await assert.rejects(startTrial(db, c, 'team'), { code: 'TRIAL_UNAVAILABLE' });
      await assert.rejects(changeCompanyPlan(db, c, 'team'), { code: 'TRIAL_EXPIRED' });
      await db.run("UPDATE subscriptions SET status='cancelled' WHERE company_id=?", [c]);
      assert.equal((await status(c, inactive.body.id, true)).body.code, 'PLAN_REQUIRED');
      await assert.rejects(startTrial(db, c, 'individual'), { code: 'TRIAL_UNAVAILABLE' });
    },
  );
  await t.test(
    'Services, public filter, foreign IDs, membership linkage and soft delete preserve history',
    async () => {
      const A = await company('team'),
        B = await company('team', 'owner-b');
      const a = await create(A),
        b = await create(B, {}, { user: 'owner-b' });
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      for (const path of [
        `/admin/professionals/${b.body.id}`,
        `/admin/professionals/${b.body.id}/status`,
      ])
        assert.equal(
          (
            await request(A, path, path.endsWith('status') ? { active: false } : null, {
              method: path.endsWith('status') ? 'PATCH' : 'GET',
            })
          ).status,
          404,
        );
      assert.equal(
        (
          await request(
            A,
            `/admin/professionals/${b.body.id}`,
            { name: 'Ataque', services: [`${A}-cut`] },
            { method: 'PUT' },
          )
        ).status,
        404,
      );
      assert.equal((await request(B, '/admin/professionals', null, { method: 'GET' })).status, 403);
      assert.equal(
        (await create(A, { services: [`${B}-cut`] })).body.code,
        'INVALID_PROFESSIONAL_SERVICE',
      );
      assert.equal(
        (await create(A, { userId: 'owner-b' })).body.code,
        'INVALID_PROFESSIONAL_MEMBER',
      );
      assert.equal((await create(A, { services: [`${A}-cut`, `${A}-cut`] })).status, 400);
      await assert.rejects(
        db.run(
          'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
          [A, a.body.id, `${B}-cut`, '2026'],
        ),
      );
      await assert.rejects(
        db.run(
          'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
          [A, b.body.id, `${A}-cut`, '2026'],
        ),
      );
      await assert.rejects(
        db.run(
          'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
          [A, a.body.id, `${A}-cut`, '2026'],
        ),
      );
      await assert.rejects(
        db.run(
          'INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES(?,?,?,?)',
          [A, a.body.id, 'owner-b', '2026'],
        ),
      );
      await assert.rejects(
        db.run('UPDATE barber_services SET barber_id=NULL WHERE company_id=?', [A]),
      );
      assert.equal(
        (await request(A, `/barbers?services=${A}-beard`, null, { method: 'GET' })).body.length,
        0,
      );
      assert.equal((await availability(A, a.body.id, 'beard')).body.slots.length, 0);
      assert.equal((await booking(A, a.body.id, 'beard')).status, 409);
      await configure(A, a.body.id);
      const booked = await booking(A, a.body.id);
      assert.equal(booked.status, 201);
      const history = JSON.parse(
        JSON.stringify(await db.get('SELECT * FROM appointments WHERE id=?', [booked.body.id])),
      );
      const items = JSON.parse(
        JSON.stringify(
          await db.all('SELECT * FROM appointment_services WHERE appointment_id=?', [
            booked.body.id,
          ]),
        ),
      );
      const edited = await request(
        A,
        `/admin/professionals/${a.body.id}`,
        { name: 'Nome editado', specialty: 'Teste', services: [`${A}-beard`], userId: 'owner-a' },
        { method: 'PUT' },
      );
      assert.equal(edited.status, 200);
      assert.equal(
        (await request(A, `/barbers?services=${A}-cut`, null, { method: 'GET' })).body.length,
        0,
      );
      assert.equal((await booking(A, a.body.id, 'cut', '09:40')).status, 409);
      assert.equal((await booking(A, a.body.id, 'beard', '09:40')).status, 201);
      await status(A, a.body.id, false);
      assert.equal((await request(A, '/barbers', null, { method: 'GET' })).body.length, 0);
      assert.equal((await booking(A, a.body.id, 'beard', '10:20')).status, 404);
      assert.deepEqual(
        JSON.parse(
          JSON.stringify(await db.get('SELECT * FROM appointments WHERE id=?', [booked.body.id])),
        ),
        history,
      );
      assert.deepEqual(
        JSON.parse(
          JSON.stringify(
            await db.all('SELECT * FROM appointment_services WHERE appointment_id=?', [
              booked.body.id,
            ]),
          ),
        ),
        items,
      );
      assert.equal(
        (await request(A, `/admin/professionals/${a.body.id}`, null, { method: 'DELETE' })).status,
        404,
      );
      const other = await create(A);
      assert.equal(other.status, 201);
      await assert.rejects(
        db.run(
          'INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES(?,?,?,?)',
          [A, other.body.id, 'owner-a', '2026'],
        ),
      );
    },
  );
  await t.test(
    `K/L: ${repetitions} concurrent creates/reactivations and independent company trials`,
    async () => {
      for (let i = 0; i < repetitions; i++) {
        const A = await company('individual'),
          B = await company('individual', 'owner-b');
        let results = await Promise.all([
          create(A),
          create(A, {}, { instance: 1 }),
          create(B, {}, { instance: 1, user: 'owner-b' }),
        ]);
        assert.deepEqual(
          results
            .slice(0, 2)
            .map((r) => r.status)
            .sort(),
          [201, 409],
        );
        assert.equal(results[2].status, 201);
        assert.equal(await activeProfessionalCount(db, A), 1);
        assert.equal(await activeProfessionalCount(db, B), 1);
        const one = results.find((r) => r.status === 201).body;
        await status(A, one.id, false);
        const two = await create(A, { active: false });
        assert.equal(two.status, 201);
        results = await Promise.all([
          status(A, one.id, true),
          status(A, two.body.id, true, { instance: 1 }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        assert.equal(await activeProfessionalCount(db, A), 1);
      }
      const c = await company();
      const trials = await Promise.allSettled([
        startTrial(db, c, 'individual'),
        startTrial(second, c, 'team'),
      ]);
      assert.equal(trials.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(trials.find((r) => r.status === 'rejected').reason.code, 'TRIAL_UNAVAILABLE');
    },
  );
  if (db.dialect === 'postgres')
    await t.test(
      'PG entitlement barrier: one company cannot block another; deactivation competes with booking',
      async () => {
        const A = await company('individual'),
          B = await company('individual', 'owner-b');
        let release, ready;
        const gate = new Promise((r) => {
            release = r;
          }),
          barrier = new Promise((r) => {
            ready = r;
          });
        const held = db.transaction(async (tx) => {
          await lockEntitlements(tx, A);
          ready();
          await gate;
        });
        await barrier;
        let timer;
        try {
          const result = await Promise.race([
            create(B, {}, { instance: 1, user: 'owner-b' }),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(Error('Global entitlement lock')), 3000);
            }),
          ]);
          assert.equal(result.status, 201);
        } finally {
          clearTimeout(timer);
          release();
          await held;
        }
        const p = await create(A);
        await configure(A, p.body.id);
        const races = await Promise.all([
          booking(A, p.body.id),
          status(A, p.body.id, false, { instance: 1 }),
        ]);
        assert.equal(races[1].status, 200);
        assert.ok([201, 404, 409].includes(races[0].status));
        assert.equal((await booking(A, p.body.id, 'cut', '09:40')).status, 404);
      },
    );
  await t.test(
    'Catalog prices/codes, paid manual entitlement, SQLite/PG required values and legacy Igor remain intact',
    async () => {
      const plans = await db.all(
        'SELECT id,name,price_cents,currency,billing_interval,trial_days,max_professionals FROM plans ORDER BY id',
      );
      assert.deepEqual(JSON.parse(JSON.stringify(plans)), [
        {
          id: 'individual',
          name: 'Individual',
          price_cents: 2299,
          currency: 'BRL',
          billing_interval: 'month',
          trial_days: 7,
          max_professionals: 1,
        },
        {
          id: 'team',
          name: 'Equipe',
          price_cents: 3299,
          currency: 'BRL',
          billing_interval: 'month',
          trial_days: 7,
          max_professionals: null,
        },
      ]);
      const c = await company();
      await db.run(
        "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,'individual','active','manual','2026','2026')",
        [`${c}-sub`, c],
      );
      assert.equal((await create(c)).status, 201);
      assert.equal((await create(c)).body.code, 'PROFESSIONAL_LIMIT_REACHED');
      await assert.rejects(db.run('UPDATE plans SET price_cents=-1'));
      await assert.rejects(db.run("UPDATE plans SET trial_days='1.5'"));
      await assert.rejects(
        db.run("UPDATE subscriptions SET status='trialing' WHERE company_id=?", [c]),
      );
      // Existing legacy catalog intentionally has custom IDs; skip unrelated demo population.
      await db.run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('legacy-fixture-customer','Legado','cliente@example.com','21999999999','fixture','client','2026')",
      );
      await seed(db);
      const count = await activeProfessionalCount(db, 'igor-barber-club');
      assert.ok(count > 0);
      assert.equal((await getCompanyEntitlements(db, 'igor-barber-club')).valid, false);
      const barbers = await request('igor-barber-club', '/barbers', null, {
        method: 'GET',
        legacy: true,
      });
      assert.ok(barbers.body.length > 0);
      const links = await db.all('SELECT * FROM barber_services WHERE company_id=?', [
        'igor-barber-club',
      ]);
      if (links.length) {
        const link = links[0];
        await db.run(
          'DELETE FROM barber_services WHERE company_id=? AND barber_id=? AND service_id=?',
          [link.company_id, link.barber_id, link.service_id],
        );
        await seed(db);
        assert.equal(
          await db.get(
            'SELECT * FROM barber_services WHERE company_id=? AND barber_id=? AND service_id=?',
            [link.company_id, link.barber_id, link.service_id],
          ),
          undefined,
        );
      }
      assert.equal(await activeProfessionalCount(db, 'igor-barber-club'), count);
    },
  );
  t.diagnostic(
    `${db.dialect}: Individual creation/reactivation repeated ${repetitions} times; no real billing/provider calls`,
  );
}
