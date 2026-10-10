import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { readPendingPlan, savePendingPlan } from '../src/gradefy/pending-plan.ts';

async function fixture(t) {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true, serveStatic: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, body, cookie) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const client = await request('/auth/login', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  return { db, request, cookie: client.cookie };
}
test('plan catalog exposes only active official commercial data and requires the existing session', async (t) => {
  const { db, request, cookie } = await fixture(t);
  assert.equal((await request('/plans')).status, 401);
  const catalog = await request('/plans', undefined, cookie);
  assert.deepEqual(catalog.data, [
    {
      code: 'individual',
      name: 'Individual',
      priceCents: 2299,
      currency: 'BRL',
      billingInterval: 'month',
      trialDays: 7,
      maxProfessionals: 1,
    },
    {
      code: 'team',
      name: 'Equipe',
      priceCents: 3299,
      currency: 'BRL',
      billingInterval: 'month',
      trialDays: 7,
      maxProfessionals: null,
    },
  ]);
  await db.run(
    "INSERT INTO plans(id,name,max_professionals,price_cents,created_at) VALUES('private','Internal',99,1,'2026')",
  );
  assert.equal((await request('/plans', undefined, cookie)).data.length, 2);
  await db.run("UPDATE plans SET active=0 WHERE id='team'");
  assert.deepEqual(
    (await request('/plans', undefined, cookie)).data.map((plan) => plan.code),
    ['individual'],
  );
  await db.run("UPDATE plans SET price_cents=NULL WHERE id='individual'");
  assert.deepEqual((await request('/plans', undefined, cookie)).data, []);
});
test('plan validation rejects tampering/inactive plans and repeated or concurrent choices never create business data or trial', async (t) => {
  const { db, request, cookie } = await fixture(t);
  const snapshot = async () =>
    Promise.all(
      ['companies', 'company_members', 'subscriptions', 'company_settings', 'plans'].map((table) =>
        db.all(`SELECT * FROM ${table} ORDER BY 1`),
      ),
    );
  const before = await snapshot();
  assert.equal(
    (await request('/onboarding/plan-selection', { planCode: 'individual' })).status,
    401,
  );
  for (const payload of [
    { planCode: 'unknown' },
    { planCode: 'private' },
    { planCode: 'individual', priceCents: 1 },
    { planCode: 'team', companyId: 'igor-barber-club' },
    {},
  ])
    assert.equal((await request('/onboarding/plan-selection', payload, cookie)).status, 400);
  for (const code of ['individual', 'team', 'individual']) {
    const validated = await request('/onboarding/plan-selection', { planCode: code }, cookie);
    assert.equal(validated.status, 200);
    assert.equal(validated.data.plan.priceCents, code === 'individual' ? 2299 : 3299);
  }
  const simultaneous = await Promise.all(
    Array.from({ length: 4 }, () =>
      request('/onboarding/plan-selection', { planCode: 'team' }, cookie),
    ),
  );
  assert.ok(simultaneous.every((result) => result.status === 200));
  assert.deepEqual(await snapshot(), before);
  const admin = await request('/auth/login', {
    email: 'admin@igorbarberclub.com.br',
    password: 'IgorDemo2026!',
  });
  const member = await request('/onboarding/plan-selection', { planCode: 'team' }, admin.cookie);
  assert.equal(member.status, 409);
  assert.equal(member.data.code, 'COMPANY_ALREADY_CONFIGURED');
  assert.deepEqual(await snapshot(), before);
  await db.run("UPDATE plans SET active=0 WHERE id='team'");
  const inactive = await request('/onboarding/plan-selection', { planCode: 'team' }, cookie);
  assert.equal(inactive.status, 409);
  assert.equal(inactive.data.code, 'PLAN_UNAVAILABLE');
  assert.equal(
    (await db.get("SELECT COUNT(*) AS n FROM subscriptions WHERE company_id='igor-barber-club'")).n,
    0,
  );
});
test('pending preference is user scoped, contains no price or trial, handles corrupt or denied storage', () => {
  const items = new Map();
  const storage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
  savePendingPlan('a', 'individual', storage);
  savePendingPlan('b', 'team', storage);
  assert.equal(readPendingPlan('a', storage), 'individual');
  assert.equal(readPendingPlan('b', storage), 'team');
  assert.equal(readPendingPlan('c', storage), null);
  savePendingPlan('a', 'team', storage);
  assert.deepEqual(JSON.parse(storage.getItem('gradefy:onboarding:v1:a')), {
    version: 1,
    planCode: 'team',
  });
  for (const value of [
    '{broken',
    '{"version":1,"planCode":"admin"}',
    '{"version":2,"planCode":"team"}',
    'null',
  ]) {
    storage.setItem('gradefy:onboarding:v1:a', value);
    assert.equal(readPendingPlan('a', storage), null);
  }
  const denied = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('full');
    },
    removeItem: () => {},
  };
  assert.equal(readPendingPlan('a', denied), null);
  assert.throws(() => savePendingPlan('a', 'team', denied), /Não foi possível/);
  assert.throws(() => savePendingPlan('a', 'invalid', storage), /disponível/);
});
