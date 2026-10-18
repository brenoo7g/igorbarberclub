import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { currentTime } from '../../server/entitlements.js';
import {
  addDays,
  dateInTimezone,
  weekday,
  localInstant,
  availableSlots,
} from '../../server/domain.js';
import { readMigration, migrations, runMigrations } from '../../server/migrations.js';
import {
  reconstructBeforeOperationalSettings,
  operationalColumns,
} from './operational-settings-migration.js';
import { lockOperational } from '../../server/operational-settings.js';

export async function assertSettingsMigration(t, db) {
  const original = await db.all('SELECT * FROM company_settings ORDER BY company_id');
  const oldJournal = await db.all(
    'SELECT * FROM schema_migrations WHERE version<16 ORDER BY version',
  );
  await reconstructBeforeOperationalSettings(db);
  const broken = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('ALTER TABLE company_settings ADD COLUMN buffer_minutes'))
              throw new Error('injected settings migration failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(broken), /injected settings migration failure/);
  for (const column of operationalColumns)
    await assert.rejects(db.all('SELECT ' + column + ' FROM company_settings'));
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=16'), undefined);
  assert.deepEqual(await runMigrations(db), [16, 17, 18, 19, 20]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(await db.all('SELECT * FROM company_settings ORDER BY company_id'), original);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<16 ORDER BY version'),
    oldJournal,
  );
  assert.equal(
    (await db.get('SELECT checksum FROM schema_migrations WHERE version=16')).checksum,
    readMigration(migrations[15]).checksum,
  );
  for (const [column, value] of [
    ['buffer_minutes', -1],
    ['minimum_notice_minutes', 1.5],
    ['maximum_booking_days', 100],
    ['cancel_notice_minutes', null],
    ['reschedule_notice_minutes', -1],
    ['online_booking_enabled', 2],
    ['operational_version', 1.5],
  ])
    await assert.rejects(db.run('UPDATE company_settings SET ' + column + '=?', [value]));
  t.diagnostic('016 additive, rollback/repeat/defaults/integrity and immutable 001–015 passed');
}
export async function assertOperationalSettings(t, db, second = db) {
  await seed(db);
  const secret = 'settings-memory-fixture';
  for (const id of ['owner', 'manager', 'professional', 'outsider', 'customer'])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999999999','test','client','2026')",
      ['settings-' + id, id, id + '@settings.test'],
    );
  for (const cid of ['settings-a', 'settings-b']) {
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic','2026','2026')",
      [cid, cid, cid],
    );
    await db.run(
      "INSERT INTO company_settings(company_id,slogan,updated_at) VALUES(?,'Visual preserved','2026')",
      [cid],
    );
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,?,'active','manual','2026','2026')",
      [cid + '-sub', cid, cid === 'settings-a' ? 'individual' : 'team'],
    );
    await db.run(
      "INSERT INTO barbers(id,company_id,name,specialty) VALUES(?,?,'Profissional','')",
      [cid + '-pro', cid],
    );
    await db.run(
      "INSERT INTO services(id,company_id,name,description,duration,price,category) VALUES(?,?,'Corte','',40,3500,'Corte')",
      [cid + '-service', cid],
    );
    await db.run(
      "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,'2026')",
      [cid, cid + '-pro', cid + '-service'],
    );
    for (let d = 0; d < 7; d++)
      await db.run(
        "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time,break_start,break_end) VALUES(?,?,?,1,'08:00','20:00','12:20','14:00')",
        [cid, cid + '-pro', d],
      );
    for (const role of ['owner', 'manager', 'professional'])
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,'2026')",
        [cid, 'settings-' + role, role],
      );
  }
  const preserved = {};
  for (const table of [
    'plans',
    'subscriptions',
    'financial_payments',
    'financial_expenses',
    'company_invitations',
  ])
    preserved[table] = await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2');
  let fail = false;
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (fail && sql.startsWith('UPDATE company_settings SET phone=')) {
                fail = false;
                throw Object.assign(new Error('injected settings failure'), { status: 503 });
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((connection) =>
    createApp(connection, {
      test: true,
      secret,
      serveStatic: false,
      siteStorage: null,
      invitationEmail: { configured: () => false },
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const server of servers) await new Promise((done) => server.close(done));
  });
  async function req(
    path,
    { cid = 'settings-a', user = 'owner', method = 'GET', body, instance = 0 } = {},
  ) {
    if (!path.startsWith('/admin') && !path.startsWith('/public/') && path !== '/companies')
      path = '/public/' + cid + path;
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Gradefy-Company-Id': cid,
          ...(user
            ? {
                Cookie:
                  'session=' +
                  jwt.sign({ version: 0 }, secret, {
                    subject: 'settings-' + user,
                    issuer: 'igor-barber-club',
                    audience: 'barber-web',
                  }),
              }
            : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, data: await response.json() };
  }
  const read = async (cid = 'settings-a') => (await req('/admin/settings', { cid })).data;
  const payload = (s, patch = {}) => {
    const { editable, timezoneLocked, professionals, ...fields } = s;
    return { ...fields, ...patch };
  };
  const save = async (patch, opts = {}) =>
    req('/admin/settings', { method: 'PUT', body: payload(await read(opts.cid), patch), ...opts });
  const now = await currentTime(db),
    today = dateInTimezone(now),
    date = addDays(today, 3);
  const availability = (day = date, opts = {}) =>
    req(`/availability?date=${day}&barberId=settings-a-pro&services=settings-a-service`, {
      user: null,
      ...opts,
    });
  const book = (day, time, opts = {}) =>
    req('/appointments', {
      user: 'customer',
      method: 'POST',
      body: { date: day, time, barberId: 'settings-a-pro', services: ['settings-a-service'] },
      ...opts,
    });

  await t.test(
    'owner/manager read and edit; professional, anonymous and outsider denied; Individual/Equipe are independent',
    async () => {
      assert.equal((await req('/admin/settings', { user: null })).status, 401);
      for (const user of ['professional', 'outsider'])
        assert.equal((await req('/admin/settings', { user })).status, 403);
      const defaults = await read();
      assert.equal(defaults.minimum_notice_minutes, 0);
      assert.equal(defaults.maximum_booking_days, null);
      assert.equal(defaults.online_booking_enabled, true);
      const result = await save(
        { name: 'Novo nome', phone: '(21) 99999-8888', address: 'Rua Um, 1' },
        { user: 'manager' },
      );
      assert.equal(result.status, 200);
      assert.equal(result.data.phone, '21999998888');
      assert.equal((await read('settings-b')).name, 'settings-b');
      assert.equal(
        (await db.get("SELECT slogan FROM company_settings WHERE company_id='settings-a'")).slogan,
        'Visual preserved',
      );
      assert.equal(
        (await req('/public/settings-a/site', { user: null })).data.company.name,
        'Novo nome',
      );
    },
  );
  await t.test(
    'validation, stale operational/site versions and transaction rollback preserve shared contacts',
    async () => {
      const original = await read();
      assert.equal(
        (
          await req('/admin/settings', {
            method: 'PUT',
            body: payload(original, { buffer_minutes: 1.5 }),
          })
        ).status,
        400,
      );
      fail = true;
      assert.equal(
        (
          await req('/admin/settings', {
            method: 'PUT',
            instance: 2,
            body: payload(original, { name: 'Should rollback' }),
          })
        ).status,
        503,
      );
      assert.equal((await read()).name, original.name);
      assert.equal((await save({ minimum_notice_minutes: 120 })).status, 200);
      assert.equal(
        (await req('/admin/settings', { method: 'PUT', body: payload(original) })).status,
        409,
      );
      const stale = await read();
      await db.run(
        "UPDATE company_settings SET site_version=site_version+1 WHERE company_id='settings-a'",
      );
      assert.equal(
        (await req('/admin/settings', { method: 'PUT', body: payload(stale) })).status,
        409,
      );
      assert.equal((await save({ minimum_notice_minutes: 0 })).status, 200);
    },
  );
  await t.test(
    'server minimum notice, month boundary and window filter consultation and confirmation',
    async () => {
      const before = await availability(today);
      await save({ minimum_notice_minutes: 1440, maximum_booking_days: 7 });
      assert.deepEqual((await availability(today)).data.slots, []);
      if (before.data.slots.length)
        assert.equal((await book(today, before.data.slots[0])).status, 409);
      assert.equal((await availability(addDays(today, 8))).data.reason, 'booking-window');
      assert.equal((await book(addDays(today, 8), '09:00')).status, 409);
      const calendar = await req('/barbers/settings-a-pro/schedule', { user: null });
      assert.ok(calendar.data.dates.every((d) => d <= addDays(today, 7)));
      await save({ minimum_notice_minutes: 0, maximum_booking_days: null });
    },
  );
  await t.test(
    'company hours intersect professional lunch, blocks and off days, and buffer packs actual gaps',
    async () => {
      const days = Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        active: true,
        start_time: '09:00',
        end_time: '18:00',
        breaks: [{ start_time: '15:00', end_time: '15:30' }],
      }));
      assert.equal((await save({ working_days: days, buffer_minutes: 10 })).status, 200);
      const slots = (await availability()).data.slots;
      assert.equal(slots[0], '09:00');
      assert.equal(slots[1], '09:50');
      assert.ok(!slots.includes('08:00'));
      assert.ok(!slots.includes('12:00'));
      assert.ok(slots.includes('14:00'));
      for (const time of slots) {
        const m = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
        assert.ok(m + 40 <= 1080);
        assert.ok(!(m < 840 && m + 40 > 740));
        assert.ok(!(m < 930 && m + 40 > 900));
      }
      await db.run(
        "INSERT INTO blocks(company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES('settings-a','policy-block','settings-a-pro',?,540,600,'Pausa')",
        [date],
      );
      assert.equal((await availability()).data.slots[0], '10:00');
      await db.run("DELETE FROM blocks WHERE company_id='settings-a'");
      const closed = days.map((d) => ({ ...d, active: d.weekday !== weekday(date) }));
      await save({ working_days: closed });
      assert.deepEqual((await availability()).data.slots, []);
      await save({ working_days: days });
    },
  );
  let appointment;
  await t.test(
    'concurrent bookings and changes after consultation are revalidated; existing reservations remain',
    async () => {
      const slot = (await availability()).data.slots[0];
      const pair = await Promise.all([book(date, slot), book(date, slot, { instance: 1 })]);
      assert.deepEqual(pair.map((r) => r.status).sort(), [201, 409]);
      appointment = pair.find((r) => r.status === 201).data;
      assert.equal(appointment.end_minute - appointment.start_minute, 40);
      const next = (await availability()).data.slots[0];
      assert.equal(next, '09:50');
      const original = await db.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
        'settings-a',
        appointment.id,
      ]);
      await save({
        working_days: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          active: false,
          start_time: '09:00',
          end_time: '18:00',
          breaks: [],
        })),
      });
      assert.equal((await book(date, next)).status, 409);
      assert.deepEqual(
        await db.get('SELECT * FROM appointments WHERE company_id=? AND id=?', [
          'settings-a',
          appointment.id,
        ]),
        original,
      );
      await save({ working_days: null, buffer_minutes: 0 });
    },
  );
  await t.test(
    'pause is live on published site/API but manual agenda remains operational; existing customer actions remain available',
    async () => {
      const prior = (await availability(addDays(date, 1))).data.slots[0];
      await save({ online_booking_enabled: false });
      assert.equal((await availability()).data.reason, 'online-paused');
      assert.equal((await book(addDays(date, 1), prior)).status, 409);
      const site = await req('/public/settings-a/site', { user: null });
      assert.equal(site.status, 200);
      assert.equal(site.data.settings.online_booking_enabled, false);
      const manual = await req(
        `/admin/agenda/availability?date=${date}&barberId=settings-a-pro&services=settings-a-service`,
      );
      assert.ok(manual.data.slots.length);
      const created = await req('/admin/agenda', {
        method: 'POST',
        body: {
          date,
          time: manual.data.slots[0],
          barberId: 'settings-a-pro',
          services: ['settings-a-service'],
          userId: 'settings-customer',
        },
      });
      assert.equal(created.status, 201);
      await save({ online_booking_enabled: true });
      assert.ok((await availability()).data.slots.length);
    },
  );
  await t.test(
    'customer cancellation/rescheduling deadlines enforced in query/write; administrative actions and finance are unchanged',
    async () => {
      await save({ cancel_notice_minutes: 10080, reschedule_notice_minutes: 10080 });
      assert.equal(
        (await req(`/appointments/${appointment.id}/cancel`, { method: 'PATCH', user: 'customer' }))
          .status,
        409,
      );
      const q = await req(
        `/availability?date=${date}&barberId=settings-a-pro&services=settings-a-service&except=${appointment.id}`,
        { user: 'customer' },
      );
      assert.equal(q.data.reason, 'reschedule-notice');
      assert.equal(
        (
          await req(`/appointments/${appointment.id}/reschedule`, {
            method: 'PATCH',
            user: 'customer',
            body: {
              date: addDays(date, 1),
              time: '08:00',
              barberId: 'settings-a-pro',
              services: ['settings-a-service'],
            },
          })
        ).status,
        409,
      );
      const detail = await req('/admin/agenda/' + appointment.id);
      assert.equal(
        (
          await req('/admin/agenda/' + appointment.id + '/status', {
            method: 'PATCH',
            body: { status: 'cancelled', expected: detail.data.expected },
          })
        ).status,
        200,
      );
      assert.equal(
        (await req('/appointments', { user: 'customer' })).data.find((a) => a.id === appointment.id)
          .status,
        'cancelled',
      );
    },
  );
  await t.test(
    'timezone editing is safe before first reservation and refuses reinterpretation of historical wall times',
    async () => {
      assert.equal(
        (await save({ timezone: 'America/Manaus' })).data.code,
        'TIMEZONE_HISTORY_LOCKED',
      );
      assert.equal((await save({ timezone: 'America/Manaus' }, { cid: 'settings-b' })).status, 200);
      assert.equal((await read('settings-a')).timezone, 'America/Sao_Paulo');
      assert.equal((await save({ timezone: 'bad/timezone' }, { cid: 'settings-b' })).status, 400);
      assert.equal(localInstant('2026-03-08', 150, 'America/New_York'), null);
      assert.equal(localInstant('2026-11-01', 90, 'America/New_York'), null);
      assert.equal(
        localInstant('2026-03-01', 0, 'America/Sao_Paulo').toISOString(),
        '2026-03-01T03:00:00.000Z',
      );
      assert.ok(
        availableSlots({
          date: '2026-11-01',
          duration: 40,
          now: new Date('2020-01-01'),
          timezone: 'America/New_York',
          workingDay: { active: true, start_time: '00:00', end_time: '04:00', breaks: [] },
        }).every((time) => !time.startsWith('01:')),
      );
    },
  );
  await t.test(
    'immutable financial records, prices, invitations, memberships and legacy policy defaults',
    async () => {
      for (const [table, rows] of Object.entries(preserved))
        assert.deepEqual(await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2'), rows);
      assert.equal(
        (
          await db.get(
            "SELECT online_booking_enabled FROM company_settings WHERE company_id='igor-barber-club'",
          )
        ).online_booking_enabled,
        1,
      );
      assert.equal((await req('/services', { user: null, cid: 'igor-barber-club' })).status, 200);
      assert.equal((await req('/admin/reports', { user: 'professional' })).status, 403);
    },
  );
  await t.test(
    'policy update and confirmation serialize across connections; buffer protects adjacent days at midnight',
    async () => {
      await save({ cancel_notice_minutes: 0, reschedule_notice_minutes: 0, buffer_minutes: 10 });
      const day = addDays(date, 5),
        slot = (await availability(day)).data.slots[0];
      let release, announce;
      const ready = new Promise((done) => {
          announce = done;
        }),
        barrier = new Promise((done) => {
          release = done;
        });
      const change = db.transaction(async (tx) => {
        await lockOperational(tx, 'settings-a');
        await tx.run(
          "UPDATE company_settings SET online_booking_enabled=0 WHERE company_id='settings-a'",
        );
        announce();
        await barrier;
      });
      await ready;
      const pending = book(day, slot, { instance: 1 });
      await new Promise((done) => setTimeout(done, 20));
      release();
      await change;
      assert.equal((await pending).status, 409);
      await save({ online_booking_enabled: true });
      const next = addDays(day, 1);
      await db.run(
        "UPDATE barber_working_hours SET start_time='00:00',end_time='23:59',break_start=NULL,break_end=NULL WHERE company_id='settings-a'",
      );
      await db.run(
        "INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,status,guest_name,created_at) VALUES('settings-a','midnight-buffer','settings-a-pro',?,1400,1430,3500,'confirmed','Teste','2026')",
        [day],
      );
      await save({ buffer_minutes: 30 });
      assert.equal((await availability(next)).data.slots[0], '00:20');
    },
  );
  await t.test(
    'valid trial permits edits, expired trial becomes read only, revoked membership denies the old session',
    async () => {
      const stamp = await currentTime(db);
      await db.run(
        "UPDATE subscriptions SET status='trialing',trial_started_at=?,trial_ends_at=? WHERE company_id='settings-b'",
        [
          new Date(stamp.getTime() - 60000).toISOString(),
          new Date(stamp.getTime() + 86400000).toISOString(),
        ],
      );
      assert.equal((await save({ minimum_notice_minutes: 30 }, { cid: 'settings-b' })).status, 200);
      await db.run(
        "UPDATE subscriptions SET trial_started_at='2000-01-01',trial_ends_at='2000-01-08' WHERE company_id='settings-b'",
      );
      assert.equal((await read('settings-b')).editable, false);
      assert.equal((await save({ minimum_notice_minutes: 0 }, { cid: 'settings-b' })).status, 409);
      await db.run(
        "UPDATE company_members SET status='inactive' WHERE company_id='settings-a' AND user_id='settings-manager'",
      );
      assert.equal((await req('/admin/settings', { user: 'manager' })).status, 403);
    },
  );
}
