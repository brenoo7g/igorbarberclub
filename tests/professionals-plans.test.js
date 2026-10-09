import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertProfessionalsMigration } from './helpers/professionals-migration.js';
import { assertProfessionalsPlans } from './helpers/professionals-plans.js';
test('Gradefy 006 SQLite: migration and professionals/plans contract', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertProfessionalsMigration(t, db);
  await assertProfessionalsPlans(t, db);
});
