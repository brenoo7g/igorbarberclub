import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertMinisite } from './helpers/minisite.js';
test('Gradefy 7F.4A SQLite Mini Site lifecycle, uploads, publication, reservations and legacy', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertMinisite(t, db);
});
