import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { dateInTimezone, addDays } from '../../server/domain.js';
import { readMigration, migrations, runMigrations } from '../../server/migrations.js';
import { lockProfessionalAccess, setProfessionalLink } from '../../server/professional-links.js';
import { installProfessionalBrowserFixture } from './professional-browser.js';
import { reconstructBeforeProfessionalPanel } from './professional-panel-migration.js';

export async function assertProfessionalPanelMigration(t, db) {
  const snapshot = {};
  for (const table of [
    'users',
    'companies',
    'company_members',
    'professional_users',
    'barbers',
    'appointments',
    'subscriptions',
  ])
    snapshot[table] = await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2');
  const journal = await db.all('SELECT * FROM schema_migrations WHERE version<17 ORDER BY version');
  await reconstructBeforeProfessionalPanel(db);
  await assert.rejects(
    runMigrations({
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (sql.startsWith('CREATE INDEX professional_activity_history'))
                throw Error('injected panel migration failure');
              return tx.run(sql, args);
            },
          }),
        ),
    }),
    /injected panel migration failure/,
  );
  await assert.rejects(db.all('SELECT * FROM professional_activity_events'));
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=17'), undefined);
  assert.deepEqual(await runMigrations(db), [17, 18]);
  assert.deepEqual(await runMigrations(db), []);
  for (const [table, rows] of Object.entries(snapshot))
    assert.deepEqual(await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2'), rows);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<17 ORDER BY version'),
    journal,
  );
  assert.equal(
    (await db.get('SELECT checksum FROM schema_migrations WHERE version=17')).checksum,
    readMigration(migrations[16]).checksum,
  );
  await assert.rejects(
    db.run(
      "INSERT INTO professional_activity_events(id,company_id,actor_user_id,affected_user_id,barber_id,action,created_at) VALUES(NULL,'igor-barber-club','missing','missing','igor','linked','2026')",
    ),
  );
  t.diagnostic(
    '017 additive, repeated, transactional rollback, explicit identifiers and immutable 001–016',
  );
}
export async function assertProfessionalPanel(t, db, second = db) {
  await seed(db);
  await installProfessionalBrowserFixture(db, 'fixture');
  const cid = 'staff-browser-a',
    pid = cid + '-p2',
    secret = 'staff-disposable-test-secret';
  let fail = false;
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (
                fail &&
                sql.startsWith('INSERT INTO professional_activity_events') &&
                args[7] === 'completed'
              ) {
                fail = false;
                throw Error('injected professional event failure');
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((connection) =>
    createApp(connection, {
      secret,
      test: true,
      serveStatic: false,
      notificationAdapters: { email: async () => false, whatsapp: async () => false },
      invitationEmail: { configured: () => false },
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(() => Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve)))));
  const cookie = (user) =>
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: 'staff-browser-' + user,
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  async function req(
    path,
    { user = 'second', company = cid, method = 'GET', body, key, instance = 0, headers = {} } = {},
  ) {
    const r = await fetch('http://127.0.0.1:' + servers[instance].address().port + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(company ? { 'X-Gradefy-Company-Id': company } : {}),
        ...(user ? { Cookie: cookie(user) } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const detail = async (id = 'staff-browser-complete', opts = {}) =>
    (await req('/professional/agenda/' + id, opts)).data;
  const complete = async (id, opts = {}) =>
    req('/professional/agenda/' + id + '/complete', {
      method: 'PATCH',
      body: { expected: (await detail(id)).expected },
      ...opts,
    });
  const link = (user, professional, expected, opts = {}) =>
    req('/admin/team/members/staff-browser-' + user + '/professional', {
      user: 'owner',
      method: 'PATCH',
      body: { professionalId: professional, expectedProfessionalId: expected, confirm: true },
      ...opts,
    });
  const snapshot = await db.all(
    'SELECT * FROM appointment_services WHERE company_id=? ORDER BY appointment_id,service_id',
    [cid],
  );
  const finances = await db.all('SELECT * FROM financial_payments ORDER BY id'),
    plans = await db.all('SELECT * FROM plans ORDER BY id');

  await t.test(
    'own day/week, summary, next and historical snapshots are scoped server-side; DTO has no prices, contact or private notes',
    async () => {
      const r = await req('/professional/agenda');
      assert.equal(r.status, 200);
      assert.equal(r.data.linkState, 'linked');
      assert.equal(r.data.professional.id, pid);
      assert.equal(r.data.items.length, 1);
      assert.equal(r.data.items[0].clientName, 'Cliente da Minha Agenda');
      assert.equal(r.data.items[0].services[0].name, 'Corte Snapshot Próprio');
      assert.equal(r.data.today, dateInTimezone(new Date(r.data.now), r.data.company.timezone));
      const week = await req('/professional/agenda?view=week&from=' + addDays(r.data.today, -1));
      assert.equal(week.status, 200);
      assert.equal(week.data.total, 3);
      const json = JSON.stringify(week.data);
      for (const forbidden of [
        'PRIVATE-',
        '4500',
        'client_email',
        'client_phone',
        'notes',
        'financial',
        'payment',
        'price',
        'totalCents',
        'Cliente Exclusivo de Outro',
        'Cliente da Outra Empresa',
      ])
        assert.equal(json.includes(forbidden), false, forbidden);
      assert.equal((await req('/professional/agenda?professionalId=' + cid + '-p1')).status, 400);
      assert.equal((await req('/professional/agenda?view=month')).status, 400);
      assert.equal((await req('/professional/agenda?from=2026-02-30')).status, 400);
      assert.equal((await req('/professional/agenda?page=0')).status, 400);
      assert.equal((await req('/professional/agenda?page=100')).data.items.length, 0);
    },
  );
  await t.test(
    'own details resist IDOR, absent authentication/context and cross-company selectors; no administrative permissions',
    async () => {
      assert.equal((await req('/professional/agenda', { user: null })).status, 401);
      assert.equal((await req('/professional/agenda', { company: null })).status, 409);
      assert.equal((await req('/professional/agenda', { user: 'outsider' })).status, 403);
      for (const id of ['staff-browser-other', 'staff-browser-secret', 'unknown'])
        assert.equal((await req('/professional/agenda/' + id)).status, 404);
      assert.equal((await req('/professional/agenda', { company: 'staff-browser-b' })).status, 403);
      for (const path of [
        '/admin/agenda',
        '/admin/finance',
        '/admin/reports',
        '/admin/settings',
        '/admin/team',
        '/admin/clients',
        '/admin/professionals',
      ])
        assert.equal((await req(path)).status, 403, path);
      assert.equal((await req('/admin/settings', { method: 'PUT', body: {} })).status, 403);
    },
  );
  await t.test(
    'explicit pending account has no appointments; owner links/unlinks and no second professional or guessed identity is created',
    async () => {
      const r = await req('/professional/agenda', { user: 'pending' });
      assert.equal(r.status, 200);
      assert.equal(r.data.linkState, 'pending');
      assert.equal(r.data.professional, null);
      assert.equal(r.data.summary, null);
      assert.deepEqual(r.data.items, []);
      assert.match(r.data.message, /proprietário ainda precisa vincular/);
      assert.equal((await link('pending', 'staff-browser-b-p1', null)).status, 404);
      assert.equal((await link('pending', pid, null)).status, 409);
      const count = (await db.get('SELECT COUNT(*) AS n FROM barbers WHERE company_id=?', [cid])).n;
      assert.equal((await link('second', null, pid)).status, 200);
      assert.equal((await link('pending', pid, null)).status, 200);
      assert.equal(
        (await req('/professional/agenda', { user: 'pending' })).data.professional.id,
        pid,
      );
      assert.equal((await req('/professional/agenda/' + 'staff-browser-complete')).status, 409);
      assert.equal((await link('pending', null, pid)).status, 200);
      assert.equal((await link('second', pid, null)).status, 200);
      assert.equal(
        (await db.get('SELECT COUNT(*) AS n FROM barbers WHERE company_id=?', [cid])).n,
        count,
      );
      assert.ok(
        (
          await db.all('SELECT * FROM professional_activity_events WHERE company_id=?', [cid])
        ).every((e) => e.actor_user_id === 'staff-browser-owner'),
      );
    },
  );
  await t.test(
    'link confirmation, stale snapshot, occupied professional and concurrent owners are transactional and unique',
    async () => {
      assert.equal(
        (
          await req('/admin/team/members/staff-browser-second/professional', {
            user: 'owner',
            method: 'PATCH',
            body: { professionalId: null, expectedProfessionalId: pid },
          })
        ).status,
        400,
      );
      assert.equal((await link('second', null, null)).status, 409);
      assert.equal((await link('pending', pid, null, { user: 'primary' })).status, 403);
      const p1 = cid + '-p1';
      assert.equal((await link('primary', null, p1)).status, 200);
      const results = await Promise.all([
        link('primary', p1, null),
        link('pending', p1, null, { instance: 1 }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const linked = await db.get(
        'SELECT user_id FROM professional_users WHERE company_id=? AND barber_id=?',
        [cid, p1],
      );
      if (linked.user_id === 'staff-browser-pending') {
        await link('pending', null, p1);
        await link('primary', p1, null);
      }
      assert.equal((await link('primary', pid, p1)).status, 409);
      assert.equal(
        Number(
          (
            await db.get(
              'SELECT COUNT(*) AS n FROM professional_users WHERE company_id=? AND barber_id=?',
              [cid, p1],
            )
          ).n,
        ),
        1,
      );
      await assert.rejects(
        db.run(
          "INSERT INTO professional_activity_events(id,company_id,actor_user_id,affected_user_id,barber_id,action,created_at) VALUES('invalid-ref',?,'staff-browser-owner','staff-browser-second','staff-browser-b-p1','linked','2026')",
          [cid],
        ),
      );
    },
  );
  await t.test(
    'legacy professional CRUD has no manager backdoor for links; explicit replacement confirmation and audit',
    async () => {
      const fields = {
        name: 'Maria Profissional',
        specialty: 'Atendimento',
        services: [cid + '-service'],
        userId: null,
      };
      assert.equal(
        (await req('/admin/professionals/' + pid, { user: 'owner', method: 'PUT', body: fields }))
          .status,
        400,
      );
      assert.equal(
        (
          await db.get(
            'SELECT user_id FROM professional_users WHERE company_id=? AND barber_id=?',
            [cid, pid],
          )
        ).user_id,
        'staff-browser-second',
      );
      assert.equal(
        (
          await req('/admin/professionals/' + pid, {
            user: 'owner',
            method: 'PUT',
            body: { ...fields, confirmLink: true, expectedUserId: 'staff-browser-second' },
          })
        ).status,
        200,
      );
      assert.equal((await link('second', pid, null)).status, 200);
      const other = 'staff-browser-b';
      assert.equal(
        (
          await req('/admin/professionals/' + other + '-p1', {
            user: 'primary',
            company: other,
            method: 'PUT',
            body: {
              name: 'Outro',
              specialty: '',
              services: [other + '-service'],
              userId: 'staff-browser-primary',
            },
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    'one account has independent professional, manager and owner roles; Individual and Equipe remain enforced',
    async () => {
      assert.equal((await req('/professional/agenda', { user: 'primary' })).status, 200);
      for (const company of ['staff-browser-b', 'staff-browser-individual']) {
        assert.equal((await req('/professional/agenda', { user: 'primary', company })).status, 403);
        assert.equal((await req('/admin/agenda', { user: 'primary', company })).status, 200);
      }
      assert.equal((await req('/professional/agenda', { user: 'owner' })).status, 403);
      assert.equal((await req('/admin/agenda', { user: 'primary' })).status, 403);
    },
  );
  await t.test(
    'hours reuse professional shifts, business intersection and breaks; blocks and enabled services have no monetary fields',
    async () => {
      const before = await db.all(
        'SELECT * FROM barber_working_hours WHERE company_id=? AND barber_id=? ORDER BY weekday',
        [cid, pid],
      );
      await db.run('UPDATE company_settings SET working_days_json=? WHERE company_id=?', [
        JSON.stringify(
          Array.from({ length: 7 }, (_, weekday) => ({
            weekday,
            active: weekday !== 0,
            start_time: '10:00',
            end_time: '17:00',
            breaks: [{ start_time: '13:00', end_time: '14:30' }],
          })),
        ),
        cid,
      ]);
      const r = await req('/professional/hours');
      assert.equal(r.status, 200);
      assert.equal(r.data.hours.effective[0].active, false);
      assert.equal(r.data.hours.effective[1].start_time, '10:00');
      assert.deepEqual(r.data.hours.effective[1].breaks, [
        { start_time: '12:20', end_time: '14:30' },
      ]);
      assert.equal(r.data.hours.days[1].start_time, '09:00');
      assert.equal(r.data.hours.services[0].duration, 40);
      assert.equal(JSON.stringify(r.data).includes('price'), false);
      assert.equal((await req('/professional/hours?professionalId=' + pid)).status, 400);
      assert.deepEqual(
        await db.all(
          'SELECT * FROM barber_working_hours WHERE company_id=? AND barber_id=? ORDER BY weekday',
          [cid, pid],
        ),
        before,
      );
      await db.run('UPDATE company_settings SET working_days_json=NULL WHERE company_id=?', [cid]);
    },
  );
  await t.test(
    'only own confirmed finished attendance can complete; forged status, stale state, foreign ID and future completion rejected',
    async () => {
      const d = await detail();
      assert.equal(d.item.canComplete, true);
      assert.equal('notes' in d.expected, false);
      assert.equal(
        (
          await req('/professional/agenda/staff-browser-complete/complete', {
            method: 'PATCH',
            body: { status: 'cancelled', expected: d.expected },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/professional/agenda/staff-browser-complete/complete', {
            user: 'primary',
            method: 'PATCH',
            body: { expected: d.expected },
          })
        ).status,
        404,
      );
      assert.equal((await complete('staff-browser-next')).status, 400);
      assert.equal(
        (
          await req('/professional/agenda/staff-browser-complete/complete', {
            method: 'PATCH',
            body: { expected: { ...d.expected, status: 'cancelled' } },
          })
        ).status,
        409,
      );
      const r = await complete('staff-browser-complete', { key: 'own-completion-original' });
      assert.equal(r.status, 200);
      const replay = await req('/professional/agenda/staff-browser-complete/complete', {
        method: 'PATCH',
        key: 'own-completion-original',
        body: { expected: d.expected },
      });
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.data, r.data);
      const event = await db.get(
        "SELECT * FROM professional_activity_events WHERE appointment_id='staff-browser-complete'",
      );
      assert.equal(event.actor_user_id, 'staff-browser-second');
      assert.equal(event.action, 'completed');
      assert.deepEqual(await db.all('SELECT * FROM financial_payments ORDER BY id'), finances);
    },
  );
  const makePast = async (id) => {
    await db.run(
      "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES(?,?,?, ?,540,580,4500,'confirmed','Cliente da Operação','2026')",
      [id, cid, pid, addDays(dateInTimezone(new Date()), -2)],
    );
  };
  await t.test(
    'failed event rolls back completion and persistent key; retry succeeds without duplicated completion or payment',
    async () => {
      const id = 'staff-rollback';
      await makePast(id);
      const expected = (await detail(id)).expected;
      fail = true;
      assert.equal(
        (
          await req('/professional/agenda/' + id + '/complete', {
            method: 'PATCH',
            body: { expected },
            key: 'rollback-professional-key',
            instance: 2,
          })
        ).status,
        500,
      );
      assert.equal(
        (await db.get('SELECT status FROM appointments WHERE id=?', [id])).status,
        'confirmed',
      );
      assert.equal(
        await db.get('SELECT id FROM professional_activity_events WHERE appointment_id=?', [id]),
        undefined,
      );
      assert.equal((await complete(id, { key: 'rollback-professional-key' })).status, 200);
      assert.deepEqual(await db.all('SELECT * FROM financial_payments ORDER BY id'), finances);
    },
  );
  await t.test(
    'concurrent completion across connections and lost response retry create exactly one audited state transition',
    async () => {
      const id = 'staff-concurrent';
      await makePast(id);
      const expected = (await detail(id)).expected,
        body = { expected };
      const responses = await Promise.all([
        req('/professional/agenda/' + id + '/complete', {
          method: 'PATCH',
          body,
          key: 'concurrent-professional-key',
        }),
        req('/professional/agenda/' + id + '/complete', {
          method: 'PATCH',
          body,
          key: 'concurrent-professional-key',
          instance: 1,
        }),
      ]);
      assert.deepEqual(
        responses.map((r) => r.status),
        [200, 200],
      );
      assert.equal(
        Number(
          (
            await db.get(
              'SELECT COUNT(*) AS n FROM professional_activity_events WHERE appointment_id=?',
              [id],
            )
          ).n,
        ),
        1,
      );
      assert.equal(
        (
          await req('/professional/agenda/' + id + '/complete', {
            method: 'PATCH',
            body,
            key: 'different-terminal-key',
          })
        ).status,
        200,
      );
      assert.equal(
        Number(
          (
            await db.get(
              'SELECT COUNT(*) AS n FROM professional_activity_events WHERE appointment_id=?',
              [id],
            )
          ).n,
        ),
        1,
      );
    },
  );
  await t.test(
    'relink and completion serialize; a waiting old session cannot complete after its link was removed',
    async () => {
      const id = 'staff-waiting';
      await makePast(id);
      const expected = (await detail(id)).expected;
      let release, entered;
      const ready = new Promise((r) => (entered = r)),
        barrier = new Promise((r) => (release = r));
      const change = db.transaction(async (tx) => {
        await lockProfessionalAccess(tx, cid);
        await setProfessionalLink(tx, cid, 'staff-browser-owner', 'staff-browser-second', null, {
          expected: pid,
          confirm: true,
        });
        entered();
        await barrier;
      });
      await ready;
      let finished = false;
      const waiting = req('/professional/agenda/' + id + '/complete', {
        method: 'PATCH',
        body: { expected },
        instance: 1,
      }).then((r) => {
        finished = true;
        return r;
      });
      try {
        await new Promise((r) => setTimeout(r, 40));
        assert.equal(finished, false);
      } finally {
        release();
      }
      await change;
      assert.equal((await waiting).status, 409);
      assert.equal(
        (await db.get('SELECT status FROM appointments WHERE id=?', [id])).status,
        'confirmed',
      );
      await link('second', pid, null);
    },
  );
  await t.test(
    'deactivation denies data and mutations; revocation defeats old JWT without deleting account, profile or other memberships',
    async () => {
      await db.run('UPDATE barbers SET active=0 WHERE company_id=? AND id=?', [cid, pid]);
      const r = await req('/professional/agenda');
      assert.equal(r.status, 200);
      assert.equal(r.data.linkState, 'inactive');
      assert.deepEqual(r.data.items, []);
      assert.equal(r.data.professional, null);
      assert.equal((await req('/professional/agenda/staff-browser-complete')).status, 409);
      await db.run('UPDATE barbers SET active=1 WHERE company_id=? AND id=?', [cid, pid]);
      const count = await db.get('SELECT COUNT(*) AS n FROM appointments WHERE company_id=?', [
        cid,
      ]);
      const response = await req('/admin/team/members/staff-browser-primary/revoke', {
        user: 'owner',
        method: 'POST',
        body: { expectedRole: 'professional', expectedStatus: 'active', confirm: true },
      });
      assert.equal(response.status, 200);
      assert.equal((await req('/professional/agenda', { user: 'primary' })).status, 403);
      assert.equal(
        (await req('/admin/agenda', { user: 'primary', company: 'staff-browser-b' })).status,
        200,
      );
      assert.ok(await db.get("SELECT id FROM users WHERE id='staff-browser-primary'"));
      assert.ok(
        await db.get('SELECT user_id FROM professional_users WHERE company_id=? AND barber_id=?', [
          cid,
          cid + '-p1',
        ]),
      );
      assert.equal((await link('primary', null, cid + '-p1')).status, 200);
      assert.equal(
        await db.get('SELECT user_id FROM professional_users WHERE company_id=? AND barber_id=?', [
          cid,
          cid + '-p1',
        ]),
        undefined,
      );
      assert.deepEqual(
        await db.get('SELECT COUNT(*) AS n FROM appointments WHERE company_id=?', [cid]),
        count,
      );
    },
  );
  await t.test(
    'expired subscription is read-only and no idempotent replay bypasses current entitlements; legacy Igor remains untouched',
    async () => {
      const before = await db.get('SELECT * FROM subscriptions WHERE company_id=?', [cid]);
      await db.run("UPDATE subscriptions SET status='expired' WHERE company_id=?", [cid]);
      const r = await req('/professional/agenda');
      assert.equal(r.status, 200);
      assert.equal(r.data.editable, false);
      assert.ok(r.data.items.length);
      assert.equal((await complete('staff-waiting')).status, 409);
      await db.run(
        "UPDATE subscriptions SET status='trialing',trial_started_at=?,trial_ends_at=? WHERE company_id=?",
        [
          new Date(Date.now() - 8 * 86400000).toISOString(),
          new Date(Date.now() - 86400000).toISOString(),
          cid,
        ],
      );
      assert.equal((await req('/professional/agenda')).data.editable, false);
      assert.equal((await complete('staff-waiting')).status, 409);
      await db.run(
        'UPDATE subscriptions SET trial_started_at=?,trial_ends_at=? WHERE company_id=?',
        [
          new Date(Date.now() - 3600000).toISOString(),
          new Date(Date.now() + 6 * 86400000).toISOString(),
          cid,
        ],
      );
      assert.equal((await req('/professional/agenda')).data.editable, true);
      await db.run(
        'UPDATE subscriptions SET status=?,trial_started_at=?,trial_ends_at=? WHERE company_id=?',
        [before.status, before.trial_started_at, before.trial_ends_at, cid],
      );
      assert.deepEqual(await db.all('SELECT * FROM plans ORDER BY id'), plans);
      assert.deepEqual(
        await db.all(
          'SELECT * FROM appointment_services WHERE company_id=? ORDER BY appointment_id,service_id',
          [cid],
        ),
        snapshot,
      );
      assert.equal((await req('/services', { company: null, user: null })).status, 200);
    },
  );
  await t.test(
    'company wall date and completion boundary remain correct around midnight in Manaus for both database adapters',
    async (ct) => {
      const c = 'staff-clock',
        p = 'staff-clock-professional';
      await db.run(
        "INSERT INTO companies(id,name,slug,niche_id,template_id,timezone,created_at,updated_at) VALUES(?,? ,?,'barbershop','barber-classic','America/Manaus','2026','2026')",
        [c, c, c],
      );
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'staff-browser-primary','professional','2026')",
        [c],
      );
      await db.run(
        "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,'individual','active','manual','2026','2026')",
        [c, c],
      );
      await db.run(
        "INSERT INTO barbers(id,company_id,name,specialty) VALUES(?,?,'Profissional do Relógio','')",
        [p, c],
      );
      await db.run(
        "INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES(?,?,'staff-browser-primary','2026')",
        [c, p],
      );
      await db.run(
        "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES('staff-midnight',?,?,'2026-10-13',1430,1440,0,'confirmed','Cliente de Meia-noite','2026')",
        [c, p],
      );
      ct.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-14T03:30:00Z') });
      const clockDb = {
        ...db,
        transaction: (fn, options) =>
          db.transaction(
            (tx) =>
              fn({
                ...tx,
                get: (sql, args) =>
                  sql === 'SELECT clock_timestamp() AS now'
                    ? Promise.resolve({ now: new Date() })
                    : tx.get(sql, args),
              }),
            options,
          ),
      };
      const s = createApp(clockDb, { secret, test: true, serveStatic: false }).listen(
        0,
        '127.0.0.1',
      );
      servers.push(s);
      await once(s, 'listening');
      const opts = { user: 'primary', company: c, instance: 3 };
      const r = await req('/professional/agenda', opts);
      assert.equal(r.status, 200);
      assert.equal(r.data.today, '2026-10-13');
      assert.equal(r.data.next.id, 'staff-midnight');
      assert.equal(r.data.items[0].canComplete, false);
      const d = await detail('staff-midnight', opts);
      assert.equal(
        (
          await req('/professional/agenda/staff-midnight/complete', {
            ...opts,
            method: 'PATCH',
            body: { expected: d.expected },
          })
        ).status,
        400,
      );
    },
  );
}
