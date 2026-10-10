import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertCompanyOnboarding,
  assertOnboardingMigration,
} from './helpers/company-onboarding.js';

test('Gradefy 7D.1 SQLite company creation, idempotency, concurrency, integrity and isolation', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertOnboardingMigration(t, db);
  await assertCompanyOnboarding(t, db);
});
