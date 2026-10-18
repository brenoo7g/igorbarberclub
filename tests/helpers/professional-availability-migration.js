// Disposable reconstruction only. Never imported by application boot or migrations.
import { migrations, readMigration } from '../../server/migrations.js';
import { reconstructBeforeMinisite } from './minisite-migration.js';
export async function reconstructBeforeProfessionalAvailability(db) {
  await reconstructBeforeMinisite(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=19'))) return;
  await db.run('DROP TABLE professional_personal_blocks');
  await db.run('DROP INDEX blocks_company_identity');
  for (const sql of readMigration(migrations[13]).statements)
    if (sql.startsWith('-- dialect: ' + db.dialect) && sql.includes('idempotency'))
      await db.run(sql);
  await db.run('DELETE FROM schema_migrations WHERE version=19');
}
