import assert from 'node:assert/strict';
import { installOwnershipFixture } from './data-ownership.js';
import {
  prepareDataOwnership,
  finishDataOwnership,
  ownedTables,
} from '../../server/data-ownership.js';
import { migrations, readMigration, runMigrations } from '../../server/migrations.js';
import { IGOR_COMPANY_ID, bootstrapIgorCompany } from '../../server/company-bootstrap.js';

export async function assertAccessMigration(t, db) {
  await installOwnershipFixture(db);
  // Construct a real checksummed 003 installation without modifying any migration.
  await db.transaction(async (tx) => {
    const migration = readMigration(migrations[2]);
    const state = await prepareDataOwnership(tx);
    for (let sql of migration.statements) {
      const dialect = sql.match(/^-- dialect: (sqlite|postgres)\n/);
      if (dialect && dialect[1] !== tx.dialect) continue;
      if (dialect) sql = sql.slice(dialect[0].length);
      await tx.run(sql, sql.startsWith('-- igor-backfill\n') ? [IGOR_COMPANY_ID] : []);
    }
    await finishDataOwnership(tx, state);
    await tx.run('INSERT INTO schema_migrations VALUES(?,?,?,?)', [
      3,
      migration.name,
      migration.checksum,
      '2026',
    ]);
  });
  const addCompany =
    "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES('migration-b','migration-b','Fixture','barbershop','barber-classic','2026','2026')";
  await assert.rejects(db.run(addCompany));
  await db.run("UPDATE company_members SET status='inactive'");
  for (const [id, role] of [
    ['migration-owner', 'owner'],
    ['migration-pro', 'professional'],
  ]) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999999999','fixture','client','2026')",
      [id, id, `${id}@example.test`],
    );
    await db.run(
      'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
      [IGOR_COMPANY_ID, id, role, '2026'],
    );
  }
  await db.run('CREATE INDEX custom_company_name_access ON companies(name)');
  const snapshot = async () => {
    const result = {};
    for (const table of [
      ...ownedTables,
      'companies',
      'company_members',
      'company_settings',
      'subscriptions',
      'schema_migrations',
      'users',
    ])
      result[table] = JSON.parse(JSON.stringify(await db.all(`SELECT * FROM ${table}`))).sort(
        (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)),
      );
    return result;
  };
  const before = await snapshot();
  const failing = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: async (sql, args) => {
            if (sql.startsWith('CREATE INDEX company_members_active_user'))
              throw new Error('simulated 004 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(failing), /simulated 004 failure/);
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(db.run(addCompany));
  assert.deepEqual(await runMigrations(db), [4]);
  const after = await snapshot();
  assert.deepEqual(after.schema_migrations.slice(0, 3), before.schema_migrations);
  delete after.schema_migrations;
  delete before.schema_migrations;
  before.company_members = before.company_members.map((row) => ({
    ...row,
    role: row.role === 'admin' ? 'manager' : row.role,
  }));
  assert.deepEqual(after, before);
  assert.deepEqual(await runMigrations(db), []);
  await bootstrapIgorCompany(db);
  assert.deepEqual((await snapshot()).company_members, after.company_members);
  await db.run(addCompany);
  assert.deepEqual(await runMigrations(db), []);
  for (const role of ['admin', 'root', 'superadmin', ''])
    await assert.rejects(
      db.run('UPDATE company_members SET role=? WHERE user_id=?', [role, 'migration-pro']),
    );
  await assert.rejects(db.run("UPDATE company_members SET status='removed'"));
  await assert.rejects(db.run("UPDATE companies SET id=NULL WHERE id='migration-b'"));
  const indexes =
    db.dialect === 'sqlite'
      ? await db.all("SELECT name FROM sqlite_schema WHERE type='index'")
      : await db.all("SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'");
  assert.ok(indexes.some((i) => i.name === 'custom_company_name_access'));
  assert.ok(indexes.some((i) => i.name === 'company_members_active_user'));
  if (db.dialect === 'sqlite') assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
  t.diagnostic(
    '004: upgrade from 003, rollback, checksum preservation, role/status preservation, custom index and repeated execution passed',
  );
}
