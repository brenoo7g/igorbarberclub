import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database.js';
import { assertApplicationContext, secondCompanySql } from './helpers/application-context.js';

test('Gradefy 2B SQLite: application company context contract', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  assert.equal(db.ephemeral, true);
  await assert.rejects(db.run(secondCompanySql), /CHECK/);
  // Test fixture only: allow B's insertion on this in-memory connection, then
  // immediately restore CHECK enforcement. Production schema stays untouched.
  await db.run('PRAGMA ignore_check_constraints=ON');
  try {
    await db.run(secondCompanySql);
  } finally {
    await db.run('PRAGMA ignore_check_constraints=OFF');
  }
  await assert.rejects(
    db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES('third','third','Third','barbershop','barber-classic','2026','2026')",
    ),
    /CHECK/,
  );
  await assertApplicationContext(t, db);
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
});
