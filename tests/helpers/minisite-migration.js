// Only disposable schema reconstruction. Never used in application startup.
import { reconstructBeforeBlockCancellation } from './block-cancellation-migration.js';
export async function reconstructBeforeMinisite(db) {
  await reconstructBeforeBlockCancellation(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=20'))) return;
  await db.run("DELETE FROM templates WHERE id='gradefy-minisite'");
  await db.run('DELETE FROM schema_migrations WHERE version=20');
}
