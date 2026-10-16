import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { jwtSecret } from '../server/jwt-secret.js';
import { lookupPostalCode } from '../server/postal-address.js';
import {
  assertSessionAddressMigration,
  assertSessionAddressInvitations,
} from './helpers/session-address-invitations.js';

test('configured JWT preserves a real cookie after stopping and restarting the Node API with a disposable disk database', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'gradefy-session-restart-'));
  const children = [];
  const stop = async (child) => {
    if (child.exitCode !== null || child.signalCode) return;
    const ended = once(child, 'exit');
    child.kill();
    await ended;
  };
  t.after(async () => {
    await Promise.all(children.map(stop));
    if (
      dirname(folder) !== resolve(tmpdir()) ||
      !basename(folder).startsWith('gradefy-session-restart-')
    )
      throw Error('Unexpected restart test path');
    await rm(folder, { recursive: true, force: true });
  });
  const root = fileURLToPath(new URL('../', import.meta.url));
  async function start() {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    const base = `http://127.0.0.1:${port}`;
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)$/i.test(
          key,
        ),
      ),
    );
    Object.assign(env, {
      DOTENV_CONFIG_PATH: 'NUL',
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      DATABASE_URL: '',
      POSTGRES_URL: '',
      SQLITE_PATH: join(folder, 'disposable.db'),
      JWT_SECRET: 'restart-process-fixture-key-with-more-than-32-characters',
      APP_URL: base,
      PORT: String(port),
    });
    const child = spawn(process.execPath, ['server/index.js'], {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Disposable API startup timeout')), 15000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(Error('Disposable API exited before listening'));
      });
      child.stdout.on('data', (chunk) => {
        if (chunk.toString().includes('Igor Barber Club API:')) {
          clearTimeout(timer);
          done();
        }
      });
      child.stderr.resume(); // Never forward logs, credentials or session cookies.
    });
    return { child, base };
  }
  const first = await start();
  const registration = await fetch(first.base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope: 'gradefy',
      name: 'Pessoa Restart',
      email: 'restart-process@example.test',
      password: 'GradefyTeste123!',
      confirmPassword: 'GradefyTeste123!',
    }),
  });
  assert.equal(registration.status, 201);
  const user = (await registration.json()).user,
    cookie = registration.headers.get('set-cookie').split(';')[0];
  await stop(first.child);
  const second = await start();
  const response = await fetch(second.base + '/api/auth/me?scope=gradefy', {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.id, user.id);
  await stop(second.child);
});

test('persistent sessions require a configured signing key and survive application reinitialization', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  assert.throws(() => jwtSecret(''), /JWT_SECRET/);
  assert.throws(() => jwtSecret('short'), /JWT_SECRET/);
  assert.throws(() => createApp({ ...db, ephemeral: false }, { secret: '' }), /JWT_SECRET/);
  assert.equal(jwtSecret('a'.repeat(48)), 'a'.repeat(48));
  assert.ok(jwtSecret('', { ephemeral: true }).length >= 32);
  const secret = 'restart-test-signing-key-at-least-32';
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('restart-user','Pessoa Teste','restart@example.test','','test','client','2026')",
  );
  const cookie =
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: 'restart-user',
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  const read = async (signingKey) => {
    const s = createApp(db, { secret: signingKey, test: true, serveStatic: false }).listen(
      0,
      '127.0.0.1',
    );
    await once(s, 'listening');
    try {
      return await (
        await fetch(`http://127.0.0.1:${s.address().port}/api/auth/me?scope=gradefy`, {
          headers: { Cookie: cookie },
        })
      ).json();
    } finally {
      await new Promise((r) => s.close(r));
    }
  };
  assert.equal((await read(secret)).user.id, 'restart-user');
  assert.equal((await read(secret)).user.id, 'restart-user');
  assert.equal((await read('other-key-at-least-32-characters-long')).user, null);
});
test('ViaCEP provider responses are validated; no street, unknown code and service errors are recoverable', async () => {
  const result = await lookupPostalCode('01001000', async (url) => {
    assert.equal(url, 'https://viacep.com.br/ws/01001000/json/');
    return {
      ok: true,
      json: async () => ({
        logradouro: '',
        bairro: '',
        localidade: 'São Paulo',
        uf: 'SP',
        extra: 'ignored',
      }),
    };
  });
  assert.deepEqual(result, { street: '', neighborhood: '', city: 'São Paulo', region: 'SP' });
  await assert.rejects(
    lookupPostalCode('99999999', async () => ({ ok: true, json: async () => ({ erro: true }) })),
    (e) => e.status === 404,
  );
  await assert.rejects(
    lookupPostalCode('01001000', async () => {
      throw Error('offline');
    }),
    (e) => e.status === 503,
  );
  await assert.rejects(
    lookupPostalCode('01001000', async () => ({ ok: true, json: async () => ({ uf: 'XX' }) })),
    (e) => e.status === 503,
  );
});
test('Gradefy 7F.3C.1 SQLite migration, address, professional invitations and transactional races', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertSessionAddressMigration(t, db);
  await assertSessionAddressInvitations(t, db);
});
