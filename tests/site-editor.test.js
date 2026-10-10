import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database.js';
import { assertSiteEditor } from './helpers/site-editor.js';
import { createSiteStorage } from '../server/site-storage.js';
test('Gradefy 7E.1 SQLite editor, tenant isolation, uploads, concurrency and legacy', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertSiteEditor(t, db);
});
test('private storage adapter uses configured origin and secret only server-side, rejects public buckets', async () => {
  assert.equal(createSiteStorage({}), null);
  const env = {
    SITE_STORAGE_PROVIDER: 'supabase',
    SITE_STORAGE_URL: 'https://disposable.example.test',
    SITE_STORAGE_SERVICE_KEY: 'test-only-secret',
    SITE_STORAGE_BUCKET: 'private-site',
  };
  const calls = [];
  const storage = createSiteStorage(env, async (url, options) => {
    calls.push({ url, options });
    return new Response(
      url.includes('/bucket/')
        ? JSON.stringify({ public: false })
        : url.includes('/authenticated/')
          ? 'webp'
          : '{}',
    );
  });
  await storage.put('companies/test/image.webp', Buffer.from('webp'));
  await storage.read('companies/test/image.webp');
  await storage.remove('companies/test/image.webp');
  assert.equal(calls.length, 6);
  assert.ok(
    calls.every(
      (c) =>
        c.url.startsWith('https://disposable.example.test/storage/v1/') &&
        c.options.headers.Authorization === 'Bearer test-only-secret',
    ),
  );
  assert.equal(calls[1].options.headers['x-upsert'], 'false');
  assert.equal(
    calls[3].url,
    'https://disposable.example.test/storage/v1/object/authenticated/private-site/companies/test/image.webp',
  );
  const publicStorage = createSiteStorage(
    env,
    async () => new Response(JSON.stringify({ public: true })),
  );
  await assert.rejects(
    publicStorage.put('test', Buffer.from('test')),
    (e) => e.code === 'PRIVATE_STORAGE_REQUIRED',
  );
});
