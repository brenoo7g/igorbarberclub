import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertOperationalOnboarding,
  assertOperationalMigration,
} from './helpers/operational-onboarding.js';

test('Gradefy 7D.2 SQLite operational onboarding, atomic trial and unpublished site', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertOperationalMigration(db);
  await assertOperationalOnboarding(t, db);
});
