import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertBarberClassic } from './helpers/barber-classic.js';
test('Gradefy 6 Barber Classic SQLite migration and public scope', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertBarberClassic(t, db);
});
