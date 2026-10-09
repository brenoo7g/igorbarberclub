import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertProfessionalIdempotency } from './helpers/professional-idempotency.js';
test('Gradefy 5.1 professional persistent idempotency SQLite', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertProfessionalIdempotency(t, db);
});
