import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { runMigrations } from '../server/migrations.js';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const legacySchema = readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8');
const legacyTables = [...legacySchema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
  (m) => m[1],
);
const foundationTables = [
  'schema_migrations',
  'companies',
  'company_members',
  'company_settings',
  'niches',
  'templates',
  'plans',
  'subscriptions',
];
const plain = (value) => JSON.parse(JSON.stringify(value));
async function snapshot(db, tables) {
  const result = {};
  for (const table of tables) result[table] = plain(await db.all(`SELECT * FROM ${table}`));
  return result;
}

test('Gradefy migration: repeat initialization preserves every legacy table, IDs and JWT session', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'gradefy-legacy-'));
  const path = join(directory, 'legacy.db');
  let db;
  t.after(async () => {
    if (db) await db.close();
    const relativePath = relative(resolve(tmpdir()), resolve(directory));
    assert.ok(
      !isAbsolute(relativePath) &&
        !relativePath.startsWith('..') &&
        relativePath.startsWith('gradefy-legacy-'),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const old = new DatabaseSync(path);
  old.exec(legacySchema);
  old.exec(`
    INSERT INTO users (id,name,email,phone,password_hash,avatar,profile_version,session_version,role,created_at)
      VALUES ('legacy-admin','Nome editado','changed@example.com','21988887777','preserve-hash','preserve-avatar',4,7,'admin','2025-01-01');
    INSERT INTO barbers VALUES ('igor','Igor editado','Especialidade editada',1);
    INSERT INTO services VALUES ('corte','Corte editado','Descrição',40,4321,'Categoria',1);
    INSERT INTO services VALUES ('combo','Combo antigo','Descrição',80,8000,'Categoria',0);
    INSERT INTO portfolio VALUES ('igor-corte-1','Foto editada','Categoria','preserve-image',3,'2025-01-01');
    INSERT INTO content_migrations VALUES ('igor-real-portfolio-2026-09-10');
    INSERT INTO barber_settings VALUES ('igor','manual',15,6);
    INSERT INTO barber_working_hours VALUES ('igor',2,1,'09:00','19:00','12:20','14:00');
    INSERT INTO barber_working_breaks VALUES ('igor',2,1,'16:00','16:20');
    INSERT INTO released_weeks VALUES ('igor','2030-01-07','2030-01-08','2030-01-08','2025-01-01');
    INSERT INTO appointments (id,user_id,barber_id,date,start_minute,end_minute,total,status,created_at)
      VALUES ('legacy-booking','legacy-admin','igor','2030-01-08',540,620,8000,'confirmed','2025-01-01');
    INSERT INTO appointment_services VALUES ('legacy-booking','combo','Snapshot antigo',8000,80);
    INSERT INTO appointments (id,guest_name,guest_email,guest_phone,barber_id,date,start_minute,end_minute,total,status,created_at)
      VALUES ('legacy-guest','Cliente Antigo','guest@example.com','21977776666','igor','2030-01-08',620,660,4321,'confirmed','2025-01-01');
    INSERT INTO appointment_services VALUES ('legacy-guest','corte','Snapshot visitante',4321,40);
    INSERT INTO guest_sessions VALUES ('visitor','preserve-token-hash','Cliente Antigo','guest@example.com','21977776666','2025-01-01','2035-01-01');
    INSERT INTO guest_appointments VALUES ('legacy-guest','visitor');
    INSERT INTO blocks VALUES ('block','igor','2030-01-08',900,940,'Compromisso');
    INSERT INTO notifications (id,appointment_id,channel,event,payload,status,attempts,created_at,next_attempt_at)
      VALUES ('queued','legacy-booking','email','confirmed','{"historical":true}','pending',2,'2025-01-01','2030-01-01');
    INSERT INTO password_recovery (id,user_id,email,session_version,token_hash,event,created_at,expires_at,next_attempt_at)
      VALUES ('reset','legacy-admin','changed@example.com',7,'preserve-reset-hash','reset','2025-01-01','2030-01-01','2030-01-01');
    INSERT INTO password_recovery_limits VALUES ('preserve-bucket','2025-01-01','2025-01-01',2);
    CREATE INDEX legacy_extra_index ON appointments(status);
  `);
  const before = await snapshot({ all: async (sql) => old.prepare(sql).all() }, legacyTables);
  old.close();
  const secret = 'unchanged-legacy-secret-for-this-isolated-test';
  const token = jwt.sign({ version: 7 }, secret, {
    subject: 'legacy-admin',
    issuer: 'igor-barber-club',
    audience: 'barber-web',
    expiresIn: '7d',
  });
  let foundation;
  for (let pass = 0; pass < 2; pass++) {
    db = await createDatabase('', path);
    assert.deepEqual(await snapshot(db, legacyTables), before);
    assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
    assert.equal((await db.get('PRAGMA foreign_keys')).foreign_keys, 1);
    assert.ok(await db.get("SELECT name FROM sqlite_schema WHERE name='legacy_extra_index'"));
    assert.deepEqual(await runMigrations(db), []);
    const current = await snapshot(db, foundationTables);
    if (foundation) assert.deepEqual(current, foundation);
    foundation = current;
    assert.equal(current.company_members[0].user_id, 'legacy-admin');
    assert.equal(current.company_members[0].role, 'admin');
    assert.equal(current.subscriptions.length, 0);
    await db.close();
    db = null;
  }
  db = await createDatabase('', path);
  const app = createApp(db, { secret, test: true, serveStatic: false });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const response = await fetch(`${base}/auth/me`, { headers: { Cookie: `session=${token}` } });
    assert.equal(response.status, 200);
    const { user } = await response.json();
    assert.equal(user.id, 'legacy-admin');
    assert.equal(user.name, 'Nome editado');
    const services = await (await fetch(`${base}/services`)).json();
    assert.deepEqual(
      services.map((s) => s.id),
      ['corte'],
    );
    for (const route of ['/companies', '/admin/companies', '/subscriptions'])
      assert.equal(
        (await fetch(base + route, { headers: { Cookie: `session=${token}` } })).status,
        404,
      );
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test('Gradefy migration CLI: runs without HTTP and rejects ephemeral storage in production', () => {
  const env = {
    ...process.env,
    DATABASE_URL: '',
    POSTGRES_URL: '',
    SQLITE_PATH: ':memory:',
    NODE_ENV: 'test',
    VERCEL: '',
    DEMO_MODE: 'false',
  };
  const command = fileURLToPath(new URL('../server/migrate.js', import.meta.url));
  const result = spawnSync(process.execPath, [command], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 gradefy-foundation/);
  const refused = spawnSync(process.execPath, [command], {
    env: { ...env, NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Defina DATABASE_URL ou POSTGRES_URL PostgreSQL/);
});

test('Gradefy migration: changed checksums and unknown versions fail without modifying persisted data', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  const original = await db.get('SELECT * FROM schema_migrations WHERE version=1');
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=1', ['0'.repeat(64)]);
  const before = await snapshot(db, foundationTables);
  await assert.rejects(runMigrations(db), /Histórico de migrations incompatível/);
  assert.deepEqual(await snapshot(db, foundationTables), before);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=1', [original.checksum]);
  await db.run('INSERT INTO schema_migrations VALUES (?,?,?,?)', [
    999,
    'future',
    'f'.repeat(64),
    '2030-01-01',
  ]);
  await assert.rejects(runMigrations(db), /versão 999/);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM companies')).count, 1);
});

test('Gradefy migration: a failed DDL rolls back the entire migration and its journal', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(legacySchema);
  let fail = true;
  const tx = {
    dialect: 'sqlite',
    all: async (sql, args = []) => sqlite.prepare(sql).all(...args),
    run: async (sql, args = []) => {
      if (fail && sql.startsWith('CREATE TABLE plans')) throw new Error('simulated DDL failure');
      return sqlite.prepare(sql).run(...args);
    },
  };
  const db = {
    transaction: async (fn) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(tx);
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  try {
    await assert.rejects(runMigrations(db), /simulated DDL failure/);
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_schema WHERE name IN ('niches','templates','plans','schema_migrations')",
        )
        .get().count,
      0,
    );
    fail = false;
    assert.deepEqual(await runMigrations(db), [1, 2]);
    assert.deepEqual(await runMigrations(db), []);
  } finally {
    sqlite.close();
  }
});
