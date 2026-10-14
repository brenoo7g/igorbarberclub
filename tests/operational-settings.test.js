import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertSettingsMigration,
  assertOperationalSettings,
} from './helpers/operational-settings.js';
test('Gradefy 7F.3B SQLite operational settings and booking policy enforcement', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertSettingsMigration(t, db);
  await assertOperationalSettings(t, db);
});
