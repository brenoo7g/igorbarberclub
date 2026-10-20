import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { addDays, dateInBrazil } from '../../server/domain.js';
import { installProfessionalBrowserFixture } from './professional-browser.js';
import { lockBarbers } from '../../server/scheduling-locks.js';
import { lockProfessionalAccess } from '../../server/professional-links.js';
import { reconstructBeforeProfessionalAvailability } from './professional-availability-migration.js';
import { runMigrations } from '../../server/migrations.js';

export async function assertProfessionalAvailabilityMigration(t, db) {
  const journal = await db.all('SELECT * FROM schema_migrations WHERE version<19 ORDER BY version');
  const legacy = await db.all('SELECT * FROM blocks ORDER BY id');
  await reconstructBeforeProfessionalAvailability(db);
  await db.run(
    "INSERT INTO idempotency_keys(company_id,actor_hash,operation,key_hash,request_hash,response,created_at,expires_at) VALUES('igor-barber-club',?,'block',?,?,'{}','2026-01-01','2027-01-01')",
    ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)],
  );
  const keys = await db.all('SELECT * FROM idempotency_keys ORDER BY company_id,actor_hash');
  await assert.rejects(
    runMigrations({
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            ...tx,
            run(sql, args) {
              if (sql.includes('CREATE TABLE professional_personal_blocks'))
                throw Error('injected 019 failure');
              return tx.run(sql, args);
            },
          }),
        ),
    }),
    /injected 019 failure/,
  );
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=19'), undefined);
  await assert.rejects(db.all('SELECT * FROM professional_personal_blocks'));
  assert.deepEqual(
    await db.all('SELECT * FROM idempotency_keys ORDER BY company_id,actor_hash'),
    keys,
  );
  assert.deepEqual(await runMigrations(db), [19, 20, 21]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<19 ORDER BY version'),
    journal,
  );
  assert.deepEqual(
    await db.all('SELECT * FROM idempotency_keys ORDER BY company_id,actor_hash'),
    keys,
  );
  assert.deepEqual(await db.all('SELECT * FROM blocks ORDER BY id'), legacy);
  for (const args of [
    [null, 'missing', 'missing'],
    ['igor-barber-club', null, 'missing'],
    ['igor-barber-club', 'missing', null],
    ['igor-barber-club', 'missing', 'missing'],
  ])
    await assert.rejects(
      db.run(
        'INSERT INTO professional_personal_blocks(company_id,block_id,user_id) VALUES(?,?,?)',
        args,
      ),
    );
  t.diagnostic(
    '019 preserves legacy rows/keys and 001–018 checksums; transactional rollback, repeat and mandatory FKs validated',
  );
}

export async function assertProfessionalAvailability(t, db, second = db) {
  await seed(db);
  await installProfessionalBrowserFixture(db, 'test-only-hash');
  const cid = 'staff-browser-a',
    pid = cid + '-p2',
    secret = 'own-availability-test-only-signing-key';
  let fail = false;
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run(sql, args) {
              if (fail && sql.startsWith('INSERT INTO barber_working_hours')) {
                fail = false;
                throw Error('injected own schedule failure');
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
      invitationEmail: { configured: () => false },
      notificationAdapters: { email: async () => false, whatsapp: async () => false },
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));
  const cookie = (user) =>
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: 'staff-browser-' + user,
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  async function req(
    path,
    { user = 'second', company = cid, method = 'GET', body, key, instance = 0 } = {},
  ) {
    const r = await fetch('http://127.0.0.1:' + servers[instance].address().port + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(user ? { Cookie: cookie(user) } : {}),
        ...(company ? { 'X-Gradefy-Company-Id': company } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, data: await r.json() };
  }
  const get = async (opts) => (await req('/professional/availability', opts)).data;
  const payload = async (patch = {}, opts) => {
    const s = await get(opts);
    return {
      version: s.settings.version,
      operational_version: s.policies.version,
      agenda_mode: s.settings.agenda_mode,
      days: s.days,
      ...patch,
    };
  };
  const put = async (body, opts = {}) =>
    req('/professional/availability', { method: 'PUT', body, ...opts });
  const stamps = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const igor = await db.all(
    "SELECT * FROM barber_working_hours WHERE company_id='igor-barber-club' ORDER BY barber_id,weekday",
  );
  const bookings = await db.all('SELECT * FROM appointments ORDER BY id');
  const relations = await db.all(
    'SELECT * FROM appointment_services ORDER BY appointment_id,service_id',
  );
  let newId, invited;
  await t.test(
    'new professional invitation creates an inactive linked draft and yields the company-specific setup path, including accepted replay',
    async () => {
      await db.run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('staff-browser-new','Novo Profissional','new-setup@example.test','','test','client','2026')",
      );
      const r = await req('/admin/team/invitations', {
        user: 'owner',
        method: 'POST',
        body: {
          email: 'new-setup@example.test',
          role: 'professional',
          professional: { mode: 'new' },
        },
      });
      assert.equal(r.status, 201);
      invited = new URLSearchParams(new URL(r.data.link).hash.slice(1)).get('token');
      const accepted = await req('/team/invitations/accept', {
        user: 'new',
        method: 'POST',
        body: { token: invited },
      });
      assert.equal(accepted.status, 200);
      newId = accepted.data.professionalId;
      assert.equal(accepted.data.nextPath, '/app/minha-agenda/configurar?empresa=' + cid);
      assert.deepEqual(
        (
          await req('/team/invitations/accept', {
            user: 'new',
            method: 'POST',
            body: { token: invited },
          })
        ).data,
        accepted.data,
      );
      const s = await get({ user: 'new' });
      assert.equal(s.professional.id, newId);
      assert.equal(s.professional.active, 0);
      assert.equal(s.status.configured, false);
      assert.equal(s.editable, true);
      assert.ok(s.days.every((d) => !d.active));
    },
  );
  await t.test(
    'existing configured professional invite goes straight to agenda without replacing hours, appointments or blocks',
    async () => {
      await db.run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('staff-browser-existing','Existente','existing-setup@example.test','','test','client','2026')",
      );
      const c = 'staff-browser-b',
        p = c + '-p1';
      const before = await db.all(
        'SELECT * FROM barber_working_hours WHERE company_id=? AND barber_id=? ORDER BY weekday',
        [c, p],
      );
      const r = await req('/admin/team/invitations', {
        user: 'owner',
        company: c,
        method: 'POST',
        body: {
          email: 'existing-setup@example.test',
          role: 'professional',
          professional: { mode: 'existing', professionalId: p },
        },
      });
      assert.equal(r.status, 201);
      const token = new URLSearchParams(new URL(r.data.link).hash.slice(1)).get('token');
      const a = await req('/team/invitations/accept', {
        user: 'existing',
        company: c,
        method: 'POST',
        body: { token },
      });
      assert.equal(a.status, 200);
      assert.equal(a.data.nextPath, '/app/minha-agenda?empresa=' + c);
      assert.deepEqual(
        await db.all(
          'SELECT * FROM barber_working_hours WHERE company_id=? AND barber_id=? ORDER BY weekday',
          [c, p],
        ),
        before,
      );
    },
  );
  await t.test(
    'manager invitation has no personal setup redirect and cannot use own-availability endpoint',
    async () => {
      await db.run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('staff-browser-manager','Gestão','manager-setup@example.test','','test','client','2026')",
      );
      const r = await req('/admin/team/invitations', {
        user: 'owner',
        method: 'POST',
        body: { email: 'manager-setup@example.test', role: 'manager' },
      });
      const token = new URLSearchParams(new URL(r.data.link).hash.slice(1)).get('token');
      const a = await req('/team/invitations/accept', {
        user: 'manager',
        method: 'POST',
        body: { token },
      });
      assert.equal(a.status, 200);
      assert.equal(a.data.nextPath, undefined);
      assert.equal((await req('/professional/availability', { user: 'manager' })).status, 403);
    },
  );
  await t.test(
    'authentication, company ownership, role and strict payload reject guessed professionals and administrative changes',
    async () => {
      assert.equal((await req('/professional/availability', { user: null })).status, 401);
      assert.equal((await req('/professional/availability', { company: null })).status, 409);
      assert.equal((await req('/professional/availability', { user: 'outsider' })).status, 403);
      assert.equal(
        (await req('/professional/availability', { company: 'staff-browser-b' })).status,
        403,
      );
      assert.equal((await req('/professional/availability', { user: 'pending' })).status, 409);
      assert.equal((await req('/professional/availability?professionalId=' + pid)).status, 400);
      const body = await payload();
      for (const patch of [
        { professionalId: cid + '-p1' },
        { companyId: 'staff-browser-b' },
        { active: true },
        { max_days_ahead: 900 },
      ])
        assert.equal((await put({ ...body, ...patch })).status, 400);
      for (const path of [
        '/admin/settings',
        '/admin/team',
        '/admin/finance',
        '/admin/reports',
        '/admin/professionals',
      ])
        assert.equal((await req(path)).status, 403);
    },
  );
  const companyDays = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    active: weekday !== 0,
    start_time: '08:00',
    end_time: '20:00',
    breaks: [{ start_time: '12:20', end_time: '14:00' }],
  }));
  const draftDays = companyDays.map((d) => ({
    ...d,
    start_time: '09:00',
    end_time: '18:00',
    breaks: [{ start_time: '15:00', end_time: '15:20' }],
  }));
  await t.test(
    'company general working days and version are exposed without business prices or other professionals',
    async () => {
      await db.run(
        'UPDATE company_settings SET working_days_json=?,maximum_booking_days=21,operational_version=operational_version+1 WHERE company_id=?',
        [JSON.stringify(companyDays), cid],
      );
      const s = await get({ user: 'new' });
      assert.deepEqual(s.policies.working_days, companyDays);
      assert.equal(s.policies.maximum_booking_days, 21);
      const str = JSON.stringify(s);
      for (const value of ['price', 'totalCents', 'staff-browser-a-p1', 'email', 'guest_'])
        assert.equal(str.includes(value), false, value);
    },
  );
  await t.test(
    'reject closed business day, out-of-hours range, invalid pauses, all days off and duplicate weekdays',
    async () => {
      const base = await payload({ days: draftDays, agenda_mode: 'auto' }, { user: 'new' });
      for (const days of [
        draftDays.map((d) => (d.weekday === 0 ? { ...d, active: true } : d)),
        draftDays.map((d) => ({ ...d, start_time: '07:00' })),
        draftDays.map((d) => ({ ...d, end_time: '21:00' })),
        draftDays.map((d) => ({ ...d, breaks: [{ start_time: '17:00', end_time: '19:00' }] })),
        draftDays.map((d) => ({
          ...d,
          breaks: [
            { start_time: '10:00', end_time: '11:00' },
            { start_time: '10:30', end_time: '11:30' },
          ],
        })),
        draftDays.map((d) => ({ ...d, active: false })),
        draftDays.map((d) => ({ ...d, weekday: 1 })),
      ])
        assert.equal((await put({ ...base, days }, { user: 'new' })).status, 400);
      assert.equal((await get({ user: 'new' })).settings.version, 0);
    },
  );
  await t.test(
    'inactive draft can save valid days and personal pauses atomically, without activation, service assignment or a new subscription',
    async () => {
      const subscriptions = await db.all('SELECT * FROM subscriptions ORDER BY id');
      const s = await put(
        await payload({ days: draftDays, agenda_mode: 'auto' }, { user: 'new' }),
        { user: 'new', key: 'initial-own-config' },
      );
      assert.equal(s.status, 200);
      assert.equal(s.data.status.configured, true);
      assert.equal(s.data.status.state, 'waiting');
      assert.equal((await get({ user: 'new' })).professional.active, 0);
      assert.equal(
        Number(
          (await db.get('SELECT COUNT(*) AS n FROM barber_services WHERE barber_id=?', [newId])).n,
        ),
        0,
      );
      assert.deepEqual(await db.all('SELECT * FROM subscriptions ORDER BY id'), subscriptions);
      assert.equal(
        (await req('/professional/agenda', { user: 'new' })).data.availability.configured,
        true,
      );
    },
  );
  await t.test(
    'repeating after simulated lost response uses the persistent key without adding rows or incrementing version',
    async () => {
      const before = await get({ user: 'new' });
      const body = {
        version: 0,
        operational_version: before.policies.version,
        agenda_mode: 'auto',
        days: draftDays,
      };
      const r = await put(body, { user: 'new', key: 'initial-own-config' });
      assert.equal(r.status, 200);
      assert.equal((await get({ user: 'new' })).settings.version, 1);
      assert.equal(
        (await put({ ...body, agenda_mode: 'manual' }, { user: 'new', key: 'initial-own-config' }))
          .status,
        409,
      );
    },
  );
  await t.test('company policy version conflict prevents saving from a stale screen', async () => {
    const body = await payload({}, { user: 'new' });
    await db.run(
      'UPDATE company_settings SET operational_version=operational_version+1 WHERE company_id=?',
      [cid],
    );
    const r = await put(body, { user: 'new' });
    assert.equal(r.status, 409);
    assert.equal(r.data.code, 'COMPANY_HOURS_CHANGED');
  });
  await t.test(
    'concurrent same key has one write across connections; different keys with stale version do not overwrite',
    async () => {
      const body = await payload({}, { user: 'new' });
      const results = await Promise.all([
        put(body, { user: 'new', key: 'parallel-own-save' }),
        put(body, { user: 'new', key: 'parallel-own-save', instance: 1 }),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        [200, 200],
      );
      assert.deepEqual(results[0].data, results[1].data);
      assert.equal((await get({ user: 'new' })).settings.version, body.version + 1);
      const next = await payload({}, { user: 'new' });
      const differing = await Promise.all([
        put(next, { user: 'new', key: 'parallel-version-a' }),
        put(next, { user: 'new', key: 'parallel-version-b', instance: 1 }),
      ]);
      assert.deepEqual(differing.map((r) => r.status).sort(), [200, 409]);
    },
  );
  await t.test(
    'mid-save failure rolls back all hours, settings and key; same-key retry can succeed',
    async () => {
      const before = await get({ user: 'new' }),
        body = await payload({}, { user: 'new' });
      fail = true;
      assert.equal(
        (await put(body, { user: 'new', key: 'rollback-own-save', instance: 2 })).status,
        500,
      );
      assert.deepEqual(await get({ user: 'new' }), before);
      assert.equal((await put(body, { user: 'new', key: 'rollback-own-save' })).status, 200);
    },
  );
  await t.test(
    'future confirmed appointments prevent removing a day, narrowing shift, or adding an overlapping pause',
    async () => {
      await db.run('UPDATE company_settings SET working_days_json=NULL WHERE company_id=?', [cid]);
      const s = await get();
      for (const days of [
        s.days.map((d) => ({ ...d, active: false })),
        s.days.map((d) => ({ ...d, start_time: '12:00', breaks: [] })),
        s.days.map((d) => ({ ...d, breaks: [{ start_time: '10:50', end_time: '12:00' }] })),
      ]) {
        const r = await put(await payload({ days }));
        assert.ok([400, 409].includes(r.status));
      }
      assert.deepEqual(await db.all('SELECT * FROM appointments ORDER BY id'), bookings);
      assert.deepEqual(
        await db.all('SELECT * FROM appointment_services ORDER BY appointment_id,service_id'),
        relations,
      );
    },
  );
  await t.test(
    'existing manual mode and released periods are preserved until the professional explicitly opts into recurrence',
    async () => {
      await db.run(
        "INSERT INTO barber_settings(company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES(?,?,'manual',14,0) ON CONFLICT(barber_id) DO UPDATE SET agenda_mode='manual'",
        [cid, pid],
      );
      const before = await db.all(
        'SELECT * FROM released_weeks WHERE company_id=? AND barber_id=?',
        [cid, pid],
      );
      assert.equal((await put(await payload())).status, 200);
      assert.equal((await get()).settings.agenda_mode, 'manual');
      assert.deepEqual(
        await db.all('SELECT * FROM released_weeks WHERE company_id=? AND barber_id=?', [cid, pid]),
        before,
      );
      const r = await put(await payload({ agenda_mode: 'auto' }));
      assert.equal(r.status, 200);
      assert.equal((await get()).settings.max_days_ahead, 14);
    },
  );
  await t.test(
    'recurring availability uses original slot engine, company horizon, personal/company pauses, folgas and existing blocks',
    async () => {
      await db.run('UPDATE companies SET site_published=1 WHERE id=?', [cid]);
      await db.run('UPDATE company_settings SET maximum_booking_days=21 WHERE company_id=?', [cid]);
      // Draft remains unbookable until owner assigns service and explicitly activates.
      const pub = '/public/' + cid;
      assert.equal(
        (await req(pub + '/barbers/' + newId + '/schedule', { company: null, user: null })).status,
        404,
      );
      await db.run(
        'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
        [cid, newId, cid + '-service', '2026'],
      );
      const activate = await req('/admin/professionals/' + newId + '/status', {
        user: 'owner',
        method: 'PATCH',
        body: { active: true },
      });
      assert.equal(activate.status, 200);
      const date = addDays(dateInBrazil(), 2),
        day = new Date(date + 'T12:00Z').getUTCDay();
      const s = await get({ user: 'new' });
      const days = s.days.map((d) => ({
        ...d,
        active: d.weekday === day,
        breaks: [{ start_time: '12:20', end_time: '14:00' }],
      }));
      assert.equal(
        (await put(await payload({ days, agenda_mode: 'auto' }, { user: 'new' }), { user: 'new' }))
          .status,
        200,
      );
      const block = { date, start: '14:00', end: '14:40' };
      assert.equal(
        (
          await req('/professional/blocks', {
            user: 'new',
            method: 'POST',
            body: block,
            key: 'block-recurrence',
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await req('/professional/blocks', {
            user: 'new',
            method: 'POST',
            body: block,
            key: 'block-recurrence',
            instance: 1,
          })
        ).status,
        201,
      );
      const calendar = await req(pub + '/barbers/' + newId + '/schedule', {
        company: null,
        user: null,
      });
      assert.equal(calendar.status, 200);
      assert.equal(calendar.data.mode, 'auto');
      assert.ok(calendar.data.dates.length > 1);
      assert.ok(calendar.data.dates.every((d) => new Date(d + 'T12:00Z').getUTCDay() === day));
      assert.ok(calendar.data.dates.every((d) => d <= addDays(dateInBrazil(), 21)));
      const slots = await req(
        pub + '/availability?date=' + date + '&barberId=' + newId + '&services=' + cid + '-service',
        { company: null, user: null },
      );
      assert.equal(slots.status, 200);
      assert.ok(slots.data.slots.includes('11:40'));
      assert.equal(slots.data.slots.includes('12:20'), false);
      assert.equal(slots.data.slots.includes('14:00'), false);
      assert.ok(slots.data.slots.includes('14:40'));
      const beyond = await req(
        pub +
          '/availability?date=' +
          addDays(dateInBrazil(), 30) +
          '&barberId=' +
          newId +
          '&services=' +
          cid +
          '-service',
        { company: null, user: null },
      );
      assert.equal(beyond.data.reason, 'booking-window');
      assert.equal(
        (
          await req('/professional/blocks', {
            user: 'new',
            method: 'POST',
            body: { ...block, barberId: pid },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/professional/blocks', {
            user: 'new',
            method: 'POST',
            body: block,
            key: 'conflicting-new-block',
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req('/professional/blocks', {
            user: 'new',
            method: 'POST',
            body: { ...block, start: '12:30', end: '13:00' },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/professional/blocks', {
            method: 'POST',
            body: { date: addDays(dateInBrazil(), 1), start: '11:00', end: '11:40' },
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    'Individual seat limit and invalid subscription cannot be bypassed with schedule editing or profile activation',
    async () => {
      const c = 'staff-browser-individual';
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'staff-browser-new','professional','2026')",
        [c],
      );
      const made = await req('/admin/professionals', {
        company: c,
        user: 'owner',
        method: 'POST',
        body: { name: 'Rascunho individual', services: [], active: false },
      });
      assert.equal(made.status, 201);
      await db.run(
        "INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES(?,?,'staff-browser-new','2026')",
        [c, made.data.id],
      );
      const r = await put(
        await payload({ days: draftDays, agenda_mode: 'auto' }, { company: c, user: 'new' }),
        { company: c, user: 'new' },
      );
      assert.equal(r.status, 200);
      const active = await req('/admin/professionals/' + made.data.id + '/status', {
        company: c,
        user: 'owner',
        method: 'PATCH',
        body: { active: true },
      });
      assert.equal(active.status, 409);
      assert.equal(active.data.code, 'PROFESSIONAL_LIMIT_REACHED');
      await db.run("UPDATE subscriptions SET status='expired' WHERE company_id=?", [c]);
      assert.equal((await get({ company: c, user: 'new' })).editable, false);
      assert.equal(
        (await put(await payload({}, { company: c, user: 'new' }), { company: c, user: 'new' }))
          .status,
        409,
      );
    },
  );
  await t.test(
    'personal block provenance prevents removing management/other-user blocks and allows own removal with cascading metadata',
    async () => {
      const saved = (await get({ user: 'new' })).blocks;
      assert.equal(saved.length, 1);
      assert.equal(
        (await req('/professional/blocks/' + saved[0].id, { method: 'DELETE' })).status,
        404,
      );
      await db.run(
        "INSERT INTO blocks(company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES(?,'management-only',?,?,540,580,'Gestão')",
        [cid, newId, addDays(dateInBrazil(), 4)],
      );
      assert.equal(
        (await req('/professional/blocks/management-only', { user: 'new', method: 'DELETE' }))
          .status,
        404,
      );
      assert.equal(
        (await req('/professional/blocks/' + saved[0].id, { user: 'new', method: 'DELETE' }))
          .status,
        200,
      );
      assert.equal((await get({ user: 'new' })).blocks.length, 0);
      assert.equal(
        await db.get('SELECT block_id FROM professional_personal_blocks WHERE block_id=?', [
          saved[0].id,
        ]),
        undefined,
      );
      assert.ok(await db.get("SELECT id FROM blocks WHERE id='management-only'"));
      await db.run("DELETE FROM blocks WHERE id='management-only'");
      await assert.rejects(
        db.run(
          "INSERT INTO professional_personal_blocks(company_id,block_id,user_id) VALUES('staff-browser-b','missing','staff-browser-new')",
        ),
      );
    },
  );
  await t.test(
    'owner/manager sees readiness and pending services or activation without automatic activation',
    async () => {
      const list = await req('/admin/professionals', { user: 'owner' });
      assert.equal(list.status, 200);
      assert.equal(list.data.find((p) => p.id === newId).availability.state, 'ready');
      const waiting = await req('/admin/professionals', {
        user: 'owner',
        company: 'staff-browser-individual',
      });
      assert.ok(
        waiting.data.some(
          (p) => p.active === 0 && p.availability.configured && p.availability.state === 'waiting',
        ),
      );
    },
  );
  await t.test(
    'booking and schedule updates share the barber lock; waiting editor detects newly confirmed reservation',
    async () => {
      let entered, release;
      const ready = new Promise((r) => (entered = r)),
        barrier = new Promise((r) => (release = r));
      const date = addDays(dateInBrazil(), 3),
        body = await payload({
          days: (await get()).days.map((d) => ({ ...d, end_time: '17:00' })),
        });
      const insert = db.transaction(async (tx) => {
        await lockBarbers(tx, cid, pid);
        await tx.run(
          "INSERT INTO appointments(id,company_id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES('own-lock-booking',?,?,?,1050,1080,0,'confirmed','Lock Test','2026')",
          [cid, pid, date],
        );
        entered();
        await barrier;
      });
      await ready;
      let finished = false;
      const pending = put(body, { instance: 1 }).then((r) => {
        finished = true;
        return r;
      });
      try {
        await new Promise((r) => setTimeout(r, 40));
        assert.equal(finished, false);
      } finally {
        release();
      }
      await insert;
      assert.equal((await pending).status, 409);
      await db.run("DELETE FROM appointments WHERE id='own-lock-booking'");
    },
  );
  await t.test(
    'revoking the link serializes with personal schedule writes; old JWT cannot edit after membership revocation',
    async () => {
      let entered, release;
      const ready = new Promise((r) => (entered = r)),
        barrier = new Promise((r) => (release = r));
      const body = await payload({}, { user: 'new' });
      const revoke = db.transaction(async (tx) => {
        await lockProfessionalAccess(tx, cid);
        await tx.run(
          "UPDATE company_members SET status='inactive' WHERE company_id=? AND user_id='staff-browser-new'",
          [cid],
        );
        entered();
        await barrier;
      });
      await ready;
      const pending = put(body, { user: 'new', instance: 1 });
      release();
      await revoke;
      assert.equal((await pending).status, 403);
      assert.equal((await req('/services', { user: null, company: null })).status, 200);
      assert.deepEqual(
        await db.all(
          "SELECT * FROM barber_working_hours WHERE company_id='igor-barber-club' ORDER BY barber_id,weekday",
        ),
        igor,
      );
      assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), stamps);
      assert.deepEqual(await db.all('SELECT * FROM appointments ORDER BY id'), bookings);
    },
  );
}
