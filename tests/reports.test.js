import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertReportPeriods, assertReports } from './helpers/reports.js';
test('Gradefy reports: bounded server periods and CSV formula/escaping rules', assertReportPeriods);
test('Gradefy 7F.2C.2 SQLite historical reports, export, filters and large volume', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertReports(t, db);
});
