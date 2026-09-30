import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database.js';
import { assertApplicationContext, secondCompanySql } from './helpers/application-context.js';
import { assertMultitenantAccess } from './helpers/multitenant-access.js';

test('Gradefy 2B/3 SQLite: data context and multitenant attack contract', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  assert.equal(db.ephemeral, true);
  await db.run(secondCompanySql);
  await assertApplicationContext(t, db);
  await assertMultitenantAccess(t, db);
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
});
