import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertSitePublication } from './helpers/site-publication.js';
test('Gradefy 7E.2 SQLite private preview, publication, reservations and isolation', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertSitePublication(t, db);
});
