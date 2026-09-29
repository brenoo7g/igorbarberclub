import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { addDays, dateInBrazil, weekday } from '../server/domain.js';

async function setup(t) {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', data, cookie, extra = {}) {
    const r = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const cookies = r.headers.getSetCookie();
    return {
      status: r.status,
      data: await r.json(),
      cookies,
      cookie: cookies.find((value) => value.startsWith('igor-visitor='))?.split(';')[0],
    };
  }
  let date = addDays(dateInBrazil(), 55);
  if (weekday(date) === 0) date = addDays(date, 1);
  const contact = {
    name: 'Visitante Persistente',
    email: 'cliente@example.com',
    phone: '21988887777',
  };
  const booking = (time = '09:00', guest = contact) => ({
    services: ['barba'],
    barberId: 'igor',
    date,
    time,
    guest,
  });
  return { db, request, booking, date, contact };
}

test('persistent guests: secure cookie, isolated history, no account matching and concurrent first reservations', async (t) => {
  const { db, request, booking, date } = await setup(t);
  const beforeUsers = (await db.get('SELECT COUNT(*) AS n FROM users')).n;
  const bootstrap = await request('/auth/me');
  assert.equal(bootstrap.data.visitor, null);
  assert.match(bootstrap.cookies[0], /HttpOnly/);
  assert.match(bootstrap.cookies[0], /SameSite=Lax/);
  assert.match(bootstrap.cookies[0], /Max-Age=7776000/);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM guest_sessions')).n, 0);
  const ownerCookie = bootstrap.cookie;
  const results = await Promise.all([
    request('/appointments/guest', 'POST', booking('09:00'), ownerCookie),
    request('/appointments/guest', 'POST', booking('09:30'), ownerCookie),
  ]);
  assert.ok(results.every((result) => result.status === 201));
  assert.equal(results[0].data.visitor.id, results[1].data.visitor.id);
  const id = results[0].data.id;
  const session = await db.get('SELECT * FROM guest_sessions');
  const raw = ownerCookie.split('=')[1];
  assert.equal(session.token_hash, createHash('sha256').update(raw).digest('hex'));
  assert.ok(!JSON.stringify(results).includes(session.token_hash));
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM users')).n, beforeUsers);
  const history = await request('/appointments', 'GET', undefined, ownerCookie);
  assert.equal(history.status, 200);
  assert.equal(history.data.length, 2);
  assert.ok(history.data.every((a) => a.user_id === null));
  assert.equal((await request('/auth/me', 'GET', undefined, ownerCookie)).data.user, null);
  assert.equal(
    (await request('/auth/me', 'GET', undefined, ownerCookie)).data.visitor.name,
    'Visitante Persistente',
  );
  // Same contacts on a second device must not transfer ownership.
  const outsider = await request('/appointments/guest', 'POST', booking('10:00'));
  assert.equal(outsider.status, 201);
  assert.notEqual(outsider.data.visitor.id, session.id);
  assert.deepEqual(
    (await request('/appointments', 'GET', undefined, outsider.cookie)).data.map((a) => a.id),
    [outsider.data.id],
  );
  for (const action of ['cancel', 'reschedule']) {
    assert.equal(
      (await request(`/appointments/${id}/${action}`, 'PATCH', booking('11:00'), outsider.cookie))
        .status,
      404,
    );
    assert.equal(
      (await request(`/appointments/${id}/${action}`, 'PATCH', booking('11:00'))).status,
      401,
    );
  }
  const availability = (cookie) =>
    request(
      `/availability?date=${date}&barberId=igor&services=barba&except=${id}`,
      'GET',
      undefined,
      cookie,
    );
  assert.ok((await availability(ownerCookie)).data.slots.includes('09:00'));
  assert.ok(!(await availability(outsider.cookie)).data.slots.includes('09:00'));
  assert.equal((await request('/admin/metrics', 'GET', undefined, ownerCookie)).status, 401);
  assert.equal((await request('/auth/profile', 'PATCH', {}, ownerCookie)).status, 401);
  assert.equal((await request('/appointments', 'POST', booking(), ownerCookie)).status, 401);
  assert.equal(
    (
      await request(`/appointments/${id}/cancel`, 'PATCH', {}, ownerCookie, {
        Origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  const registered = await request('/auth/login', 'POST', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  const userCookie = registered.cookies.find((value) => value.startsWith('session=')).split(';')[0];
  assert.equal((await request(`/appointments/${id}/cancel`, 'PATCH', {}, userCookie)).status, 404);
  assert.equal(
    (await request(`/appointments/${id}/cancel`, 'PATCH', {}, `${userCookie}; ${ownerCookie}`))
      .status,
    404,
    'account identity takes precedence over visitor',
  );
});

test('persistent guests: reschedule/cancel keep history, snapshots and notifications, contacts persist, revoked access stays revoked', async (t) => {
  const { db, request, booking, contact } = await setup(t);
  const created = await request('/appointments/guest', 'POST', booking());
  const cookie = created.cookie;
  const id = created.data.id;
  const reschedule = { ...booking('10:00') };
  delete reschedule.guest;
  const changed = await request(`/appointments/${id}/reschedule`, 'PATCH', reschedule, cookie);
  assert.equal(changed.status, 200);
  assert.equal(changed.data.id, id);
  assert.equal(changed.data.time, '10:00');
  const more = await request(
    '/appointments/guest',
    'POST',
    booking('11:00', { ...contact, name: 'Nome Atualizado', phone: '21977776666' }),
    cookie,
  );
  assert.equal(more.status, 201);
  assert.equal(more.cookie, cookie);
  assert.equal(
    (await request('/auth/me', 'GET', undefined, cookie)).data.visitor.name,
    'Nome Atualizado',
  );
  const history = (await request('/appointments', 'GET', undefined, cookie)).data;
  assert.equal(
    history.find((a) => a.id === id).client_name,
    contact.name,
    'old booking retains original contact snapshot',
  );
  const race = await Promise.all([
    request(`/appointments/${id}/cancel`, 'PATCH', {}, cookie),
    request(`/appointments/${id}/cancel`, 'PATCH', {}, cookie),
  ]);
  assert.deepEqual(race.map((result) => result.status).sort(), [200, 400]);
  assert.equal(
    (await request('/appointments', 'GET', undefined, cookie)).data.find((a) => a.id === id).status,
    'cancelled',
  );
  assert.equal(
    (await request(`/appointments/${id}/reschedule`, 'PATCH', reschedule, cookie)).status,
    400,
  );
  const jobs = await db.all('SELECT * FROM notifications WHERE appointment_id=?', [id]);
  assert.deepEqual(
    jobs
      .filter((job) => job.channel === 'email')
      .map((job) => job.event)
      .sort(),
    ['cancelled', 'confirmed', 'rescheduled'],
  );
  assert.ok(jobs.every((job) => JSON.parse(job.payload).guestSession === true));
  const forgotten = await request('/auth/logout', 'POST', {}, cookie);
  assert.equal(forgotten.status, 200);
  assert.ok(forgotten.cookies.some((value) => value.startsWith('igor-visitor=;')));
  assert.equal((await request('/appointments', 'GET', undefined, cookie)).status, 401);
  assert.equal(
    (await request(`/appointments/${more.data.id}/cancel`, 'PATCH', {}, cookie)).status,
    401,
  );
  assert.equal(
    (await db.get('SELECT status FROM appointments WHERE id=?', [more.data.id])).status,
    'confirmed',
  );
  const restarted = await request('/appointments/guest', 'POST', booking('12:00'), cookie);
  assert.equal(restarted.status, 201);
  assert.notEqual(restarted.cookie, cookie);
  assert.equal((await request('/appointments', 'GET', undefined, restarted.cookie)).data.length, 1);
  assert.equal((await request('/appointments', 'GET', undefined, cookie)).status, 401);
});

test('persistent guests: expiration, renewal, tampering, rejected bookings and legacy reservations', async (t) => {
  const { db, request, booking } = await setup(t);
  const created = await request('/appointments/guest', 'POST', booking());
  const cookie = created.cookie;
  await db.run('UPDATE guest_sessions SET expires_at=?', [
    new Date(Date.now() + 86400000).toISOString(),
  ]);
  const renewed = await request('/auth/me', 'GET', undefined, cookie);
  assert.equal(renewed.cookie, cookie);
  assert.ok(
    (await db.get('SELECT expires_at FROM guest_sessions')).expires_at >
      new Date(Date.now() + 89 * 86400000).toISOString(),
  );
  const tampered = cookie.slice(0, -1) + (cookie.endsWith('0') ? '1' : '0');
  assert.equal((await request('/appointments', 'GET', undefined, tampered)).status, 401);
  await db.run("UPDATE guest_sessions SET expires_at='2000-01-01T00:00:00.000Z'");
  assert.equal((await request('/appointments', 'GET', undefined, cookie)).status, 401);
  assert.equal((await request('/auth/me', 'GET', undefined, cookie)).data.visitor, null);
  const count = (await db.get('SELECT COUNT(*) AS n FROM guest_sessions')).n;
  assert.equal((await request('/appointments/guest', 'POST', booking(), cookie)).status, 409);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM guest_sessions')).n, count);
  // A pre-feature guest booking has no session mapping and cannot be claimed with matching contacts.
  await db.run('DELETE FROM guest_appointments WHERE appointment_id=?', [created.data.id]);
  const newer = await request('/appointments/guest', 'POST', booking('10:00'));
  assert.equal(
    (await request(`/appointments/${created.data.id}/cancel`, 'PATCH', {}, newer.cookie)).status,
    404,
  );
  await db.run("UPDATE appointments SET date='2000-01-01' WHERE id=?", [newer.data.id]);
  assert.equal(
    (await request(`/appointments/${newer.data.id}/cancel`, 'PATCH', {}, newer.cookie)).status,
    400,
  );
});
