import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { validateAccount } from '../src/gradefy/forms.ts';

const secret = 'gradefy-test-secret-at-least-32-characters';
const account = {
  scope: 'gradefy',
  name: 'Breno',
  email: 'gradefy-auth@example.com',
  password: 'GradefyTeste123!',
  confirmPassword: 'GradefyTeste123!',
};
async function fixture(t) {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true, secret, serveStatic: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, body, cookie, headers = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
      cookieHeader: response.headers.get('set-cookie'),
    };
  }
  return { db, request };
}
test('Gradefy registration creates only a global user, preserves session contract and denies Igor management', async (t) => {
  const { db, request } = await fixture(t);
  const counts = async () =>
    Promise.all(
      ['companies', 'company_members', 'subscriptions', 'barbers', 'professional_users'].map(
        async (table) => (await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n,
      ),
    );
  const before = await counts();
  const created = await request('/auth/register', {
    ...account,
    email: ' GRADEFY-AUTH@example.com ',
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.user.role, 'client');
  assert.equal(created.data.user.phone, '');
  assert.equal(created.data.user.email, account.email);
  assert.ok(!JSON.stringify(created.data).includes('password'));
  assert.match(created.cookieHeader, /HttpOnly/);
  assert.match(created.cookieHeader, /SameSite=Lax/);
  assert.match(created.cookieHeader, /Path=\//);
  const token = jwt.verify(created.cookie.slice('session='.length), secret);
  assert.equal(token.iss, 'igor-barber-club');
  assert.equal(token.aud, 'barber-web');
  assert.equal(token.version, 0);
  assert.equal(token.exp - token.iat, 7 * 86400);
  assert.deepEqual(await counts(), before);
  assert.deepEqual((await request('/companies', undefined, created.cookie)).data, []);
  assert.equal((await request('/admin/metrics', undefined, created.cookie)).status, 403);
  assert.equal(
    (await request('/auth/me', undefined, created.cookie)).data.user.id,
    created.data.user.id,
  );
  const global = await request('/auth/me?scope=gradefy', undefined, created.cookie, {
    'X-Gradefy-Company-Id': 'igor-barber-club',
  });
  assert.equal(global.data.user.id, created.data.user.id);
  assert.equal(global.data.visitor, null);
  await seed(db);
  assert.deepEqual(
    await counts(),
    before,
    'subsequent initialization must not assign membership or trial',
  );
  assert.equal((await request('/auth/register', account)).status, 409);
});
test('Gradefy registration validates fields and rejects role/company injection; legacy still requires phone and surname', async (t) => {
  const { db, request } = await fixture(t);
  const before = (await db.get('SELECT COUNT(*) AS n FROM users')).n;
  for (const payload of [
    { ...account, name: ' ' },
    { ...account, email: 'invalid' },
    { ...account, password: 'short', confirmPassword: 'short' },
    { ...account, confirmPassword: 'different' },
    { ...account, password: 'é'.repeat(37), confirmPassword: 'é'.repeat(37) },
    { ...account, role: 'admin' },
    { ...account, company_id: 'igor-barber-club' },
    { ...account, scope: 'invalid' },
    { name: 'Sem Telefone', email: account.email, password: account.password },
    { name: 'Breno', phone: '21999999999', email: account.email, password: account.password },
  ])
    assert.equal((await request('/auth/register', payload)).status, 400);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM users')).n, before);
  assert.equal(
    (
      await request('/auth/register', {
        name: 'Cliente Legado',
        phone: '21999999999',
        email: 'legacy-gradefy@example.com',
        password: account.password,
      })
    ).status,
    201,
  );
});
test('Gradefy session accepts existing cookies, survives inactive Igor, enforces logout origin and rejects expired sessions', async (t) => {
  const { db, request } = await fixture(t);
  const legacy = await request('/auth/login', {
    email: 'admin@igorbarberclub.com.br',
    password: 'IgorDemo2026!',
  });
  assert.equal(legacy.status, 200);
  assert.equal(
    (await request('/auth/login', { email: 'admin@igorbarberclub.com.br', password: 'incorrect' }))
      .status,
    401,
  );
  const session = await request('/auth/me?scope=gradefy', undefined, legacy.cookie);
  assert.equal(session.data.user.id, legacy.data.user.id);
  assert.equal((await request('/companies', undefined, legacy.cookie)).data.length, 1);
  assert.equal((await request('/admin/metrics', undefined, legacy.cookie)).status, 200);
  const csrf = await request('/auth/logout?scope=gradefy', {}, legacy.cookie, {
    Origin: 'https://attacker.example',
  });
  assert.equal(csrf.status, 403);
  const expired = jwt.sign({ version: 0 }, secret, {
    subject: legacy.data.user.id,
    expiresIn: -10,
    issuer: 'igor-barber-club',
    audience: 'barber-web',
  });
  assert.equal(
    (await request('/auth/me?scope=gradefy', undefined, `session=${expired}`)).data.user,
    null,
  );
  assert.equal((await request('/companies', undefined, `session=${expired}`)).status, 401);
  await db.run("UPDATE companies SET status='suspended' WHERE id='igor-barber-club'");
  assert.equal((await request('/auth/me', undefined, legacy.cookie)).status, 404);
  assert.equal(
    (await request('/auth/me?scope=gradefy', undefined, legacy.cookie)).data.user.id,
    legacy.data.user.id,
  );
  const logout = await request('/auth/logout?scope=gradefy', {}, legacy.cookie);
  assert.equal(logout.status, 200);
  assert.equal(logout.cookie, 'session=');
  assert.equal((await request('/auth/me?scope=gradefy', undefined, logout.cookie)).data.user, null);
});
test('Gradefy form validation catches confirmation and UTF-8 byte length', () => {
  assert.deepEqual(validateAccount(account, true), {});
  assert.equal(
    validateAccount({ ...account, confirmPassword: 'other' }, true).confirmPassword,
    'As senhas não coincidem.',
  );
  assert.ok(validateAccount({ ...account, password: '😀'.repeat(19) }, true).password);
  assert.deepEqual(
    Object.keys(validateAccount({ ...account, name: '', email: 'bad', password: '' })),
    ['email', 'password'],
  );
});
