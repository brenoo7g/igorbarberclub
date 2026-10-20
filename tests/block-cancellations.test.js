import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertBlockCancellations,
  assertBlockCancellationMigration,
} from './helpers/block-cancellations.js';
test('Gradefy 7F.4A.4 SQLite explicit block cancellation, outbox, isolation and concurrency', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertBlockCancellationMigration(t, db);
  await assertBlockCancellations(t, db);
});
