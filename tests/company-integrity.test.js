import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createDatabase } from '../server/database.js';
import { readMigration, migrations, runMigrations } from '../server/migrations.js';
import { bootstrapIgorCompany } from '../server/company-bootstrap.js';
import { assertFoundationIntegrity, snapshotFoundation } from './helpers/foundation-integrity.js';

function phaseOne(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'));
  // Original journal definition, including the INTEGER PRIMARY KEY rowid alias.
  sqlite.exec(
    'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY CHECK(version>0),name TEXT NOT NULL,checksum TEXT NOT NULL CHECK(length(checksum)=64),applied_at TEXT NOT NULL)',
  );
  const original = readMigration(migrations[0]);
  for (const statement of original.statements) sqlite.exec(statement);
  sqlite
    .prepare('INSERT INTO schema_migrations VALUES(?,?,?,?)')
    .run(1, original.name, original.checksum, '2026-01-01');
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
        const result = await fn(tx);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, db };
}

test('Gradefy integrity: SQLite rejects NULL identifiers, missing FKs and fractional counters in every foundation table', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertFoundationIntegrity(db);
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
});

test('Gradefy integrity: upgrade from checksummed 001 preserves all data and is repeatable with FKs enabled', async (t) => {
  const { db } = phaseOne(t);
  await bootstrapIgorCompany(db);
  await db.run(
    "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('old-admin','Antigo','old@example.test','21999998888','old-hash','admin','2025-01-01')",
  );
  await bootstrapIgorCompany(db);
  await db.run("UPDATE company_members SET role='owner',status='inactive'");
  await db.run("UPDATE company_settings SET city='Editada',version=8");
  await db.run(
    "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES('manual','igor-barber-club','team','active','manual','2025-01-01','2025-01-01')",
  );
  const before = await snapshotFoundation(db);
  assert.deepEqual(await runMigrations(db), [2, 3, 4]);
  const after = await snapshotFoundation(db);
  assert.deepEqual(after.schema_migrations[0], before.schema_migrations[0]);
  delete after.schema_migrations;
  delete before.schema_migrations;
  assert.deepEqual(after, before);
  const repeated = await snapshotFoundation(db);
  assert.deepEqual(await runMigrations(db), []);
  await bootstrapIgorCompany(db);
  assert.deepEqual(await snapshotFoundation(db), repeated);
  assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
});

test('Gradefy integrity: existing NULL, orphan, fractional value or custom index aborts without data loss or journal 002', async (t) => {
  const cases = [
    "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(NULL,'old-null','Inválida','barbershop','barber-classic','2025','2025')",
    "UPDATE plans SET max_professionals=1.5 WHERE id='team'",
    "UPDATE company_settings SET company_id='missing'",
    'CREATE INDEX custom_company_name ON companies(name)',
    'ALTER TABLE companies ADD COLUMN custom_note TEXT',
  ];
  for (const sql of cases)
    await t.test(sql.split(' ')[0] + ' ' + cases.indexOf(sql), async (t) => {
      const { sqlite, db } = phaseOne(t);
      await bootstrapIgorCompany(db);
      sqlite.exec('PRAGMA foreign_keys=OFF');
      sqlite.exec(sql);
      const before = await snapshotFoundation(db);
      const schemaBefore = await db.all('SELECT type,name,sql FROM sqlite_schema ORDER BY name');
      await assert.rejects(runMigrations(db));
      assert.deepEqual(await snapshotFoundation(db), before);
      assert.deepEqual(
        await db.all('SELECT type,name,sql FROM sqlite_schema ORDER BY name'),
        schemaBefore,
      );
    });
});

test('Gradefy integrity: failure after SQLite table replacement rolls back schema, indexes, data and journal', async (t) => {
  const { db } = phaseOne(t);
  await bootstrapIgorCompany(db);
  const before = await snapshotFoundation(db);
  const schema = await db.all('SELECT type,name,sql FROM sqlite_schema ORDER BY name');
  const fail = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: async (sql, args) => {
            if (sql.startsWith('ALTER TABLE gradefy_002_company_settings'))
              throw new Error('simulated 002 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(fail), /simulated 002 failure/);
  assert.deepEqual(await snapshotFoundation(db), before);
  assert.deepEqual(await db.all('SELECT type,name,sql FROM sqlite_schema ORDER BY name'), schema);
  assert.deepEqual(await runMigrations(db), [2, 3, 4]);
});
