import test from 'node:test';
import { createDatabase } from '../server/database.js';
import { assertEmailDelivery, assertEmailMigration } from './helpers/email-delivery.js';
test('Gradefy Resend SQLite: migration, delivery policy, audit and signed webhooks', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assertEmailMigration(t, db);
  await assertEmailDelivery(t, db);
});
