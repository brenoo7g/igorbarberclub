// Disposable schema reconstruction only. Never imported by application startup.
import { reconstructBeforeEmailDelivery } from './email-migration.js';
export async function reconstructBeforeBlockCancellation(db) {
  await reconstructBeforeEmailDelivery(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=21'))) return;
  await db.run('DROP TABLE agenda_block_cancellations');
  await db.run('DROP TABLE agenda_block_operations');
  await db.run('DROP INDEX notification_company_identity');
  await db.run('ALTER TABLE notifications DROP COLUMN provider_message_id');
  await db.run('ALTER TABLE notifications DROP COLUMN submitted_at');
  await db.run('ALTER TABLE appointments DROP COLUMN cancellation_reason');
  await db.run('DELETE FROM schema_migrations WHERE version=21');
}
