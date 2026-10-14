// Disposable test reconstruction only, never a production rollback.
import { reconstructBeforeOperationalSettings } from './operational-settings-migration.js';
export const teamTables = [
  'company_access_events',
  'company_invitations',
  'company_invitation_limits',
];
export async function reconstructBeforeTeam(db) {
  await reconstructBeforeOperationalSettings(db);
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=15'))) return;
  for (const table of teamTables) await db.run('DROP TABLE ' + table);
  await db.run('DELETE FROM schema_migrations WHERE version=15');
}
