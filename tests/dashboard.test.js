import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertDashboard } from './helpers/dashboard.js';
test('Gradefy 7F.1 SQLite dashboard, scoped metrics, timezone, trial and authorization', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertDashboard(t, db);
});
