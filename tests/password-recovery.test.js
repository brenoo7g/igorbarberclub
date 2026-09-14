import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { createPasswordEmailProcessor } from '../server/password-recovery.js';

const secret = 'recovery-test-secret-at-least-32-characters';
async function fixture(t) {
  const previous = Object.fromEntries(
    ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'].map((key) => [key, process.env[key]]),
  );
  process.env.RESEND_API_KEY = 'test-never-sent';
  process.env.EMAIL_FROM = 'Test <test@example.com>';
  process.env.APP_URL = 'https://barber.example';
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const app = createApp(db, { test: true, secret, serveStatic: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const networkFetch = globalThis.fetch;
  const mails = [];
  let providerStatus = 200;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    mails.push({ ...JSON.parse(options.body), key: options.headers['Idempotency-Key'] });
    return new Response('{}', { status: providerStatus });
  });
  t.mock.method(console, 'error', () => {});
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  async function request(path, body, cookie, headers = {}) {
    const response = await networkFetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
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
    };
  }
  async function issue(email = 'cliente@example.com') {
    await db.run('DELETE FROM password_recovery_limits');
    const response = await request('/auth/forgot-password', { email });
    assert.equal(response.status, 202);
    await app.locals.processPasswordEmails();
    return new URLSearchParams(
      new URL(mails.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(1),
    ).get('token');
  }
  return { db, app, request, mails, issue, failProvider: (value) => (providerStatus = value) };
}
const resetBody = (token, password = 'NovaSenhaCliente123!') => ({
  token,
  password,
  confirmPassword: password,
});

test('recovery: private response, trusted link, no plaintext token, atomic single use and session revocation', async (t) => {
  const f = await fixture(t);
  const login = await f.request('/auth/login', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  const secondLogin = await f.request('/auth/login', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  const unknown = await f.request('/auth/forgot-password', { email: 'unknown@example.com' });
  const known = await f.request(
    '/auth/forgot-password',
    { email: ' CLIENTE@example.com ' },
    undefined,
    { Host: 'attacker.example' },
  );
  assert.equal(known.status, 202);
  assert.deepEqual(known, unknown);
  assert.equal(f.mails.length, 0, 'API queues without waiting for provider');
  await f.app.locals.processPasswordEmails();
  const mail = f.mails[0];
  assert.deepEqual(mail.to, ['cliente@example.com']);
  assert.equal(mail.from, 'Test <test@example.com>');
  assert.match(mail.text, /30 minutos/);
  const url = new URL(mail.text.match(/https:\/\/\S+/)[0]);
  assert.equal(url.origin, 'https://barber.example');
  assert.equal(url.pathname, '/redefinir-senha');
  assert.equal(url.search, '');
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  const row = await f.db.get('SELECT * FROM password_recovery');
  assert.equal(row.token_hash, createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(row).includes(token));
  assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 30 * 60000);
  const userBefore = await f.db.get('SELECT * FROM users WHERE id=?', [row.user_id]);
  assert.equal((await f.request('/auth/me', undefined, login.cookie)).data.user.id, row.user_id);
  const outcomes = await Promise.all([
    f.request('/auth/reset-password', resetBody(token)),
    f.request('/auth/reset-password', resetBody(token)),
  ]);
  assert.deepEqual(outcomes.map((x) => x.status).sort(), [200, 400]);
  assert.equal(outcomes.find((x) => x.status === 200).cookie, 'session=');
  for (const cookie of [login.cookie, secondLogin.cookie])
    assert.equal((await f.request('/auth/me', undefined, cookie)).data.user, null);
  assert.equal(
    (await f.request('/auth/login', { email: userBefore.email, password: 'ClienteDemo2026!' }))
      .status,
    401,
  );
  assert.equal(
    (await f.request('/auth/login', { email: userBefore.email, password: 'NovaSenhaCliente123!' }))
      .status,
    200,
  );
  const after = await f.db.get('SELECT * FROM users WHERE id=?', [row.user_id]);
  assert.equal(after.session_version, userBefore.session_version + 1);
  for (const key of ['name', 'email', 'phone', 'role', 'profile_version'])
    assert.equal(after[key], userBefore[key]);
  await f.app.locals.processPasswordEmails();
  assert.match(f.mails.at(-1).subject, /foi alterada/);
  assert.ok(!JSON.stringify(f.mails).includes('NovaSenhaCliente123!'));
});

test('recovery: invalid/expired tokens, password validation and newer links do not invalidate earlier email', async (t) => {
  const f = await fixture(t);
  const first = await f.issue();
  const second = await f.issue();
  const before = await f.db.get(
    "SELECT password_hash FROM users WHERE email='cliente@example.com'",
  );
  for (const body of [
    resetBody('x'),
    resetBody('0'.repeat(64)),
    resetBody(first, 'short'),
    { ...resetBody(first), confirmPassword: 'different' },
    resetBody(first, 'é'.repeat(40)),
    { ...resetBody(first), role: 'admin' },
    resetBody(first, 'ClienteDemo2026!'),
  ]) {
    assert.equal((await f.request('/auth/reset-password', body)).status, 400);
  }
  await f.db.run('UPDATE password_recovery SET expires_at=? WHERE token_hash=?', [
    '2000-01-01T00:00:00.000Z',
    createHash('sha256').update(second).digest('hex'),
  ]);
  assert.equal((await f.request('/auth/reset-password', resetBody(second))).status, 400);
  assert.deepEqual(
    await f.db.get("SELECT password_hash FROM users WHERE email='cliente@example.com'"),
    before,
  );
  const third = await f.issue();
  assert.equal((await f.request('/auth/reset-password', resetBody(first))).status, 200);
  assert.equal((await f.request('/auth/reset-password', resetBody(third))).status, 400);
});

test('recovery: admin policy, email/password changes and key rotation revoke obsolete links', async (t) => {
  const f = await fixture(t);
  const adminToken = await f.issue('admin@igorbarberclub.com.br');
  const weak = await f.request('/auth/reset-password', resetBody(adminToken, '12345678901'));
  assert.equal(weak.status, 400);
  assert.match(weak.data.error, /12 caracteres/);
  assert.equal(
    (await f.request('/auth/reset-password', resetBody(adminToken, 'AdminSenhaNova123!'))).status,
    200,
  );
  await f.app.locals.processPasswordEmails();
  const token = await f.issue();
  await f.db.run(
    "UPDATE users SET email='new@example.com',session_version=session_version+1 WHERE email='cliente@example.com'",
  );
  assert.equal((await f.request('/auth/reset-password', resetBody(token))).status, 400);
  const newer = await f.issue('new@example.com');
  await f.db.run(
    "UPDATE users SET session_version=session_version+1 WHERE email='new@example.com'",
  );
  assert.equal((await f.request('/auth/reset-password', resetBody(newer))).status, 400);
  await f.db.run('DELETE FROM password_recovery_limits');
  await f.request('/auth/forgot-password', { email: 'new@example.com' });
  const count = f.mails.length;
  await createPasswordEmailProcessor(f.db, 'rotated-secret')();
  assert.equal(f.mails.length, count);
});

test('recovery: persistent account/IP throttling, guest isolation and missing configuration', async (t) => {
  const f = await fixture(t);
  const one = await f.request('/auth/forgot-password', { email: 'cliente@example.com' });
  const two = await f.request('/auth/forgot-password', { email: 'cliente@example.com' });
  assert.deepEqual(one, two);
  assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM password_recovery')).n, 1);
  for (let i = 0; i < 2; i++) {
    await f.db.run('UPDATE password_recovery_limits SET last_attempt_at=?', [
      '2000-01-01T00:00:00.000Z',
    ]);
    await f.request('/auth/forgot-password', { email: 'cliente@example.com' });
  }
  assert.equal(
    (await f.db.get('SELECT COUNT(*) AS n FROM password_recovery')).n,
    2,
    'three attempts per account window, including suppressed requests',
  );
  await f.db.run('DELETE FROM password_recovery_limits');
  const users = (await f.db.get('SELECT COUNT(*) AS n FROM users')).n;
  for (let i = 0; i < 10; i++)
    await f.request('/auth/forgot-password', { email: `guest${i}@example.com` });
  await f.request('/auth/forgot-password', { email: 'admin@igorbarberclub.com.br' });
  assert.equal(
    (
      await f.db.get(
        "SELECT COUNT(*) AS n FROM password_recovery WHERE email='admin@igorbarberclub.com.br'",
      )
    ).n,
    0,
  );
  assert.equal((await f.db.get('SELECT COUNT(*) AS n FROM users')).n, users);
  assert.equal(
    (
      await f.request('/auth/forgot-password', { email: 'cliente@example.com' }, undefined, {
        Origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  assert.equal((await f.request('/auth/forgot-password', { email: 'bad' })).status, 400);
  delete process.env.RESEND_API_KEY;
  for (const email of ['cliente@example.com', 'unknown@example.com'])
    assert.equal((await f.request('/auth/forgot-password', { email })).status, 503);
});

test('recovery: provider failures retry idempotently, concurrent workers, lease recovery and expiry', async (t) => {
  const f = await fixture(t);
  f.failProvider(503);
  await f.issue();
  let row = await f.db.get('SELECT * FROM password_recovery');
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 1);
  await f.app.locals.processPasswordEmails();
  assert.equal(f.mails.length, 1);
  await f.db.run("UPDATE password_recovery SET status='sending',next_attempt_at=?", [
    '2000-01-01T00:00:00.000Z',
  ]);
  f.failProvider(200);
  await Promise.all([
    createPasswordEmailProcessor(f.db, secret)(),
    createPasswordEmailProcessor(f.db, secret)(),
  ]);
  assert.equal(f.mails.length, 2);
  assert.deepEqual(f.mails[0], f.mails[1]);
  row = await f.db.get('SELECT * FROM password_recovery');
  assert.equal(row.status, 'sent');
  await f.db.run('DELETE FROM password_recovery_limits');
  await f.request('/auth/forgot-password', { email: 'cliente@example.com' });
  await f.db.run(
    "UPDATE password_recovery SET expires_at='2000-01-01T00:00:00.000Z' WHERE status='pending'",
  );
  await f.app.locals.processPasswordEmails();
  assert.equal(f.mails.length, 2);
});
