import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { assertAccessMigration } from './helpers/access-migration.js';

test('Gradefy 004 SQLite: upgrade, rollback, preservation and idempotence', async (t) => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  t.after(() => sqlite.close());
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
  await assertAccessMigration(t, db);
});
