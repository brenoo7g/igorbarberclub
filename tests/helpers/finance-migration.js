// Disposable test schemas only. Never exposed by application migrations.
import { migrations, readMigration } from '../../server/migrations.js';
export const financialTables = [
  'financial_payments',
  'financial_payment_reversals',
  'financial_expenses',
  'financial_expense_events',
];
export async function reconstructBeforeFinance(db) {
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=14'))) return;
  for (const name of [
    'financial_expense_events',
    'financial_payment_reversals',
    'financial_expenses',
    'financial_payments',
  ])
    await db.run('DROP TABLE ' + name);
  for (const sql of readMigration(migrations[12]).statements)
    if (sql.startsWith('-- dialect: ' + db.dialect) && sql.includes('idempotency'))
      await db.run(sql);
  await db.run('DELETE FROM schema_migrations WHERE version=14');
}
