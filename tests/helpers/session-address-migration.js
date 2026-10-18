// Disposable test reconstruction only. Never imported by the application.
import { reconstructBeforeProfessionalAvailability } from './professional-availability-migration.js';
export const addressColumns = [
  'postal_code',
  'street',
  'neighborhood',
  'address_number',
  'address_complement',
];
export async function reconstructBeforeSessionAddress(db) {
  await reconstructBeforeProfessionalAvailability(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=18'))) return;
  await db.run('DROP TABLE company_invitation_professionals');
  for (const column of addressColumns)
    await db.run('ALTER TABLE company_settings DROP COLUMN ' + column);
  await db.run('DELETE FROM schema_migrations WHERE version=18');
}
