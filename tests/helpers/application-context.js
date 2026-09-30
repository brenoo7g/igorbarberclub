import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';
import { seed, seedLegacyCompany } from '../../server/seed.js';
import { seedPortfolio } from '../../server/portfolio-seed.js';
import { getLegacyCompanyId } from '../../server/company-context.js';
import { getCompanyMetrics } from '../../server/company-metrics.js';
import { readSchedule } from '../../server/schedule.js';
import { ownsAppointment } from '../../server/guest-session.js';
import { enqueueNotification, createNotificationProcessor } from '../../server/notifications.js';
import { addDays, dateInBrazil, weekday, calculateMetrics } from '../../server/domain.js';
import { ownedTables } from '../../server/data-ownership.js';

export const otherCompany = 'context-test-company';
export const secondCompanySql = `INSERT INTO companies (id,slug,name,niche_id,template_id,created_at,updated_at) VALUES ('${otherCompany}','context-test-company','Somente fixture','barbershop','barber-classic','2026','2026')`;

// Caller must provision an isolated DB and insert the second company ONLY in that fixture.
// No connections or environment-derived URLs are created by this contract suite.
export async function assertApplicationContext(t, db) {
  const companyId = getLegacyCompanyId();
  // Deterministic legacy fixture, independent of DEMO_MODE (disabled by PG runner).
  for (const [id, email, role] of [
    ['context-admin', 'context-admin@example.com', 'admin'],
    ['context-client', 'cliente@example.com', 'client'],
  ])
    await db.run(
      'INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
      [id, 'Conta de Teste', email, '21999999999', 'fixture-no-password-login', role, '2026'],
    );
  await seed(db);
  const today = dateInBrazil();
  for (const [id, serviceId, price, bookingDate] of [
    ['metric-a1', 'corte', 3500, today],
    ['metric-a2', 'corte', 3500, today],
    ['metric-a3', 'barba', 2500, addDays(today, -1)],
  ]) {
    await db.run(
      "INSERT INTO appointments(company_id,id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at) VALUES(?,?,'context-client','igor',?,540,580,?,'completed','2026')",
      [companyId, id, bookingDate, price],
    );
    await db.run(
      'INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,?,?,40)',
      [companyId, id, serviceId, 'Serviço histórico', price],
    );
  }
  let date = addDays(today, 20);
  while (weekday(date) === 0) date = addDays(date, 1);
  const start =
    `${today.slice(0, 4)}-01-01` < addDays(today, -29)
      ? `${today.slice(0, 4)}-01-01`
      : addDays(today, -29);
  // Exact pre-2B queries, executed BEFORE foreign operational rows exist.
  const oldMetrics = calculateMetrics(
    await db.all('SELECT * FROM appointments WHERE date>=? AND date<=?', [start, today]),
    await db.all(
      'SELECT s.* FROM appointment_services s JOIN appointments a ON a.id=s.appointment_id WHERE a.date>=? AND a.date<=?',
      [addDays(today, -29), today],
    ),
    today,
  );
  assert.ok(oldMetrics.yearly > 0);
  const user = await db.get("SELECT * FROM users WHERE role='admin'");
  const secret = 'disposable-context-test-secret-32-characters';
  const admin = `session=${jwt.sign({ version: user.session_version || 0 }, secret, { subject: user.id, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  const server = createApp(db, { secret, test: true, serveStatic: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(path, method = 'GET', data, cookie = admin) {
    const res = await fetch(`${origin}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-Company-Id': otherCompany },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = res.headers.get('content-type')?.includes('application/json')
      ? await res.json()
      : await res.text();
    return { status: res.status, body, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const availabilityPath = `/availability?barberId=igor&services=corte&date=${date}`;
  const availabilityBefore = (await request(availabilityPath)).body;
  const payload = { services: ['corte'], barberId: 'igor', date, time: '09:00' };
  const guest = {
    name: 'Cliente Visitante',
    email: 'guest-context@example.com',
    phone: '21999999999',
  };
  const foreignToken = 'b'.repeat(64);
  const foreignCookie = `igor-visitor=${foreignToken}`;
  const image = (
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#222' } })
      .webp()
      .toBuffer()
  ).toString('base64');
  await db.run('INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,?,?,?)', [
    otherCompany,
    'foreign-barber',
    'Profissional B',
    'B',
  ]);
  await db.run(
    'INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,?,?,?,?,?)',
    [otherCompany, 'foreign-service', 'Serviço B', 'B', 40, 999999, 'Cabelo'],
  );
  await db.run(
    'INSERT INTO portfolio(company_id,id,title,category,image,version,created_at) VALUES(?,?,?,?,?,?,?)',
    [otherCompany, 'foreign-photo', 'Foto B', 'Cabelo', image, 1, '2026'],
  );
  await db.run(
    "INSERT INTO barber_settings(company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES(?,?,'manual',10,3)",
    [otherCompany, 'foreign-barber'],
  );
  await db.run(
    "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time,break_start,break_end) VALUES(?,?,?,1,'10:00','18:00','12:00','13:00')",
    [otherCompany, 'foreign-barber', weekday(date)],
  );
  await db.run(
    "INSERT INTO barber_working_breaks(company_id,barber_id,weekday,position,start_time,end_time) VALUES(?,?,?,1,'15:00','15:30')",
    [otherCompany, 'foreign-barber', weekday(date)],
  );
  await db.run(
    'INSERT INTO released_weeks(company_id,barber_id,week_start,start_date,end_date,created_at) VALUES(?,?,?,?,?,?)',
    [otherCompany, 'foreign-barber', date, date, date, '2026'],
  );
  await db.run(
    'INSERT INTO guest_sessions(company_id,id,token_hash,name,email,phone,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
    [
      otherCompany,
      'foreign-visitor',
      createHash('sha256').update(foreignToken).digest('hex'),
      guest.name,
      guest.email,
      guest.phone,
      '2026',
      '2099-01-01',
    ],
  );
  for (const [id, status, bookingDate, owner] of [
    ['foreign-booking', 'confirmed', date, user.id],
    ['foreign-completed', 'completed', today, user.id],
    ['foreign-guest', 'confirmed', date, null],
  ]) {
    await db.run(
      'INSERT INTO appointments(company_id,id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at,guest_name,guest_email,guest_phone) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        otherCompany,
        id,
        owner,
        'foreign-barber',
        bookingDate,
        540,
        580,
        999999,
        status,
        '2026',
        owner ? null : guest.name,
        owner ? null : guest.email,
        owner ? null : guest.phone,
      ],
    );
    await db.run(
      'INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,?,?,?,?,?)',
      [otherCompany, id, 'foreign-service', 'Serviço B', 999999, 40],
    );
  }
  await db.run(
    'INSERT INTO guest_appointments(company_id,appointment_id,visitor_id) VALUES(?,?,?)',
    [otherCompany, 'foreign-guest', 'foreign-visitor'],
  );
  await db.run(
    'INSERT INTO blocks(company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES(?,?,?,?,?,?,?)',
    [otherCompany, 'foreign-block', 'foreign-barber', date, 540, 1080, 'B'],
  );
  await enqueueNotification(db, otherCompany, 'foreign-guest', 'confirmed');
  const foreignSnapshot = async () => {
    const result = {};
    for (const table of ownedTables)
      result[table] = (await db.all(`SELECT * FROM ${table} WHERE company_id=?`, [otherCompany]))
        .map((r) => JSON.stringify(r))
        .sort();
    return result;
  };
  const before = await foreignSnapshot();

  await t.test(
    'public lists, images, schedule, availability and ID lookups hide company B',
    async () => {
      for (const path of ['/services', '/barbers', '/portfolio']) {
        const res = await request(`${path}?company_id=${otherCompany}`, 'GET', undefined, '');
        assert.equal(res.status, 200);
        assert.ok(!res.body.some((r) => r.id.startsWith('foreign-')));
      }
      for (const path of [
        '/portfolio/foreign-photo/image',
        '/barbers/foreign-barber/schedule',
        '/admin/barbers/foreign-barber/schedule',
      ])
        assert.equal((await request(path)).status, 404, path);
      await assert.rejects(readSchedule(db, companyId, 'foreign-barber'), { status: 404 });
      assert.equal((await readSchedule(db, otherCompany, 'foreign-barber')).settings.version, 3);
      assert.deepEqual((await request(availabilityPath)).body, availabilityBefore);
      assert.equal(
        (await request(availabilityPath.replace('barberId=igor', 'barberId=foreign-barber')))
          .status,
        404,
      );
      assert.equal(
        (await request(availabilityPath.replace('services=corte', 'services=foreign-service')))
          .status,
        400,
      );
      assert.deepEqual(
        (await request(`${availabilityPath}&except=foreign-booking`)).body,
        availabilityBefore,
      );
    },
  );
  await t.test(
    'foreign references cannot create bookings, blocks, schedules or weekly releases',
    async () => {
      for (const path of ['/appointments', '/appointments/guest']) {
        const data = path.endsWith('guest') ? { ...payload, guest } : payload;
        assert.equal(
          (await request(path, 'POST', { ...data, barberId: 'foreign-barber' })).status,
          404,
        );
        assert.equal(
          (await request(path, 'POST', { ...data, services: ['foreign-service'] })).status,
          400,
        );
      }
      assert.equal(
        (
          await request('/admin/blocks', 'POST', {
            barberId: 'foreign-barber',
            date,
            start: '09:00',
            end: '10:00',
            reason: 'Intervalo',
          })
        ).status,
        404,
      );
      const schedule = await readSchedule(db, companyId, 'igor');
      assert.equal(
        (
          await request('/admin/barbers/foreign-barber/schedule', 'PUT', {
            ...schedule.settings,
            days: schedule.days,
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request('/admin/barbers/foreign-barber/released-weeks', 'POST', {
            week_start: date,
            version: 3,
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    'authenticated and admin history, rescheduling, cancellation and status stay scoped even for same user',
    async () => {
      for (const path of [
        '/appointments',
        `/admin/appointments?from=${today}&to=${date}`,
        `/admin/blocks?from=${date}&to=${date}`,
      ]) {
        const res = await request(path);
        assert.equal(res.status, 200);
        assert.ok(!res.body.some((r) => r.id.startsWith('foreign-')));
      }
      assert.equal(
        (await request('/appointments/foreign-booking/reschedule', 'PATCH', payload)).status,
        404,
      );
      assert.equal(
        (await request('/appointments/foreign-booking/cancel', 'PATCH', {})).status,
        404,
      );
      assert.equal(
        (
          await request('/admin/appointments/foreign-booking/status', 'PATCH', {
            status: 'cancelled',
          })
        ).status,
        404,
      );
      const appointment = await db.get('SELECT * FROM appointments WHERE id=?', [
        'foreign-booking',
      ]);
      assert.equal(await ownsAppointment(db, companyId, { user }, appointment), false);
    },
  );
  await t.test(
    'foreign service, portfolio version and block cannot be updated or deleted',
    async () => {
      assert.equal(
        (
          await request('/admin/services/foreign-service', 'PUT', {
            name: 'Alterado',
            description: '',
            duration: 40,
            price: 100,
            category: 'Cabelo',
          })
        ).status,
        404,
      );
      assert.equal((await request('/admin/services/foreign-service', 'DELETE')).status, 404);
      assert.equal(
        (
          await request('/admin/portfolio/foreign-photo', 'PUT', {
            title: 'Alterada',
            category: 'Cabelo',
            version: 1,
          })
        ).status,
        404,
      );
      // Existing DELETE contracts are idempotent (200 for missing resources).
      assert.equal((await request('/admin/portfolio/foreign-photo', 'DELETE')).status, 200);
      assert.equal((await request('/admin/blocks/foreign-block', 'DELETE')).status, 200);
    },
  );
  await t.test(
    'financial output equals the exact legacy calculation with nonzero revenue; foreign revenue is excluded',
    async () => {
      assert.deepEqual(await getCompanyMetrics(db, companyId, today), oldMetrics);
      assert.deepEqual((await request('/admin/metrics')).body, oldMetrics);
      assert.equal((await getCompanyMetrics(db, otherCompany, today)).daily, 999999);
      t.diagnostic(
        `Igor legacy/scoped equality: yearly=${oldMetrics.yearly}; visits=${oldMetrics.visits}; averageTicket=${oldMetrics.averageTicket}`,
      );
    },
  );
  await t.test(
    'visitor token requires company; foreign logout cannot revoke B; booking rotates foreign token',
    async () => {
      assert.equal((await request('/auth/me', 'GET', undefined, foreignCookie)).body.visitor, null);
      assert.equal((await request('/appointments', 'GET', undefined, foreignCookie)).status, 401);
      assert.equal(
        (await request('/appointments/foreign-guest/cancel', 'PATCH', {}, foreignCookie)).status,
        401,
      );
      assert.equal((await request('/auth/logout', 'POST', {}, foreignCookie)).status, 200);
      const result = await request(
        '/appointments/guest',
        'POST',
        { ...payload, guest },
        foreignCookie,
      );
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(result.body.company_id, companyId);
      assert.notEqual(result.cookie, foreignCookie);
      const visitor = await db.get('SELECT * FROM guest_sessions WHERE id=?', [
        result.body.visitor.id,
      ]);
      assert.equal(visitor.company_id, companyId);
      assert.notEqual(visitor.token_hash, createHash('sha256').update(foreignToken).digest('hex'));
      const history = await request('/appointments', 'GET', undefined, result.cookie);
      assert.deepEqual(
        history.body.map((r) => r.id),
        [result.body.id],
      );
      assert.equal(
        (await request('/appointments/foreign-guest/reschedule', 'PATCH', payload, result.cookie))
          .status,
        404,
      );
      assert.equal(
        (await request(`/appointments/${result.body.id}/cancel`, 'PATCH', {}, result.cookie))
          .status,
        200,
      );
    },
  );
  await t.test(
    'Igor inserts, updates, soft/hard deletes and booking snapshots retain company context',
    async () => {
      const service = {
        name: 'Novo Serviço',
        description: 'Teste',
        duration: 40,
        price: 1000,
        category: 'Cabelo',
      };
      const created = await request('/admin/services', 'POST', {
        ...service,
        company_id: otherCompany,
      });
      assert.equal(created.status, 201);
      assert.equal(
        (await db.get('SELECT company_id FROM services WHERE id=?', [created.body.id])).company_id,
        companyId,
      );
      assert.equal(
        (await request(`/admin/services/${created.body.id}`, 'PUT', { ...service, price: 2000 }))
          .status,
        200,
      );
      const booking = await request('/appointments', 'POST', payload);
      assert.equal(booking.status, 201, JSON.stringify(booking.body));
      assert.equal(booking.body.company_id, companyId);
      assert.ok(booking.body.services.every((r) => r.company_id === companyId));
      assert.equal(
        (
          await request(`/appointments/${booking.body.id}/reschedule`, 'PATCH', {
            ...payload,
            time: '09:40',
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/admin/appointments/${booking.body.id}/status`, 'PATCH', {
            status: 'cancelled',
          })
        ).status,
        200,
      );
      assert.equal((await request(`/admin/services/${created.body.id}`, 'DELETE')).status, 200);
      const photo = await request('/admin/portfolio', 'POST', {
        title: 'Nova Foto',
        category: 'Cabelo',
        image: `data:image/webp;base64,${image}`,
      });
      assert.equal(photo.status, 201);
      assert.equal(
        (await db.get('SELECT company_id FROM portfolio WHERE id=?', [photo.body.id])).company_id,
        companyId,
      );
      assert.equal(
        (
          await request(`/admin/portfolio/${photo.body.id}`, 'PUT', {
            title: 'Foto Atualizada',
            category: 'Cabelo',
            version: 1,
          })
        ).status,
        200,
      );
      assert.equal((await request(`/admin/portfolio/${photo.body.id}`, 'DELETE')).status, 200);
      const block = await request('/admin/blocks', 'POST', {
        barberId: 'igor',
        date,
        start: '10:20',
        end: '11:00',
        reason: 'Teste',
      });
      assert.equal(block.status, 201);
      assert.equal(
        (await db.get('SELECT company_id FROM blocks WHERE id=?', [block.body.id])).company_id,
        companyId,
      );
      assert.equal((await request(`/admin/blocks/${block.body.id}`, 'DELETE')).status, 200);
      const schedule = await readSchedule(db, companyId, 'igor');
      assert.equal(
        (
          await request('/admin/barbers/igor/schedule', 'PUT', {
            ...schedule.settings,
            agenda_mode: 'manual',
            days: schedule.days,
          })
        ).status,
        200,
      );
      const saved = await request('/admin/barbers/igor/schedule');
      assert.equal(
        (
          await request('/admin/barbers/igor/released-weeks', 'POST', {
            week_start: saved.body.next_week.week_start,
            version: saved.body.settings.version,
          })
        ).status,
        200,
      );
      for (const table of ['barber_settings', 'barber_working_hours', 'released_weeks'])
        assert.ok(
          (await db.all(`SELECT company_id FROM ${table} WHERE barber_id='igor'`)).every(
            (r) => r.company_id === companyId,
          ),
        );
    },
  );
  await t.test(
    'notifications: enqueue validates company, aggregation and worker only process Igor',
    async (t) => {
      await assert.rejects(enqueueNotification(db, companyId, 'foreign-guest', 'confirmed'), {
        status: 404,
      });
      const expected = await db.all(
        'SELECT channel,status,COUNT(*) AS count FROM notifications WHERE company_id=? GROUP BY channel,status',
        [companyId],
      );
      const normalizeCounts = (rows) =>
        rows
          .map((row) => ({ ...row, count: Number(row.count) }))
          .sort((a, b) => `${a.channel}:${a.status}`.localeCompare(`${b.channel}:${b.status}`));
      assert.deepEqual(
        normalizeCounts((await request('/admin/notifications')).body),
        normalizeCounts(expected),
      );
      const keys = ['RESEND_API_KEY', 'EMAIL_FROM', 'TWILIO_CONTENT_SID'];
      const previous = keys.map((key) => process.env[key]);
      process.env.RESEND_API_KEY = 'test-no-real-provider';
      process.env.EMAIL_FROM = 'test@example.com';
      delete process.env.TWILIO_CONTENT_SID;
      t.after(() =>
        keys.forEach((key, i) =>
          previous[i] === undefined ? delete process.env[key] : (process.env[key] = previous[i]),
        ),
      );
      const sent = [];
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        sent.push(options.headers['Idempotency-Key']);
        return new Response('{}', { status: 202 });
      });
      await createNotificationProcessor(db, companyId, { batchSize: 100 })();
      assert.ok(sent.length > 0);
      for (const id of sent)
        assert.equal(
          (await db.get('SELECT company_id FROM notifications WHERE id=?', [id])).company_id,
          companyId,
        );
      assert.ok(
        (await db.all('SELECT status FROM notifications WHERE company_id=?', [otherCompany])).every(
          (r) => r.status === 'pending',
        ),
      );
    },
  );
  await t.test(
    'required context, legacy-only seeds and complete preservation of all thirteen foreign tables',
    async () => {
      await assert.rejects(readSchedule(db, undefined, 'igor'), /contexto empresarial/);
      await assert.rejects(getCompanyMetrics(db, undefined, today), /contexto empresarial/);
      assert.throws(() => createNotificationProcessor(db, undefined), /contexto empresarial/);
      await assert.rejects(
        enqueueNotification(db, undefined, 'foreign-booking', 'confirmed'),
        /contexto empresarial/,
      );
      await assert.rejects(seedLegacyCompany(db, otherCompany), /empresa legada/);
      await assert.rejects(seedPortfolio(db, otherCompany), /empresa legada/);
      await seed(db);
      await db.transaction((tx) => seedPortfolio(tx, companyId));
      assert.deepEqual(await foreignSnapshot(), before);
    },
  );
}
