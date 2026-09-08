import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { addDays, dateInBrazil, weekday } from '../server/domain.js';

test('profile migration preserves existing users and is repeatable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'igor-profile-migration-'));
  const path = join(directory, 'test.db');
  let db;
  try {
    const old = new DatabaseSync(path);
    old.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'client', created_at TEXT NOT NULL); INSERT INTO users VALUES ('existing','Existing User','existing@example.com','21999999999','unchanged-hash','admin','2026-01-01');",
    );
    old.close();
    db = await createDatabase('', path);
    const user = await db.get('SELECT * FROM users WHERE id=?', ['existing']);
    assert.equal(user.name, 'Existing User');
    assert.equal(user.password_hash, 'unchanged-hash');
    assert.equal(user.profile_version, 0);
    assert.equal(user.session_version, 0);
    assert.equal(user.avatar, null);
    await db.run('UPDATE users SET profile_version=3,session_version=2 WHERE id=?', ['existing']);
    await db.close();
    db = null;
    db = await createDatabase('', path);
    assert.equal((await db.get('SELECT * FROM users WHERE id=?', ['existing'])).session_version, 2);
  } finally {
    if (db) await db.close();
    assert.ok(directory.startsWith(join(tmpdir(), 'igor-profile-migration-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('profile API: ownership, validation, concurrency, photos, session revocation and bootstrap', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const secret = 'profile-test-secret-with-at-least-32-characters';
  const server = createApp(db, { secret, test: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', data, cookie, extraHeaders = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...extraHeaders,
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const credentials = {
    name: 'Cliente Perfil',
    email: 'perfil@example.com',
    phone: '21999998888',
    password: 'PerfilTeste123!',
  };
  let result = await request('/auth/register', 'POST', credentials);
  let cookie = result.cookie;
  let user = result.data.user;
  const userId = user.id;
  const draft = (overrides = {}) => ({
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    profileVersion: user.profileVersion,
    ...overrides,
  });
  let booking;

  await t.test('a database outage does not masquerade as an expired session', async (subtest) => {
    subtest.mock.method(console, 'error', () => {});
    subtest.mock.method(db, 'get', async () => {
      throw new Error('Simulated database outage');
    });
    assert.equal((await request('/auth/me', 'GET', undefined, cookie)).status, 500);
  });

  await t.test(
    'only the authenticated owner can edit; roles and IDs cannot be injected',
    async () => {
      assert.equal((await request('/auth/profile', 'PATCH', draft())).status, 401);
      for (const extra of [{ role: 'admin' }, { id: 'another-user' }, { session_version: 0 }])
        assert.equal((await request('/auth/profile', 'PATCH', draft(extra), cookie)).status, 400);
      assert.equal(
        (
          await request('/auth/profile', 'PATCH', draft(), cookie, {
            Origin: 'https://evil.example',
          })
        ).status,
        403,
      );
      assert.equal((await request('/admin/metrics', 'GET', undefined, cookie)).status, 403);
    },
  );
  await t.test('validation and failures leave persisted data unchanged', async () => {
    for (const fields of [
      { name: '  ' },
      { phone: '123' },
      { email: 'bad' },
      { name: 'x'.repeat(101) },
    ])
      assert.equal((await request('/auth/profile', 'PATCH', draft(fields), cookie)).status, 400);
    assert.equal(
      (await request('/auth/me', 'GET', undefined, cookie)).data.user.name,
      credentials.name,
    );
    assert.equal(
      (
        await request(
          '/auth/profile',
          'PATCH',
          draft({ email: 'cliente@example.com', currentPassword: credentials.password }),
          cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await request('/auth/profile', 'PATCH', draft({ email: 'new@example.com' }), cookie)).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/auth/profile',
          'PATCH',
          draft({ email: 'new@example.com', currentPassword: 'wrong' }),
          cookie,
        )
      ).status,
      400,
    );
  });
  await t.test('bookings survive name and contact changes with the same identity', async () => {
    let date = addDays(dateInBrazil(), 45);
    if (weekday(date) === 0) date = addDays(date, 1);
    booking = await request(
      '/appointments',
      'POST',
      { services: ['corte'], barberId: 'igor', date, time: '09:00' },
      cookie,
    );
    assert.equal(booking.status, 201);
    result = await request(
      '/auth/profile',
      'PATCH',
      draft({ name: 'Novo Nome', phone: '(21) 98888-7777' }),
      cookie,
    );
    assert.equal(result.status, 200);
    user = result.data.user;
    assert.equal(user.id, userId);
    assert.equal(user.phone, '21988887777');
    assert.equal(user.role, 'client');
    assert.equal('password_hash' in user, false);
    assert.equal('session_version' in user, false);
    const appointments = (await request('/appointments', 'GET', undefined, cookie)).data;
    assert.equal(appointments[0].id, booking.data.id);
    assert.equal(appointments[0].client_name, 'Novo Nome');
    assert.equal(appointments[0].total, booking.data.total);
  });
  await t.test(
    'valid photo is normalized and persists; malformed/large files do not overwrite it',
    async () => {
      const buffer = await sharp({
        create: { width: 64, height: 32, channels: 3, background: '#365fff' },
      })
        .png()
        .toBuffer();
      const avatar = `data:image/png;base64,${buffer.toString('base64')}`;
      result = await request('/auth/profile', 'PATCH', draft({ avatar }), cookie);
      assert.equal(result.status, 200);
      user = result.data.user;
      assert.match(user.avatar, /^data:image\/webp;base64,/);
      const metadata = await sharp(Buffer.from(user.avatar.split(',')[1], 'base64')).metadata();
      assert.equal(metadata.width, 256);
      assert.equal(metadata.height, 256);
      for (const invalid of [
        'https://example.com/photo.jpg',
        'data:image/svg+xml;base64,PHN2Zy8+',
        'data:image/png;base64,dGV4dA==',
        `data:image/jpeg;base64,${buffer.toString('base64')}`,
      ])
        assert.equal(
          (await request('/auth/profile', 'PATCH', draft({ avatar: invalid }), cookie)).status,
          400,
        );
      assert.equal(
        (await request('/auth/profile', 'PATCH', draft({ avatar: 'x'.repeat(800000) }), cookie))
          .status,
        413,
      );
      assert.equal(
        (await request('/auth/me', 'GET', undefined, cookie)).data.user.avatar,
        user.avatar,
      );
      result = await request('/auth/profile', 'PATCH', draft({ avatar: null }), cookie);
      assert.equal(result.status, 200);
      user = result.data.user;
      assert.equal(user.avatar, null);
    },
  );
  await t.test('simultaneous tabs cannot silently overwrite each other', async () => {
    const stale = draft();
    const results = await Promise.all([
      request('/auth/profile', 'PATCH', { ...stale, name: 'Primeira Aba' }, cookie),
      request('/auth/profile', 'PATCH', { ...stale, name: 'Segunda Aba' }, cookie),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    user = results.find((r) => r.status === 200).data.user;
  });
  await t.test(
    'email changes require password and renew the current session while revoking older ones',
    async () => {
      const previousCookie = cookie;
      result = await request(
        '/auth/profile',
        'PATCH',
        draft({ email: ' NOVO.PERFIL@example.com ', currentPassword: credentials.password }),
        cookie,
      );
      assert.equal(result.status, 200);
      user = result.data.user;
      cookie = result.cookie;
      assert.equal(user.email, 'novo.perfil@example.com');
      assert.equal(user.id, userId);
      assert.equal((await request('/auth/me', 'GET', undefined, previousCookie)).data.user, null);
      assert.equal((await request('/auth/login', 'POST', credentials)).status, 401);
      assert.equal(
        (
          await request('/auth/login', 'POST', {
            email: user.email,
            password: credentials.password,
          })
        ).status,
        200,
      );
      assert.equal(
        (await request('/appointments', 'GET', undefined, cookie)).data[0].id,
        booking.data.id,
      );
    },
  );
  await t.test(
    'password validation and atomic concurrent changes revoke all old sessions',
    async () => {
      for (const data of [
        { currentPassword: 'wrong', password: 'NovaSenhaTeste123!' },
        { currentPassword: credentials.password, password: credentials.password },
        { currentPassword: credentials.password, password: 'short' },
        { currentPassword: credentials.password, password: '🔒'.repeat(25) },
      ])
        assert.equal((await request('/auth/password', 'PATCH', data, cookie)).status, 400);
      const previousCookie = cookie;
      const results = await Promise.all([
        request(
          '/auth/password',
          'PATCH',
          { currentPassword: credentials.password, password: 'NovaSenhaTeste123!' },
          cookie,
        ),
        request(
          '/auth/password',
          'PATCH',
          { currentPassword: credentials.password, password: 'OutraSenhaTeste123!' },
          cookie,
        ),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
      const winner = results.findIndex((r) => r.status === 200);
      cookie = results[winner].cookie;
      assert.equal((await request('/appointments', 'GET', undefined, previousCookie)).status, 401);
      assert.equal((await request('/auth/me', 'GET', undefined, cookie)).data.user.id, userId);
      assert.equal(
        (
          await request('/auth/login', 'POST', {
            email: user.email,
            password: credentials.password,
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request('/auth/login', 'POST', {
            email: user.email,
            password: winner === 0 ? 'NovaSenhaTeste123!' : 'OutraSenhaTeste123!',
          })
        ).status,
        200,
      );
      const legacy = jwt.sign({}, secret, {
        subject: userId,
        expiresIn: '7d',
        issuer: 'igor-barber-club',
        audience: 'barber-web',
      });
      assert.equal(
        (await request('/auth/me', 'GET', undefined, `session=${legacy}`)).data.user,
        null,
      );
    },
  );
  await t.test(
    'admin profile survives bootstrap without creating another administrator or resetting password',
    async () => {
      const initial = await request('/auth/login', 'POST', {
        email: 'admin@igorbarberclub.com.br',
        password: 'IgorDemo2026!',
      });
      user = initial.data.user;
      cookie = initial.cookie;
      result = await request(
        '/auth/profile',
        'PATCH',
        draft({
          name: 'Proprietário Atualizado',
          email: 'dono@example.com',
          currentPassword: 'IgorDemo2026!',
        }),
        cookie,
      );
      assert.equal(result.status, 200);
      cookie = result.cookie;
      assert.equal(
        (
          await request(
            '/auth/password',
            'PATCH',
            { currentPassword: 'IgorDemo2026!', password: 'only8chr' },
            cookie,
          )
        ).status,
        400,
      );
      result = await request(
        '/auth/password',
        'PATCH',
        { currentPassword: 'IgorDemo2026!', password: 'NovaSenhaDoDono123!' },
        cookie,
      );
      assert.equal(result.status, 200);
      cookie = result.cookie;
      await seed(db);
      const admins = await db.all("SELECT * FROM users WHERE role='admin'");
      assert.equal(admins.length, 1);
      assert.equal(admins[0].id, user.id);
      assert.equal(admins[0].name, 'Proprietário Atualizado');
      assert.equal(
        (
          await request('/auth/login', 'POST', {
            email: 'dono@example.com',
            password: 'NovaSenhaDoDono123!',
          })
        ).status,
        200,
      );
      assert.equal((await request('/admin/metrics', 'GET', undefined, cookie)).status, 200);
      assert.equal((await request('/services')).status, 200);
    },
  );
});
