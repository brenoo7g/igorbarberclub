import test from 'node:test';
import { createDatabase } from '../server/database.js';
import {
  assertProfessionalPanelMigration,
  assertProfessionalPanel,
} from './helpers/professional-panel.js';
test('Gradefy 7F.3C SQLite professional links, own agenda and transactional completion', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertProfessionalPanelMigration(t, db);
  await assertProfessionalPanel(t, db);
});
