import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertProfessionalAvailability,
  assertProfessionalAvailabilityMigration,
} from './helpers/professional-availability.js';
test('Gradefy 7F.3C.2 SQLite own schedule onboarding, authorization, recurrence and concurrency', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertProfessionalAvailabilityMigration(t, db);
  await assertProfessionalAvailability(t, db);
});
