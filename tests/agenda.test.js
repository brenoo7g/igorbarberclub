import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../server/database.js';
import { assertAgenda, assertAgendaMigration } from './helpers/agenda.js';
test('Gradefy 7F.2A SQLite real managed agenda, migration and cross-connection races', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gradefy-agenda-'));
  const path = join(directory, 'test.sqlite'),
    db = await createDatabase('', path),
    second = await createDatabase('', path);
  t.after(async () => {
    await second.close();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  await assertAgendaMigration(t, db);
  await assertAgenda(t, db, second);
});
