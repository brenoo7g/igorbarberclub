// Disposable test fixtures only, never an application rollback.
import { migrations, readMigration } from '../../server/migrations.js';
import { reconstructBeforeFinance } from './finance-migration.js';
export async function reconstructBeforeSiteEditor(db) {
  await reconstructBeforeAgenda(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=11'))) return;
  await db.run('DROP TABLE portfolio_assets');
  await db.run('DROP TABLE company_site_assets');
  await db.run('DROP INDEX portfolio_company_identity');
  await db.run('ALTER TABLE portfolio DROP COLUMN sort_order');
  await db.run('ALTER TABLE company_settings DROP COLUMN site_version');
  await db.run('ALTER TABLE company_settings DROP COLUMN sections_json');
  await db.run('DELETE FROM schema_migrations WHERE version=11');
}
export async function reconstructBeforeAgenda(db) {
  await reconstructBeforeFinance(db);
  if (await db.get('SELECT version FROM schema_migrations WHERE version=13')) {
    await db.run('DROP TABLE client_appointments');
    await db.run('DROP TABLE company_clients');
    await db.run('DELETE FROM schema_migrations WHERE version=13');
  }
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=12'))) return;
  await db.run('ALTER TABLE appointments DROP COLUMN notes');
  // Restore the actual pre-012 CHECK with the existing 010 SQL, keeping all old keys.
  for (const sql of readMigration(migrations[9]).statements)
    if (sql.startsWith('-- dialect: ' + db.dialect) && sql.includes('idempotency'))
      await db.run(sql);
  await db.run('DELETE FROM schema_migrations WHERE version=12');
}
