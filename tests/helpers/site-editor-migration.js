// Disposable test fixtures only, never an application rollback.
export async function reconstructBeforeSiteEditor(db) {
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=11'))) return;
  await db.run('DROP TABLE portfolio_assets');
  await db.run('DROP TABLE company_site_assets');
  await db.run('DROP INDEX portfolio_company_identity');
  await db.run('ALTER TABLE portfolio DROP COLUMN sort_order');
  await db.run('ALTER TABLE company_settings DROP COLUMN site_version');
  await db.run('ALTER TABLE company_settings DROP COLUMN sections_json');
  await db.run('DELETE FROM schema_migrations WHERE version=11');
}
