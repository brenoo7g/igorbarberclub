import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { dashboardSnapshot, companyClock, dashboardPeriod } from '../../server/dashboard.js';

export async function assertDashboard(t, db) {
  await seed(db);
  const tables = [
    'companies',
    'company_members',
    'company_settings',
    'appointments',
    'services',
    'barbers',
    'subscriptions',
  ];
  const legacy = () =>
    Promise.all(
      tables.map((table) =>
        db.all(
          `SELECT * FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}='igor-barber-club' ORDER BY 1`,
        ),
      ),
    );
  const before = await legacy();
  const history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const secret = 'dashboard-disposable-secret',
    cookies = {};
  for (const id of ['dash-owner', 'dash-manager', 'dash-pro', 'dash-b', 'dash-admin', 'dash-new']) {
    await db.run(
      'INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
      [id, id, id + '@example.test', '', 'test', id === 'dash-admin' ? 'admin' : 'client', '2026'],
    );
    cookies[id] =
      'session=' +
      jwt.sign({ version: 0 }, secret, {
        subject: id,
        issuer: 'igor-barber-club',
        audience: 'barber-web',
      });
  }
  for (const [cid, tz, published] of [
    ['dash-a', 'America/Sao_Paulo', 0],
    ['dash-b', 'Asia/Tokyo', 1],
  ]) {
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,timezone,site_published,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',?,?,'2026','2026')",
      [cid, cid, cid, tz, published],
    );
    await db.run(
      "INSERT INTO company_settings(company_id,logo_url,updated_at) VALUES(?,'/images/barber-classic-icon.svg','2026')",
      [cid],
    );
    await db.run(
      "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,?,'',40,3000,'Corte')",
      [cid, cid + '-s', 'Corte ' + cid],
    );
    await db.run("INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,?,?,'')", [
      cid,
      cid + '-p',
      'Equipe ' + cid,
    ]);
  }
  for (const [cid, uid, role] of [
    ['dash-a', 'dash-owner', 'owner'],
    ['dash-b', 'dash-owner', 'manager'],
    ['dash-a', 'dash-manager', 'manager'],
    ['dash-a', 'dash-pro', 'professional'],
    ['dash-b', 'dash-b', 'owner'],
  ])
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,'2026')",
      [cid, uid, role],
    );
  const server = createApp(db, {
    secret,
    test: true,
    serveStatic: false,
    siteStorage: null,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function req(user = 'dash-owner', cid = 'dash-a', query = '', path = '/dashboard') {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/api${path}${query}`, {
      headers: {
        ...(user ? { Cookie: cookies[user] } : {}),
        ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
      },
    });
    return { status: r.status, data: await r.json(), cache: r.headers.get('cache-control') };
  }
  async function appointment(id, cid, date, start, status, total = 3000) {
    await db.run(
      "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name,guest_email,guest_phone) VALUES(?,?,?,?,?,?,?,?,'2026',?,'test@example.test','21999998888')",
      [
        id,
        cid,
        cid + '-p',
        date,
        start,
        start + 20,
        total,
        status,
        cid === 'dash-b' ? 'Segredo da B' : 'Cliente ' + id,
      ],
    );
    await db.run(
      'INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,?,?,20)',
      [cid, id, cid + '-s', 'Corte ' + cid, total],
    );
  }
  const now = new Date('2026-10-10T02:30:00Z');
  for (const [id, date, time, status, total] of [
    ['dash-past', '2026-10-09', 540, 'confirmed', 3000],
    ['dash-next', '2026-10-09', 1420, 'confirmed', 4000],
    ['dash-done', '2026-10-09', 600, 'completed', 1500],
    ['dash-cancel', '2026-10-09', 1430, 'cancelled', 900000],
    ['dash-noshow', '2026-10-09', 1410, 'no-show', 900000],
    ['dash-future', '2026-10-10', 540, 'confirmed', 2500],
    ['dash-last-month', '2026-09-30', 540, 'completed', 6000],
  ])
    await appointment(id, 'dash-a', date, time, status, total);
  await appointment('dash-other', 'dash-b', '2026-10-10', 720, 'confirmed', 98700);
  const snapshot = (cid = 'dash-a', query = {}, timestamp = now) =>
    db.transaction((tx) => dashboardSnapshot(tx, cid, query, timestamp), { readOnly: true });
  await t.test(
    'owner/manager only, selection is explicit for multiple memberships and public paths never authorize',
    async () => {
      assert.equal((await req(null)).status, 401);
      for (const user of ['dash-pro', 'dash-b', 'dash-admin', 'dash-new'])
        assert.equal((await req(user)).status, 403);
      assert.equal((await req('dash-owner', null)).status, 409);
      assert.equal((await req('dash-owner', 'absent')).status, 403);
      assert.equal((await req('dash-manager')).status, 200);
      assert.equal((await req('dash-owner', 'dash-b')).data.company.id, 'dash-b');
      assert.equal((await req('dash-owner', 'dash-b', '', '/public/dash-b/dashboard')).status, 404);
    },
  );
  await t.test(
    'today and monthly aggregates use statuses and appointment snapshots, with no receipt claim',
    async () => {
      const data = await snapshot();
      assert.deepEqual(data.metrics, {
        todayAppointments: 3,
        completedAppointments: 1,
        expectedValueCents: 11000,
      });
      assert.deepEqual(data.period, { code: 'month', start: '2026-10-01', end: '2026-10-31' });
      assert.equal(data.nextAppointment.id, 'dash-next');
      assert.equal(data.nextAppointment.clientName, 'Cliente dash-next');
      assert.equal(data.nextAppointment.professionalName, 'Equipe dash-a');
      assert.equal(data.nextAppointment.duration, 20);
      assert.deepEqual(data.nextAppointment.services, ['Corte dash-a']);
      assert.equal((await snapshot('dash-a', { period: 'day' })).metrics.expectedValueCents, 8500);
      assert.equal(
        (await snapshot('dash-a', { period: 'week' })).metrics.expectedValueCents,
        11000,
      );
      assert.ok(!JSON.stringify(data).includes('Segredo da B'));
      assert.equal(data.agenda.total, 5);
      assert.deepEqual(
        data.agenda.items.map((a) => a.time),
        ['09:00', '10:00', '23:30', '23:40', '23:50'],
      );
      assert.equal('revenue' in data.metrics, false);
    },
  );
  await t.test(
    'company timezone, day boundaries, local greeting, leap months and Sunday/Monday week calculation',
    async () => {
      assert.equal(companyClock(now, 'America/Sao_Paulo').today, '2026-10-09');
      assert.equal(
        (await snapshot('dash-a', {}, new Date('2026-10-10T02:40:00Z'))).nextAppointment.id,
        'dash-next',
      );
      for (const timestamp of ['2026-10-10T02:40:00.001Z', '2026-10-10T02:40:01Z'])
        assert.equal(
          (await snapshot('dash-a', {}, new Date(timestamp))).nextAppointment.id,
          'dash-future',
        );
      const b = await snapshot('dash-b');
      assert.equal(b.clock.today, '2026-10-10');
      assert.equal(b.clock.greeting, 'Bom dia');
      assert.equal(b.metrics.todayAppointments, 1);
      assert.equal(b.nextAppointment.clientName, 'Segredo da B');
      assert.equal(
        (await snapshot('dash-a', { date: '2026-10-10' })).agenda.items[0].id,
        'dash-future',
      );
      assert.deepEqual(dashboardPeriod('2028-02-01', 'month'), {
        start: '2028-02-01',
        end: '2028-02-29',
      });
      assert.deepEqual(dashboardPeriod('2026-10-11', 'week'), {
        start: '2026-10-05',
        end: '2026-10-11',
      });
      assert.deepEqual(dashboardPeriod('2026-10-12', 'week'), {
        start: '2026-10-12',
        end: '2026-10-18',
      });
      assert.throws(() => companyClock(now, 'bad-zone'), /fuso horário/);
    },
  );
  await t.test(
    'empty state, foreign professional and date/query tampering fail safely',
    async () => {
      const empty = await snapshot('dash-a', { date: '2027-01-01' });
      assert.equal(empty.agenda.total, 0);
      assert.deepEqual(empty.agenda.items, []);
      const done = await snapshot('dash-a', {}, new Date('2028-01-01T20:00:00Z'));
      assert.deepEqual(done.metrics, {
        todayAppointments: 0,
        completedAppointments: 0,
        expectedValueCents: 0,
      });
      assert.equal(done.nextAppointment, null);
      for (const query of [
        '?date=2026-02-30',
        '?period=year',
        '?page=0',
        '?page=1.5',
        '?page=100001',
        '?company_id=dash-b',
        '?date=0001-01-01',
      ])
        assert.equal((await req('dash-owner', 'dash-a', query)).status, 400);
      assert.equal((await req('dash-owner', 'dash-a', '?professionalId=dash-b-p')).status, 404);
      await db.run("UPDATE companies SET timezone='invalid-zone' WHERE id='dash-a'");
      assert.equal((await req()).status, 409);
      await db.run("UPDATE companies SET timezone='America/Sao_Paulo' WHERE id='dash-a'");
    },
  );
  await t.test(
    'agenda is paginated and ordered; multi-service snapshots do not duplicate indicators',
    async () => {
      await db.run(
        "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES('dash-a','dash-second','Barba','',20,1000,'Barba')",
      );
      await db.run(
        "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES('dash-a','dash-next','dash-second','Barba',1000,20)",
      );
      for (let i = 0; i < 45; i++)
        await appointment('dash-page-' + i, 'dash-a', '2026-10-09', 700 + i, 'cancelled');
      const a = await snapshot('dash-a', { professionalId: 'dash-a-p' });
      const second = await snapshot('dash-a', { page: 2 });
      const last = await snapshot('dash-a', { page: 3 });
      assert.equal(a.agenda.total, 50);
      assert.equal(a.agenda.items.length, 20);
      assert.equal(second.agenda.items.length, 20);
      assert.equal(last.agenda.items.length, 10);
      assert.equal(
        new Set([...a.agenda.items, ...second.agenda.items, ...last.agenda.items].map((i) => i.id))
          .size,
        50,
      );
      assert.deepEqual(a.metrics, {
        todayAppointments: 3,
        completedAppointments: 1,
        expectedValueCents: 11000,
      });
      assert.deepEqual(a.nextAppointment.services, ['Barba', 'Corte dash-a']);
      const statements = [];
      await dashboardSnapshot(
        {
          ...db,
          all: (sql, args) => {
            statements.push(sql);
            return db.all(sql, args);
          },
        },
        'dash-a',
        {},
        now,
      );
      assert.ok(
        statements
          .filter(
            (sql) =>
              sql.includes('FROM appointments') && !sql.includes('COUNT(') && !sql.includes('SUM('),
          )
          .every((sql) => sql.includes('LIMIT')),
      );
    },
  );
  await t.test(
    'subscription/trial state comes from real timestamps, independently of publication, without writes',
    async () => {
      assert.equal((await req()).data.subscription.status, null);
      assert.equal((await req()).data.site.published, false);
      const current = new Date(),
        start = new Date(current.getTime() - 86400000).toISOString(),
        end = new Date(current.getTime() + 36 * 3600000).toISOString();
      await db.run(
        "INSERT INTO subscriptions(id,company_id,plan_id,status,source,trial_started_at,trial_ends_at,created_at,updated_at) VALUES('dash-trial','dash-a','individual','trialing','manual',?,?,?,?)",
        [start, end, start, start],
      );
      let result = await req();
      assert.equal(result.data.subscription.valid, true);
      assert.equal(result.data.subscription.planName, 'Individual');
      assert.equal(result.data.subscription.trialDaysRemaining, 2);
      assert.equal(result.data.site.published, false);
      assert.equal(result.cache, 'no-store');
      await db.run(
        "UPDATE subscriptions SET trial_started_at='2000-01-01',trial_ends_at='2000-01-08' WHERE id='dash-trial'",
      );
      await db.run("UPDATE companies SET site_published=1 WHERE id='dash-a'");
      result = await req();
      assert.equal(result.data.subscription.valid, false);
      assert.equal(result.data.subscription.reason, 'TRIAL_EXPIRED');
      assert.equal(result.data.subscription.trialDaysRemaining, 0);
      assert.equal(result.data.site.published, true);
      await db.run(
        "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES('dash-active','dash-b','team','active','manual','2026','2026')",
      );
      const b = await req('dash-owner', 'dash-b');
      assert.equal(b.data.subscription.planName, 'Equipe');
      assert.equal(b.data.subscription.valid, true);
      assert.equal(b.data.subscription.trialDaysRemaining, 0);
    },
  );
  await t.test(
    'onboarding pending, suspension and same-JWT role revocation never grant dashboard access',
    async () => {
      await db.run(
        "UPDATE company_members SET role='professional' WHERE company_id='dash-a' AND user_id='dash-manager'",
      );
      assert.equal((await req('dash-manager')).status, 403);
      await db.run("UPDATE companies SET status='suspended' WHERE id='dash-b'");
      assert.equal((await req('dash-owner', 'dash-b')).status, 403);
      await db.run("UPDATE companies SET status='active' WHERE id='dash-b'");
      const response = await fetch(
        `http://127.0.0.1:${server.address().port}/api/onboarding/business`,
        {
          method: 'POST',
          headers: { Cookie: cookies['dash-new'], 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Pendente',
            slug: 'dash-pending',
            phone: '21999998888',
            city: 'Rio de Janeiro',
            region: 'RJ',
            planCode: 'individual',
            nicheCode: 'barbershop',
            templateCode: 'barber-classic',
          }),
        },
      );
      assert.equal(response.status, 201);
      const { company } = await response.json();
      assert.equal((await req('dash-new', company.id)).status, 403);
      await db.run("UPDATE companies SET status='active' WHERE id=?", [company.id]);
      assert.equal((await req('dash-new', company.id)).status, 409);
    },
  );
  await t.test(
    'Igor, migrations and all legacy data are preserved, with no automatic subscription',
    async () => {
      assert.deepEqual(await legacy(), before);
      assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), history);
      assert.equal((await req('dash-owner', null, '', '/site')).status, 200);
    },
  );
}
