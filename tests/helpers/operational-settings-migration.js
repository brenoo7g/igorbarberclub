// Test-only reconstruction of pre-016 schemas, never a production rollback.
import { reconstructBeforeProfessionalPanel } from './professional-panel-migration.js';
export const operationalColumns = [
  'operational_version',
  'minimum_notice_minutes',
  'maximum_booking_days',
  'buffer_minutes',
  'cancel_notice_minutes',
  'reschedule_notice_minutes',
  'online_booking_enabled',
  'working_days_json',
];
export async function reconstructBeforeOperationalSettings(db) {
  await reconstructBeforeProfessionalPanel(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=16'))) return;
  for (const column of operationalColumns)
    await db.run('ALTER TABLE company_settings DROP COLUMN ' + column);
  await db.run('DELETE FROM schema_migrations WHERE version=16');
}
