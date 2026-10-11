import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../server/database.js';
import { assertBusinessManagement, assertClientMigration } from './helpers/business-management.js';
test('Gradefy 7F.2B SQLite business management, additive migration and connection races', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gradefy-business-')),
    path = join(directory, 'test.sqlite'),
    db = await createDatabase('', path),
    second = await createDatabase('', path);
  t.after(async () => {
    await second.close();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  await assertClientMigration(t, db);
  await assertBusinessManagement(t, db, second);
});
