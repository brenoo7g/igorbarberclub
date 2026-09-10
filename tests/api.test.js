import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { addDays, dateInBrazil, weekday } from '../server/domain.js';

test('API: access control, concurrency, rescheduling, snapshots, blocks and notification outbox', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, {
    secret: 'test-secret-with-at-least-32-characters',
    test: true,
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', data, cookie) {
    const response = await fetch(`${origin}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      headers: response.headers,
    };
  }
  const adminLogin = await request('/auth/login', 'POST', {
    email: 'admin@igorbarberclub.com.br',
    password: 'IgorDemo2026!',
  });
  assert.equal(adminLogin.status, 200);
  const admin = adminLogin.cookie;
  assert.match(adminLogin.headers.get('set-cookie'), /HttpOnly/);
  assert.equal('password_hash' in adminLogin.data.user, false);
  const clientLogin = await request('/auth/register', 'POST', {
    name: 'Teste Cliente',
    email: 'teste@example.com',
    phone: '(21) 99999-1234',
    password: 'Teste12345!',
  });
  assert.equal(clientLogin.status, 201);
  const client = clientLogin.cookie;
  const other = await request('/auth/register', 'POST', {
    name: 'Outro Cliente',
    email: 'outro@example.com',
    phone: '(21) 99999-1235',
    password: 'Teste12345!',
  });
  assert.equal((await request('/admin/metrics')).status, 401);
  assert.equal((await request('/admin/metrics', 'GET', undefined, client)).status, 403);
  assert.equal((await request('/appointments', 'POST', {})).status, 401);
  const badOrigin = await fetch(`${origin}/api/auth/logout`, {
    method: 'POST',
    headers: { Origin: 'https://malicious.example' },
  });
  assert.equal(badOrigin.status, 403);
  const malformed = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(malformed.status, 400);

  let date = addDays(dateInBrazil(), 15);
  while (weekday(date) === 0) date = addDays(date, 1);
  const payload = {
    services: ['corte', 'barba'],
    barberId: 'igor',
    date,
    time: '09:00',
    expectedTotal: 6000,
    expectedDuration: 70,
  };
  const concurrent = await Promise.all([
    request('/appointments', 'POST', payload, client),
    request('/appointments', 'POST', payload, other.cookie),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  const created = concurrent.find((r) => r.status === 201).data;
  const owner = created.user_id === clientLogin.data.user.id ? client : other.cookie;
  const nonOwner = owner === client ? other.cookie : client;
  assert.equal(created.total, 6000);
  assert.equal(created.end_minute, 610);
  assert.equal(
    (await request(`/appointments/${created.id}/cancel`, 'PATCH', {}, nonOwner)).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/appointments/${created.id}/reschedule`,
        'PATCH',
        { ...payload, time: '11:00' },
        nonOwner,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request(
        `/admin/appointments/${created.id}/status`,
        'PATCH',
        { status: 'completed' },
        admin,
      )
    ).status,
    400,
  );
  const jobs = await db.all('SELECT * FROM notifications WHERE appointment_id=?', [created.id]);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((n) => n.status === 'pending'));
  const blocked = await request(
    '/admin/blocks',
    'POST',
    { barberId: 'igor', date, start: '10:00', end: '11:00', reason: 'Almoço' },
    admin,
  );
  assert.equal(blocked.status, 409);
  const block = await request(
    '/admin/blocks',
    'POST',
    { barberId: 'igor', date, start: '12:00', end: '13:00', reason: 'Almoço' },
    admin,
  );
  assert.equal(block.status, 201);
  assert.equal(
    (await request('/appointments', 'POST', { ...payload, time: '11:00' }, owner)).status,
    409,
  );
  const available = await request(`/availability?date=${date}&barberId=igor&services=corte,barba`);
  assert.equal(available.data.slots.includes('09:30'), false);
  assert.equal(available.data.slots.includes('13:00'), true);
  const rescheduled = await request(
    `/appointments/${created.id}/reschedule`,
    'PATCH',
    { ...payload, time: '14:10' },
    owner,
  );
  assert.equal(rescheduled.status, 200);
  assert.equal(rescheduled.data.time, '14:10');
  const freed = await request(`/availability?date=${date}&barberId=igor&services=corte,barba`);
  assert.equal(freed.data.slots.includes('09:00'), true);
  assert.equal(
    (await request('/appointments', 'POST', { ...payload, date: '2030-02-30' }, owner)).status,
    400,
  );
  assert.equal(
    (await request('/appointments', 'POST', { ...payload, services: ['corte', 'corte'] }, owner))
      .status,
    400,
  );
  assert.equal(
    (await request('/appointments', 'POST', { ...payload, expectedTotal: 1 }, owner)).status,
    412,
  );

  const newService = await request(
    '/admin/services',
    'POST',
    {
      name: 'Serviço de teste',
      description: 'Teste',
      duration: 30,
      price: 1999,
      category: 'Teste',
    },
    admin,
  );
  assert.equal(newService.status, 201);
  const newBooking = await request(
    '/appointments',
    'POST',
    { services: [newService.data.id], barberId: 'igor', date, time: '15:50' },
    owner,
  );
  assert.equal(newBooking.status, 201);
  await request(
    `/admin/services/${newService.data.id}`,
    'PUT',
    { name: 'Novo nome', description: 'Alterado', duration: 60, price: 9999, category: 'Teste' },
    admin,
  );
  await request(`/admin/services/${newService.data.id}`, 'DELETE', undefined, admin);
  const history = await request('/appointments', 'GET', undefined, owner);
  const snapshot = history.data.find((a) => a.id === newBooking.data.id);
  assert.equal(snapshot.total, 1999);
  assert.equal(snapshot.services[0].name, 'Serviço de teste');
  assert.equal(snapshot.services[0].duration, 30);
  assert.equal(
    (
      await request(
        '/appointments',
        'POST',
        { services: [newService.data.id], barberId: 'igor', date, time: '17:00' },
        owner,
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/appointments/${created.id}/cancel`, 'PATCH', {}, owner)).status,
    200,
  );
  assert.equal(
    (await request(`/appointments/${created.id}/cancel`, 'PATCH', {}, owner)).status,
    400,
  );
  assert.equal(
    (
      await db.get('SELECT COUNT(*) AS count FROM notifications WHERE appointment_id=?', [
        created.id,
      ])
    ).count,
    6,
  );
  assert.equal(
    (await request(`/admin/blocks/${block.data.id}`, 'DELETE', undefined, admin)).status,
    200,
  );

  // Updating duration through the admin API changes availability immediately, while
  // existing reservations keep their original duration and price snapshots.
  const adaptiveDate = addDays(date, 28);
  const catalog = (await request('/services')).data;
  const cut = catalog.find((service) => service.id === 'corte');
  const beard = catalog.find((service) => service.id === 'barba');
  assert.equal(
    (await request('/admin/services/corte', 'PUT', { ...cut, duration: 30 }, admin)).status,
    200,
  );
  const oldReservation = await request(
    '/appointments',
    'POST',
    { services: ['corte'], barberId: 'igor', date: adaptiveDate, time: '09:00' },
    client,
  );
  assert.equal(oldReservation.status, 201);
  assert.equal(oldReservation.data.end_minute, 570);
  assert.equal(
    (await request('/admin/services/corte', 'PUT', { ...cut, duration: 40 }, admin)).status,
    200,
  );
  let adaptive = await request(`/availability?date=${adaptiveDate}&barberId=igor&services=corte`);
  assert.equal(adaptive.data.duration, 40);
  assert.deepEqual(adaptive.data.slots.slice(0, 3), ['09:30', '10:10', '10:50']);
  assert.equal(
    (
      await request(
        '/appointments',
        'POST',
        {
          services: ['corte'],
          barberId: 'igor',
          date: adaptiveDate,
          time: '09:30',
          expectedDuration: 30,
        },
        client,
      )
    ).status,
    412,
  );
  assert.equal(
    (await request(`/appointments/${oldReservation.data.id}/cancel`, 'PATCH', {}, client)).status,
    200,
  );
  adaptive = await request(`/availability?date=${adaptiveDate}&barberId=igor&services=corte`);
  assert.deepEqual(adaptive.data.slots.slice(0, 3), ['09:00', '09:40', '10:20']);
  assert.equal(
    (
      await request(
        '/appointments',
        'POST',
        { services: ['corte'], barberId: 'igor', date: adaptiveDate, time: '09:30' },
        client,
      )
    ).status,
    409,
  );
  const forty = await request(
    '/appointments',
    'POST',
    {
      services: ['corte'],
      barberId: 'igor',
      date: adaptiveDate,
      time: '09:40',
      expectedDuration: 40,
    },
    client,
  );
  assert.equal(forty.status, 201);
  assert.equal(forty.data.end_minute, 620);
  adaptive = await request(`/availability?date=${adaptiveDate}&barberId=igor&services=corte`);
  assert.deepEqual(adaptive.data.slots.slice(0, 3), ['09:00', '10:20', '11:00']);
  assert.equal(
    (await request('/admin/services/barba', 'PUT', { ...beard, duration: 40 }, admin)).status,
    200,
  );
  assert.equal(
    (await request(`/appointments/${forty.data.id}/cancel`, 'PATCH', {}, client)).status,
    200,
  );
  const combined = await request(
    `/availability?date=${adaptiveDate}&barberId=igor&services=corte,barba`,
  );
  assert.equal(combined.data.duration, 80);
  assert.deepEqual(combined.data.slots.slice(0, 3), ['09:00', '10:20', '11:40']);
  const preserved = (await request('/appointments', 'GET', undefined, client)).data.find(
    (a) => a.id === oldReservation.data.id,
  );
  assert.equal(preserved.end_minute - preserved.start_minute, 30);
});
