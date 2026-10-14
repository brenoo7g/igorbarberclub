import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertTeamMigration, assertTeam } from './helpers/team.js';
test('Gradefy 7F.3A SQLite invitations, permissions, transactions and revocation', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertTeamMigration(t, db);
  await assertTeam(t, db);
});
