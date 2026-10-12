import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase } from '../server/database.js';
import { assertFinanceMigration, assertFinance, assertFinancialDates } from './helpers/finance.js';
test(
  'Gradefy financial local times reject invalid, future and ambiguous dates',
  assertFinancialDates,
);
test('Gradefy 7F.2C.1 SQLite finance, additive migration, integer money and connection races', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'gradefy-finance-')),
    path = join(dir, 'db.sqlite'),
    db = await createDatabase('', path),
    second = await createDatabase('', path);
  t.after(async () => {
    await second.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });
  await assertFinanceMigration(t, db);
  await assertFinance(t, db, second);
});
