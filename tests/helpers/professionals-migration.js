import {
  expectBarberClassicMetadata,
  reconstructBeforeBarberClassic,
} from './barber-classic-migration.js';
import assert from 'node:assert/strict';
import { migrations, readMigration, runMigrations } from '../../server/migrations.js';

// Test-only reconstruction of 005 in an EMPTY disposable subscription fixture.
export async function reconstructPhaseFive(db) {
  await reconstructBeforeBarberClassic(db);
  assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM subscriptions')).n), 0);
  await db.run('DROP TABLE professional_users');
  await db.run('DROP TABLE barber_services');
  await db.run('DROP TABLE subscriptions');
  for (const field of ['price_cents', 'currency', 'billing_interval', 'trial_days'])
    await db.run(`ALTER TABLE plans DROP COLUMN ${field}`);
  const old = readMigration(migrations[0]).statements.find((s) =>
    s.startsWith('CREATE TABLE subscriptions'),
  );
  await db.run(old.replace('id TEXT PRIMARY KEY', 'id TEXT NOT NULL PRIMARY KEY'));
  await db.run(
    "CREATE UNIQUE INDEX subscriptions_one_current_per_company ON subscriptions(company_id) WHERE status IN ('pending','active')",
  );
  await db.run('DELETE FROM schema_migrations WHERE version>=6');
}

export function expectProfessionalMetadata(before) {
  expectBarberClassicMetadata(before);
  for (const row of before.plans || [])
    if (!('price_cents' in row)) {
      Object.assign(row, {
        price_cents: row.id === 'individual' ? 2299 : row.id === 'team' ? 3299 : null,
        currency: 'BRL',
        billing_interval: 'month',
        trial_days: 7,
      });
      if (row.id === 'individual') Object.assign(row, { name: 'Individual', max_professionals: 1 });
      if (row.id === 'team') Object.assign(row, { name: 'Equipe', max_professionals: null });
    }
  for (const row of before.subscriptions || [])
    if (!('trial_started_at' in row))
      Object.assign(row, { trial_started_at: null, trial_ends_at: null });
}

export async function assertProfessionalsMigration(t, db) {
  await reconstructPhaseFive(db);
  await db.run(
    "INSERT INTO barbers(company_id,id,name,specialty) VALUES('igor-barber-club','phase5-legacy','Legado','Teste')",
  );
  await db.run(
    "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES('igor-barber-club','phase5-service','Legado','Legado',40,1234,'Corte')",
  );
  await db.run(
    "INSERT INTO services(company_id,id,name,description,duration,price,category,active) VALUES('igor-barber-club','phase5-inactive','Inativo','Legado',40,1234,'Corte',0)",
  );
  await db.run(
    "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES('phase5-historical','igor-barber-club','team','cancelled','manual','2025','2025')",
  );
  await db.run('CREATE INDEX subscriptions_custom_history ON subscriptions(created_at)');
  const snapshot = async () =>
    JSON.parse(
      JSON.stringify({
        history: await db.all('SELECT * FROM schema_migrations ORDER BY version'),
        professionals: await db.all('SELECT * FROM barbers ORDER BY id'),
        services: await db.all('SELECT * FROM services ORDER BY id'),
        subscriptions: await db.all('SELECT * FROM subscriptions ORDER BY id'),
        plans: await db.all('SELECT * FROM plans ORDER BY id'),
      }),
    );
  const before = await snapshot();
  if (db.dialect === 'sqlite') {
    await db.run(
      'CREATE TABLE custom_subscription_child(id TEXT NOT NULL PRIMARY KEY,subscription_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE)',
    );
    await db.run("INSERT INTO custom_subscription_child VALUES('preserve','phase5-historical')");
    await assert.rejects(runMigrations(db), /dependência externa/);
    assert.equal((await db.get('SELECT id FROM custom_subscription_child')).id, 'preserve');
    assert.deepEqual(await snapshot(), before);
    await db.run('DROP TABLE custom_subscription_child');
    await db.run('ALTER TABLE subscriptions ADD COLUMN custom_value TEXT');
    await assert.rejects(runMigrations(db), /colunas adicionais/);
    await db.run('ALTER TABLE subscriptions DROP COLUMN custom_value');
    assert.deepEqual(await snapshot(), before);
  }
  const failing = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('CREATE TABLE professional_users'))
              throw new Error('injected 006 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(failing), /injected 006 failure/);
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(db.all('SELECT * FROM barber_services'));
  assert.deepEqual(await runMigrations(db), [6, 7, 8, 9, 10, 11]);
  const after = await snapshot();
  expectProfessionalMetadata(before);
  assert.deepEqual(after.history.slice(0, 5), before.history);
  after.history = before.history;
  assert.deepEqual(after, before);
  assert.equal(
    (await db.all("SELECT * FROM barber_services WHERE barber_id='phase5-legacy'")).length,
    1,
  );
  assert.equal(
    (await db.get("SELECT service_id FROM barber_services WHERE barber_id='phase5-legacy'"))
      .service_id,
    'phase5-service',
  );
  const stable = await snapshot();
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(await snapshot(), stable);
  const checksum = (await db.get('SELECT checksum FROM schema_migrations WHERE version=6'))
    .checksum;
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=6', ['0'.repeat(64)]);
  await assert.rejects(runMigrations(db), /Histórico/);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=6', [checksum]);
  const indexes =
    db.dialect === 'postgres'
      ? await db.all("SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'")
      : await db.all("SELECT name FROM sqlite_schema WHERE type='index'");
  assert.ok(indexes.some((i) => i.name === 'subscriptions_custom_history'));
  t.diagnostic(
    '006: populated 005 upgrade, exact legacy preservation, catalog metadata, rollback, repeat and checksum passed',
  );
}
