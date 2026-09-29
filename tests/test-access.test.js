import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { dateInBrazil, addDays, weekday } from '../server/domain.js';

test('unverified access is restricted to an explicitly enabled disposable database', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  for (const fake of [
    { ...db, ephemeral: false },
    { ...db, dialect: 'postgres' },
  ])
    assert.throws(() => createApp(fake, { testGuestAccess: true }), /isolado/);
  const oldVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    assert.throws(() => createApp(db, { testGuestAccess: true }), /isolado/);
  } finally {
    if (oldVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = oldVercel;
  }
  const app = createApp(db, { test: true });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/test-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cliente@example.com' }),
  });
  assert.equal(response.status, 404);
});

test('test access restores history after cookies are lost and works on multiple devices without unlocking accounts', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true, testGuestAccess: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers
        .getSetCookie()
        .find((value) => value.startsWith('igor-visitor='))
        ?.split(';')[0],
    };
  }
  assert.equal((await request('/config')).data.testGuestAccess, true);
  let date = addDays(dateInBrazil(), 65);
  if (weekday(date) === 0) date = addDays(date, 1);
  const created = await request('/appointments/guest', 'POST', {
    services: ['barba'],
    barberId: 'igor',
    date,
    time: '09:00',
    guest: { name: 'Pessoa Teste', phone: '21999999999', email: 'teste@example.com' },
  });
  assert.equal(created.status, 201);
  const usersBefore = (await db.get('SELECT COUNT(*) AS n FROM users')).n;
  const restored = await request('/auth/test-access', 'POST', { email: ' TESTE@example.com ' });
  assert.equal(restored.status, 200);
  assert.equal(restored.cookie, created.cookie);
  const otherDevice = await request('/auth/test-access', 'POST', { email: 'teste@example.com' });
  for (const cookie of [created.cookie, restored.cookie, otherDevice.cookie]) {
    assert.deepEqual(
      (await request('/appointments', 'GET', undefined, cookie)).data.map((a) => a.id),
      [created.data.id],
    );
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).data.user, null);
    assert.equal((await request('/admin/metrics', 'GET', undefined, cookie)).status, 401);
  }
  assert.equal(
    (await request('/auth/test-access', 'POST', { email: 'admin@igorbarberclub.com.br' })).status,
    404,
  );
  assert.equal(
    (await request('/auth/test-access', 'POST', { email: 'teste@example.com', role: 'admin' }))
      .status,
    400,
  );
  await request('/auth/logout', 'POST', {}, restored.cookie);
  assert.equal((await request('/appointments', 'GET', undefined, restored.cookie)).status, 401);
  const afterLogout = await request('/auth/test-access', 'POST', { email: 'teste@example.com' });
  assert.equal(afterLogout.status, 200);
  assert.notEqual(afterLogout.cookie, restored.cookie);
  assert.equal(
    (await request(`/appointments/${created.data.id}/cancel`, 'PATCH', {}, afterLogout.cookie))
      .status,
    200,
  );
  assert.equal(
    (await request('/appointments', 'GET', undefined, afterLogout.cookie)).data[0].status,
    'cancelled',
  );
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM users')).n, usersBefore);
});
