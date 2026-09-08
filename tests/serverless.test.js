import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { serverlessConfig } from '../server/serverless.js';
import handler from '../api/index.js';

test('Vercel rejects ephemeral storage and weak secrets before database initialization', () => {
  assert.throws(
    () => serverlessConfig({}),
    (error) => {
      assert.equal(error.code, 'SERVER_NOT_CONFIGURED');
      assert.deepEqual(error.missing, ['DATABASE_URL', 'JWT_SECRET', 'APP_URL']);
      return true;
    },
  );
  assert.throws(
    () =>
      serverlessConfig({
        DATABASE_URL: 'file:/tmp/barber.db',
        JWT_SECRET: 'short',
        APP_URL: 'http://localhost',
      }),
    { code: 'SERVER_NOT_CONFIGURED' },
  );
  const env = {
    POSTGRES_URL: 'postgresql://test:placeholder@db.example.com/barber',
    JWT_SECRET: 'test-only-secret-at-least-32-characters',
    VERCEL_PROJECT_PRODUCTION_URL: 'igorbarberclub.vercel.app',
  };
  assert.deepEqual(serverlessConfig(env), {
    databaseUrl: env.POSTGRES_URL,
    appUrl: 'https://igorbarberclub.vercel.app',
  });
  assert.equal(
    serverlessConfig({ ...env, APP_URL: 'https://barber.example.com' }).appUrl,
    'https://barber.example.com',
  );
});

test('deployed API adapter returns recoverable JSON errors rather than HTML or crashing', async (t) => {
  const keys = [
    'DATABASE_URL',
    'POSTGRES_URL',
    'JWT_SECRET',
    'APP_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'VERCEL_URL',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  t.mock.method(console, 'error', () => {});
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    '/api/health',
    '/api/services',
    '/api/availability?date=2026-09-20',
    '/api/auth/me',
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.code, 'SERVER_NOT_CONFIGURED');
    assert.match(body.error, /temporariamente indisponível/);
    if (path === '/api/health') assert.ok(body.missing.includes('DATABASE_URL'));
    else assert.equal('missing' in body, false);
  }
});
