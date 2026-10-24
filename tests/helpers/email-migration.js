// Test-only reconstruction. Never imported by application startup.
export async function reconstructBeforeEmailDelivery(db) {
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=22'))) return;
  for (const name of ['email_delivery_attempts', 'email_deliveries', 'email_webhook_events'])
    await db.run(`DROP TABLE ${name}`);
  for (const table of ['notifications', 'password_recovery'])
    await db.run(`ALTER TABLE ${table} DROP COLUMN email_delivery_scope`);
  await db.run('DELETE FROM schema_migrations WHERE version=22');
}
