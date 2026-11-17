import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:net';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { connectCpuProfiler } from './cpu-profiler.mjs';

// Only the disposable PostgreSQL runner may launch this script.
const input = process.env.GRADEFY_PG_TEST_URL;
const token = process.env.GRADEFY_PG_TEST_TOKEN;
const runId = process.env.GRADEFY_PG_TEST_RUN_ID;
assert.match(runId || '', /^[a-f0-9]{16}$/);
assert.match(token || '', /^[a-f0-9]{64}$/);
const controlUrl = new URL(input);
assert.equal(controlUrl.protocol, 'postgresql:');
assert.equal(controlUrl.hostname, '127.0.0.1');
assert.equal(controlUrl.username, 'gradefy_validation');
assert.equal(controlUrl.pathname, `/gradefy_validation_control_${runId}`);
assert.notEqual(controlUrl.port, '5432');
assert.equal(process.env.DATABASE_URL, '');
assert.equal(process.env.POSTGRES_URL, '');
assert.equal(process.env.NODE_ENV, 'test');
const control = new pg.Client({ connectionString: input, ssl: false });
await control.connect();
const cluster = resolve(process.env.GRADEFY_PG_TEST_CLUSTER);
assert.equal(
  (await control.query('SELECT token FROM gradefy_validation_guard')).rows[0].token,
  token,
);
assert.equal(resolve((await control.query('SHOW data_directory')).rows[0].data_directory), cluster);
const name = `gradefy_validation_${runId}_worker`;
await control.query(`CREATE DATABASE "${name}"`);
await control.end();
const url = new URL(input);
url.pathname = `/${name}`;
const { createDatabase } = await import('../../server/database.js');
const { seedLegacyCompany } = await import('../../server/seed.js');
const uninitialized = await createDatabase(url.href, undefined, { initialize: false });
await assert.rejects(uninitialized.get('SELECT version FROM schema_migrations'), { code: '42P01' });
await uninitialized.close();
const db = await createDatabase(url.href);
try {
  await seedLegacyCompany(db, 'igor-barber-club');
  const password = 'WorkerTestPassword!2026';
  await db.run(
    'INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
    [
      'worker-owner',
      'Worker Owner',
      'worker-owner@example.test',
      '21999999999',
      await bcrypt.hash(password, 10),
      'admin',
      new Date().toISOString(),
    ],
  );
  await db.run('INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)', [
    'igor-barber-club',
    'worker-owner',
    'owner',
    new Date().toISOString(),
  ]);
  const before = await db.get('SELECT COUNT(*) AS total FROM schema_migrations');
  const runtimeDb = await createDatabase(url.href, undefined, { initialize: false });
  await runtimeDb.close();
  assert.deepEqual(await db.get('SELECT COUNT(*) AS total FROM schema_migrations'), before);

  const devVars = resolve('.dev.vars');
  try {
    await access(devVars);
    throw new Error('A .dev.vars já existe; não vou sobrescrever um arquivo local.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const jwt = randomBytes(32).toString('hex');
  await writeFile(
    devVars,
    `DATABASE_URL=${url.href}\nJWT_SECRET=${jwt}\nSITE_STORAGE_URL=https://disposable.example.test\nSITE_STORAGE_BUCKET=isolatedtest\nSITE_STORAGE_SERVICE_KEY=local-fixture-only\n`,
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  const freePort = () =>
    new Promise((done, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const value = probe.address().port;
        probe.close(() => done(value));
      });
    });
  const port = await freePort();
  const profileCpu = process.argv.includes('--cpu-profile');
  const inspectorPort = profileCpu ? await freePort() : null;
  const base = `http://127.0.0.1:${port}`;
  const environment = { ...process.env };
  environment.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
  environment.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
  delete environment.GRADEFY_PG_TEST_TOKEN;
  let logs = '';
  const worker = spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--config',
      'wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      ...(profileCpu
        ? ['--inspector-ip', '127.0.0.1', '--inspector-port', String(inspectorPort)]
        : []),
    ],
    { cwd: process.cwd(), env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  worker.stdout.on('data', (chunk) => (logs += chunk.toString()));
  worker.stderr.on('data', (chunk) => (logs += chunk.toString()));
  let cpuProfiler;
  const cpuSamples = [];
  async function profiled(label, operation) {
    if (!cpuProfiler) return operation();
    const { result, sample } = await cpuProfiler.measure(label, async () => {
      const response = await operation();
      await response.clone().arrayBuffer();
      return response;
    });
    cpuSamples.push(sample);
    return result;
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (worker.exitCode !== null) break;
      try {
        const response = await fetch(`${base}/api/health`);
        if (response.status === 200) {
          assert.deepEqual(await response.json(), { ok: true });
          ready = true;
          break;
        }
      } catch {
        // The runtime has not started yet.
      }
      await new Promise((done) => setTimeout(done, 250));
    }
    assert.ok(
      ready,
      `Worker não iniciou. ${logs.replaceAll(url.password, '[redacted]').slice(-1600)}`,
    );
    if (profileCpu) cpuProfiler = await connectCpuProfiler(inspectorPort);
    const login = await profiled('login', () =>
      fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://app.gradefyapp.com.br' },
        body: JSON.stringify({ email: 'worker-owner@example.test', password }),
      }),
    );
    if (login.status !== 200) await new Promise((done) => setTimeout(done, 500));
    assert.equal(
      login.status,
      200,
      `${await login.text()}\n${logs.replaceAll(url.password, '[redacted]').slice(-3000)}`,
    );
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('session='));
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.match(login.headers.get('set-cookie'), /Secure/);
    const foreignOrigin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://malicious.example' },
      body: JSON.stringify({ email: 'worker-owner@example.test', password }),
    });
    assert.equal(foreignOrigin.status, 403);
    const me = await profiled('session', () =>
      fetch(`${base}/api/auth/me`, { headers: { Cookie: cookie } }),
    );
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.email, 'worker-owner@example.test');
    const unauthenticated = await fetch(`${base}/api/companies`);
    assert.equal(unauthenticated.status, 401);
    const companies = await fetch(`${base}/api/companies`, { headers: { Cookie: cookie } });
    assert.equal(companies.status, 200);
    const agenda = await profiled('agenda', () =>
      fetch(`${base}/api/admin/agenda?view=day`, {
        headers: { Cookie: cookie, 'X-Gradefy-Company-Id': 'igor-barber-club' },
      }),
    );
    assert.equal(agenda.status, 200);
    assert.equal((await agenda.json()).company.id, 'igor-barber-club');
    const registration = await profiled('registration', () =>
      fetch(`${base}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'gradefy',
          name: 'New Worker Owner',
          email: 'new-worker-owner@example.test',
          password: 'GradefyWorker123!',
          confirmPassword: 'GradefyWorker123!',
        }),
      }),
    );
    assert.equal(registration.status, 201, await registration.text());
    assert.equal(
      Number(
        (
          await db.get('SELECT COUNT(*) AS count FROM users WHERE email=?', [
            'new-worker-owner@example.test',
          ])
        ).count,
      ),
      1,
    );
    const newCookie = registration.headers.get('set-cookie')?.split(';')[0];
    const forbidden = await fetch(`${base}/api/admin/agenda?view=day`, {
      headers: { Cookie: newCookie, 'X-Gradefy-Company-Id': 'igor-barber-club' },
    });
    assert.equal(forbidden.status, 403);
    const businessPayload = JSON.stringify({
      name: 'Worker Test Studio',
      slug: `worker-studio-${runId}`,
      description: 'Disposable Worker test',
      phone: '21999998888',
      whatsapp: '21999998888',
      instagram: '',
      city: 'Rio de Janeiro',
      region: 'RJ',
      address: '',
      planCode: 'individual',
      nicheCode: 'barbershop',
      templateCode: 'gradefy-minisite',
    });
    const createBusiness = () =>
      fetch(`${base}/api/onboarding/business`, {
        method: 'POST',
        headers: {
          Cookie: newCookie,
          'Content-Type': 'application/json',
          'Idempotency-Key': `worker-${runId}`,
        },
        body: businessPayload,
      });
    const business = await profiled('business-creation', createBusiness);
    assert.equal(business.status, 201, `${await business.text()}\n${logs.slice(-1000)}`);
    const replay = await createBusiness();
    assert.equal(replay.status, 201);
    assert.equal(
      Number(
        (
          await db.get('SELECT COUNT(*) AS count FROM companies WHERE slug=?', [
            `worker-studio-${runId}`,
          ])
        ).count,
      ),
      1,
    );
    const route = await fetch(`${base}/app/login`, { headers: { 'Sec-Fetch-Mode': 'navigate' } });
    assert.equal(route.status, 200);
    assert.match(route.headers.get('content-type'), /text\/html/);
    const unknownApi = await fetch(`${base}/api/not-a-route`);
    assert.equal(unknownApi.status, 404);
    assert.match(unknownApi.headers.get('content-type'), /json/);
    const scheduled = await profiled('scheduled', () => fetch(`${base}/cdn-cgi/local/scheduled`));
    assert.equal(scheduled.status, 200);
    for (const [path, attempts] of [
      ['/api/auth/login', 22],
      ['/api/public/igor-barber-club/appointments', 45],
    ]) {
      let blocked = false;
      for (let index = 0; index < attempts; index++) {
        const response = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (response.status === 429) {
          blocked = true;
          assert.equal(response.headers.get('retry-after'), '60');
          break;
        }
        assert.ok(response.status >= 400 && response.status < 500, `${path}: ${response.status}`);
      }
      assert.ok(blocked, `${path}: rate limiter did not block repeated requests`);
    }
    console.log(
      'Worker + PostgreSQL descartável: health, login, sessão, agenda, cadastro, empresa, isolamento, SPA, cron e rate limiting aprovados.',
    );
    if (profileCpu) {
      await writeFile(
        resolve('test-results/worker-r3-cpu-local.json'),
        JSON.stringify(cpuSamples, null, 2),
      );
      console.log('Perfis de CPU locais gravados; amostragem indicativa, não métrica de produção.');
    }
  } finally {
    cpuProfiler?.close();
    worker.kill();
    await rm(devVars);
  }
} finally {
  await db.close();
}
