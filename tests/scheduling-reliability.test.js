import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertReliabilityMigration,
  assertSchedulingReliability,
} from './helpers/scheduling-reliability.js';

test('Gradefy 005 SQLite upgrade/rollback/checksum and scheduling contract (serialized SQLite writes)', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertReliabilityMigration(t, db);
  await assertSchedulingReliability(t, db);
});
