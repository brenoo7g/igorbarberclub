import {
  assertReliabilityMigration,
  assertSchedulingReliability,
} from '../helpers/scheduling-reliability.js';

// Only called after run-local.mjs and foundation.test.js validate the disposable cluster.
export async function assertPostgresScheduling(t, db, second) {
  await assertReliabilityMigration(t, db);
  await assertSchedulingReliability(t, db, second, 10);
}
