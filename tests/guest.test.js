import { getLegacyCompanyId } from '../server/company-context.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { addDays, dateInBrazil, weekday, calculateMetrics } from '../server/domain.js';
import { appointmentEmail, createNotificationProcessor } from '../server/notifications.js';

test('guest migration preserves reservations, service snapshots, notifications, indexes and foreign keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'igor-guest-migration-'));
  const path = join(directory, 'test.db');
  let db;
  try {
    const old = new DatabaseSync(path);
    const schema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8')
      .replace('user_id TEXT REFERENCES', 'user_id TEXT NOT NULL REFERENCES')
      .replace('guest_name TEXT, guest_email TEXT, guest_phone TEXT,', '');
    old.exec(schema);
    old.exec(`
      INSERT INTO users (id,name,email,phone,password_hash,role,created_at) VALUES ('client','Cliente Antigo','old@example.com','21999999999','hash','client','2026-01-01');
      INSERT INTO barbers (id,name,specialty) VALUES ('barber','Barbeiro','Cortes');
      INSERT INTO services VALUES ('cut','Corte','Corte',40,3000,'Cabelo',1);
      INSERT INTO appointments VALUES ('booking','client','barber','2030-01-07',540,580,3000,'confirmed','2026-01-01');
      INSERT INTO appointment_services VALUES ('booking','cut','Corte',3000,40);
      INSERT INTO notifications (id,appointment_id,channel,event,payload,created_at,next_attempt_at) VALUES ('notification','booking','email','confirmed','{}','2026-01-01','2026-01-01');
      CREATE INDEX extra_booking_status ON appointments(status);
    `);
    old.close();
    for (let pass = 0; pass < 2; pass++) {
      db = await createDatabase('', path);
      assert.equal(
        (await db.get("SELECT * FROM appointments WHERE id='booking'")).user_id,
        'client',
      );
      assert.equal(
        (await db.get("SELECT * FROM appointment_services WHERE appointment_id='booking'")).price,
        3000,
      );
      assert.equal(
        (await db.get("SELECT * FROM notifications WHERE id='notification'")).appointment_id,
        'booking',
      );
      assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys, 1);
      assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
      assert.equal(
        (await db.all('PRAGMA table_info(appointments)')).find(
          (column) => column.name === 'user_id',
        ).notnull,
        0,
      );
      assert.ok(
        (await db.all('PRAGMA index_list(appointments)')).some(
          (index) => index.name === 'extra_booking_status',
        ),
      );
      await assert.rejects(db.run("UPDATE appointments SET user_id='missing' WHERE id='booking'"));
      await db.close();
      db = null;
    }
  } finally {
    if (db) await db.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'igor-guest-migration-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('guest bookings validate data, share schedule locks, send confirmation and never create or link accounts', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', data, cookie, headers = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const before = (await db.get('SELECT COUNT(*) AS count FROM users')).count;
  const accountBefore = await db.get("SELECT * FROM users WHERE email='cliente@example.com'");
  let date = addDays(dateInBrazil(), 60);
  if (weekday(date) === 0) date = addDays(date, 1);
  const payload = {
    services: ['combo'],
    barberId: 'igor',
    date,
    time: '09:00',
    expectedTotal: 5500,
    expectedDuration: 70,
    guest: { name: 'Visitante Sem Conta', email: 'CLIENTE@example.com', phone: '(21) 98888-7777' },
  };
  for (const guest of [
    { ...payload.guest, name: 'Nome' },
    { ...payload.guest, email: 'invalid' },
    { ...payload.guest, phone: '123' },
    { ...payload.guest, role: 'admin' },
  ])
    assert.equal((await request('/appointments/guest', 'POST', { ...payload, guest })).status, 400);
  for (const services of [[], ['corte', 'barba'], ['corte', 'corte']])
    assert.equal(
      (await request('/appointments/guest', 'POST', { ...payload, services })).status,
      400,
    );
  assert.equal(
    (await request('/appointments/guest', 'POST', { ...payload, user_id: accountBefore.id }))
      .status,
    400,
  );
  assert.equal(
    (
      await request('/appointments/guest', 'POST', payload, undefined, {
        Origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (await request('/appointments/guest', 'POST', { ...payload, expectedDuration: 40 })).status,
    412,
  );
  assert.equal(
    (await request('/appointments/guest', 'POST', { ...payload, expectedTotal: 1 })).status,
    412,
  );
  const race = await Promise.all([
    request('/appointments/guest', 'POST', payload),
    request('/appointments/guest', 'POST', payload),
  ]);
  assert.deepEqual(race.map((result) => result.status).sort(), [201, 409]);
  const result = race.find((result) => result.status === 201);
  const reservation = result.data;
  assert.match(result.cookie, /^igor-visitor=[a-f0-9]{64}$/);
  assert.equal(
    (await request('/auth/me', 'GET', undefined, result.cookie)).data.visitor.name,
    'Visitante Sem Conta',
  );
  assert.equal(reservation.user_id, null);
  assert.equal(reservation.client_name, 'Visitante Sem Conta');
  assert.equal(reservation.client_phone, '21988887777');
  assert.equal(reservation.total, 5500);
  assert.equal(reservation.end_minute, 610);
  assert.equal(reservation.services.length, 1);
  assert.equal((await request('/auth/me')).data.user, null);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM users')).count, before);
  assert.deepEqual(
    await db.get("SELECT * FROM users WHERE email='cliente@example.com'"),
    accountBefore,
  );
  assert.equal((await request('/appointments')).status, 401);
  assert.equal((await request(`/appointments/${reservation.id}/cancel`, 'PATCH', {})).status, 401);
  const client = await request('/auth/login', 'POST', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  assert.equal(
    (await request('/appointments', 'GET', undefined, client.cookie)).data.some(
      (a) => a.id === reservation.id,
    ),
    false,
  );
  assert.equal(
    (await request(`/appointments/${reservation.id}/cancel`, 'PATCH', {}, client.cookie)).status,
    404,
  );
  assert.equal(
    (await request(`/appointments/${reservation.id}/reschedule`, 'PATCH', payload, client.cookie))
      .status,
    404,
  );
  const available = await request(
    `/availability?date=${date}&barberId=igor&services=combo&except=${reservation.id}`,
  );
  assert.equal(available.data.slots.includes('09:00'), false);
  const admin = await request('/auth/login', 'POST', {
    email: 'admin@igorbarberclub.com.br',
    password: 'IgorDemo2026!',
  });
  const appointments = await request(
    `/admin/appointments?from=${date}&to=${date}`,
    'GET',
    undefined,
    admin.cookie,
  );
  assert.equal(
    appointments.data.find((a) => a.id === reservation.id).client_email,
    'cliente@example.com',
  );
  assert.equal(
    (
      await request(
        '/admin/blocks',
        'POST',
        { barberId: 'igor', date, start: '09:30', end: '10:00', reason: 'Intervalo' },
        admin.cookie,
      )
    ).status,
    409,
  );
  const jobs = await db.all('SELECT * FROM notifications WHERE appointment_id=?', [reservation.id]);
  assert.equal(jobs.length, 2);
  const snapshot = JSON.parse(jobs[0].payload);
  assert.equal(snapshot.guest, true);
  assert.equal(snapshot.email, 'cliente@example.com');
  assert.match(
    appointmentEmail(snapshot, 'confirmed', 'https://example.com/#contato').text,
    /entre em contato com a barbearia/,
  );
  assert.doesNotMatch(
    appointmentEmail(snapshot, 'confirmed', 'https://example.com/#contato').text,
    /entre na sua conta/,
  );

  // Exercise actual worker recipient lookup, without sending any real email.
  const previous = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    TWILIO_CONTENT_SID: process.env.TWILIO_CONTENT_SID,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  process.env.RESEND_API_KEY = 'test-never-sent';
  process.env.EMAIL_FROM = 'Test <test@example.com>';
  delete process.env.TWILIO_CONTENT_SID;
  const calls = [];
  const realFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://api.resend.com/emails') {
      calls.push(JSON.parse(options.body));
      return new Response('{}', { status: 200 });
    }
    return realFetch(url, options);
  });
  await createNotificationProcessor(db, getLegacyCompanyId())();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].to, ['cliente@example.com']);
  assert.match(calls[0].text, /Visitante Sem Conta/);
  assert.match(calls[0].text, /minha-conta/);
  assert.match(calls[0].text, /mesmo navegador/);
  assert.equal(
    (
      await request(
        `/admin/appointments/${reservation.id}/status`,
        'PATCH',
        { status: 'cancelled' },
        admin.cookie,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request(`/availability?date=${date}&barberId=igor&services=combo`)).data.slots[0],
    '09:00',
  );
});

test('financial metrics include guest revenue and distinct guest contacts', () => {
  const rows = [
    {
      id: '1',
      user_id: null,
      guest_email: 'one@example.com',
      date: '2030-01-07',
      total: 4000,
      status: 'completed',
    },
    {
      id: '2',
      user_id: null,
      guest_email: 'two@example.com',
      date: '2030-01-07',
      total: 3000,
      status: 'completed',
    },
    {
      id: '3',
      user_id: null,
      guest_email: 'one@example.com',
      date: '2030-01-07',
      total: 2000,
      status: 'completed',
    },
    { id: '4', user_id: 'account', date: '2030-01-07', total: 3000, status: 'completed' },
  ];
  const metrics = calculateMetrics(rows, [], '2030-01-07');
  assert.equal(metrics.clients, 3);
  assert.equal(metrics.daily, 12000);
  assert.equal(metrics.averageTicket, 3000);
});
