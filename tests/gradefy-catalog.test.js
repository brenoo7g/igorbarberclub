import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import {
  savePendingPlan,
  readPendingSelection,
  savePendingNiche,
  savePendingTemplate,
} from '../src/gradefy/pending-plan.ts';

test('onboarding catalog is authenticated, real, active, implemented and read-only; invalid combinations are refused', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true, serveStatic: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const call = async (path, body, cookie) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  };
  assert.equal((await call('/onboarding/catalog')).status, 401);
  const { cookie } = await call('/auth/login', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  const catalog = await call('/onboarding/catalog', undefined, cookie);
  assert.equal(catalog.status, 200);
  assert.deepEqual(
    catalog.data.niches.map((item) => item.code),
    ['barbershop'],
  );
  assert.deepEqual(catalog.data.templates, [
    { code: 'barber-classic', name: 'Barber Classic', nicheCode: 'barbershop' },
  ]);
  const snapshot = () =>
    Promise.all(
      [
        'companies',
        'company_members',
        'subscriptions',
        'company_settings',
        'niches',
        'templates',
      ].map((table) => db.all(`SELECT * FROM ${table} ORDER BY 1`)),
    );
  const before = await snapshot();
  const valid = { planCode: 'individual', nicheCode: 'barbershop', templateCode: 'barber-classic' };
  assert.equal((await call('/onboarding/template-selection', valid)).status, 401);
  assert.equal(
    (
      await call(
        '/onboarding/niche-selection',
        { planCode: 'team', nicheCode: 'barbershop' },
        cookie,
      )
    ).status,
    200,
  );
  for (const data of [valid, valid])
    assert.equal((await call('/onboarding/template-selection', data, cookie)).status, 200);
  for (const data of [
    { ...valid, nicheCode: 'salon' },
    { ...valid, templateCode: 'fake' },
    { ...valid, planCode: 'fake' },
    { ...valid, companyId: 'igor-barber-club' },
  ])
    assert.ok(
      [400, 409].includes((await call('/onboarding/template-selection', data, cookie)).status),
    );
  assert.deepEqual(await snapshot(), before);
  const owner = await call('/auth/login', {
    email: 'admin@igorbarberclub.com.br',
    password: 'IgorDemo2026!',
  });
  assert.equal(
    (await call('/onboarding/template-selection', valid, owner.cookie)).data.code,
    'COMPANY_ALREADY_CONFIGURED',
  );
  await db.run(
    "INSERT INTO templates(id,niche_id,name,created_at) VALUES('unimplemented','barbershop','Hidden','2026')",
  );
  assert.equal((await call('/onboarding/catalog', undefined, cookie)).data.templates.length, 1);
  await db.run("UPDATE templates SET active=0 WHERE id='barber-classic'");
  assert.deepEqual((await call('/onboarding/catalog', undefined, cookie)).data, {
    niches: [],
    templates: [],
  });
  assert.equal((await call('/onboarding/template-selection', valid, cookie)).status, 409);
  await db.run("UPDATE templates SET active=1 WHERE id='barber-classic'");
  await db.run("UPDATE niches SET active=0 WHERE id='barbershop'");
  assert.equal(
    (
      await call(
        '/onboarding/niche-selection',
        { planCode: 'individual', nicheCode: 'barbershop' },
        cookie,
      )
    ).status,
    409,
  );
});

test('the same per-user draft preserves plan and compatible selections and drops a template on niche change', () => {
  const items = new Map();
  const store = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
    removeItem: (key) => items.delete(key),
  };
  savePendingPlan('a', 'individual', store);
  savePendingNiche('a', 'barbershop', store);
  savePendingTemplate('a', 'barbershop', 'barber-classic', store);
  savePendingPlan('a', 'team', store);
  savePendingNiche('a', 'barbershop', store);
  assert.deepEqual(readPendingSelection('a', store), {
    version: 1,
    planCode: 'team',
    nicheCode: 'barbershop',
    templateCode: 'barber-classic',
  });
  assert.equal(readPendingSelection('b', store), null);
  savePendingNiche('a', 'future', store);
  assert.equal(readPendingSelection('a', store).templateCode, undefined);
  assert.equal(readPendingSelection('a', store).planCode, 'team');
  assert.throws(() => savePendingTemplate('a', 'barbershop', 'barber-classic', store), /segmento/);
  assert.throws(() => savePendingNiche('b', 'barbershop', store), /plano/);
});
