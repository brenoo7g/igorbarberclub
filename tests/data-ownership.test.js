import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../server/database.js';
import { seed } from '../server/seed.js';
import { runMigrations } from '../server/migrations.js';
import { ownedTables } from '../server/data-ownership.js';
import { IGOR_COMPANY_ID } from '../server/company-bootstrap.js';
import {
  installOwnershipFixture,
  assertOwnershipUpgrade,
  assertOwnershipConstraints,
  ownershipSnapshot,
} from './helpers/data-ownership.js';

function rawDatabase(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  const tx = {
    dialect: 'sqlite',
    all: async (sql, args = []) => sqlite.prepare(sql).all(...args),
    get: async (sql, args = []) => sqlite.prepare(sql).get(...args),
    run: async (sql, args = []) => sqlite.prepare(sql).run(...args),
  };
  const db = {
    ...tx,
    transaction: async (fn) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const value = await fn(tx);
        sqlite.exec('COMMIT');
        return value;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}
test('Gradefy 2A SQLite: 13-table backfill, nonzero finance, full preservation, explicit ownership and relational constraints', async (t) => {
  const { db } = rawDatabase(t);
  await installOwnershipFixture(db);
  await assertOwnershipUpgrade(db);
  await assertOwnershipConstraints(db);
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
  assert.ok(await db.get("SELECT name FROM sqlite_schema WHERE name='legacy_extra_index'"));
});
test('Gradefy 2A SQLite: missing Igor or inconsistent identity/references fails without silent repair', async (t) => {
  for (const change of ['missing', 'slug', 'orphan', 'null-key'])
    await t.test(change, async (t) => {
      const { db, sqlite } = rawDatabase(t);
      await installOwnershipFixture(db);
      sqlite.exec('PRAGMA foreign_keys=OFF');
      if (change === 'missing') await db.run('DELETE FROM companies');
      if (change === 'slug') await db.run("UPDATE companies SET slug='unexpected'");
      if (change === 'orphan') await db.run("UPDATE appointment_services SET service_id='missing'");
      if (change === 'null-key') await db.run('UPDATE portfolio SET id=NULL');
      const before = await ownershipSnapshot(db);
      const schema = await db.all('SELECT name,sql FROM sqlite_schema ORDER BY name');
      await assert.rejects(runMigrations(db), /Gradefy 003/);
      assert.deepEqual(await ownershipSnapshot(db), before);
      assert.deepEqual(await db.all('SELECT name,sql FROM sqlite_schema ORDER BY name'), schema);
    });
});
test('Gradefy 2A SQLite: failure after table replacement rolls back all ownership changes and preserves 001/002', async (t) => {
  const { db } = rawDatabase(t);
  await installOwnershipFixture(db);
  const before = await ownershipSnapshot(db);
  const schema = await db.all('SELECT name,sql FROM sqlite_schema ORDER BY name');
  const failing = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: async (sql, args) => {
            if (sql.startsWith('ALTER TABLE gradefy_003_notifications'))
              throw new Error('deliberate 003 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(failing), /deliberate 003 failure/);
  assert.deepEqual(await ownershipSnapshot(db), before);
  assert.deepEqual(await db.all('SELECT name,sql FROM sqlite_schema ORDER BY name'), schema);
  await assertOwnershipUpgrade(db);
});
test('Gradefy 2A SQLite: empty installation, seed and bootstrap keep every operational row owned by Igor', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await seed(db);
  await seed(db);
  assert.deepEqual(
    (await db.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version),
    [1, 2, 3],
  );
  for (const table of ownedTables)
    assert.equal(
      Number(
        (
          await db.get(
            `SELECT COUNT(*) AS count FROM ${table} WHERE company_id IS NULL OR company_id<>?`,
            [IGOR_COMPANY_ID],
          )
        ).count,
      ),
      0,
    );
});
