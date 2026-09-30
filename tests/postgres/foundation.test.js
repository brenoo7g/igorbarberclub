import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { assertFoundationIntegrity } from '../helpers/foundation-integrity.js';

// This suite is intentionally NOT part of tests/*.test.js. Only run-local.mjs provisions it.
const input = process.env.GRADEFY_PG_TEST_URL;
const runId = process.env.GRADEFY_PG_TEST_RUN_ID;
const token = process.env.GRADEFY_PG_TEST_TOKEN;
if (!input || !/^[a-f0-9]{16}$/.test(runId || '') || !/^[a-f0-9]{64}$/.test(token || ''))
  throw new Error(
    'Use the disposable PostgreSQL runner; no environment database fallback is allowed.',
  );
const controlUrl = new URL(input);
assert.equal(controlUrl.protocol, 'postgresql:');
assert.equal(controlUrl.hostname, '127.0.0.1');
assert.equal(controlUrl.username, 'gradefy_validation');
assert.equal(controlUrl.pathname, `/gradefy_validation_control_${runId}`);
assert.ok(Number(controlUrl.port) > 0 && controlUrl.port !== '5432');
assert.equal(controlUrl.search, '');
assert.equal(process.env.DATABASE_URL, '');
assert.equal(process.env.POSTGRES_URL, '');
assert.equal(process.env.NODE_ENV, 'test');
const root = fileURLToPath(new URL('../../', import.meta.url));
const cluster = resolve(process.env.GRADEFY_PG_TEST_CLUSTER);
assert.equal(
  resolve(process.env.DOTENV_CONFIG_PATH),
  resolve(cluster, '..', 'no-environment-file'),
);
const control = new pg.Client({
  connectionString: input,
  ssl: false,
  connectionTimeoutMillis: 5000,
});
let createDatabase, runMigrations, bootstrapIgorCompany, readMigration, migrations;
const schema = await readFile(new URL('../../server/schema.sql', import.meta.url), 'utf8');
const legacyTables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
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
const originalMigrationPath = join(root, 'server', 'migrations', '001-gradefy-foundation.sql');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const originalChecksum = sha(await readFile(originalMigrationPath));
before(async () => {
  await control.connect();
  assert.equal(
    (await control.query('SELECT token FROM gradefy_validation_guard')).rows[0].token,
    token,
  );
  assert.equal(
    resolve((await control.query('SHOW data_directory')).rows[0].data_directory),
    cluster,
  );
  assert.equal(
    (await control.query('SHOW listen_addresses')).rows[0].listen_addresses,
    '127.0.0.1',
  );
  // Only import dotenv-using application modules after validating our disposable cluster.
  ({ createDatabase } = await import('../../server/database.js'));
  ({ runMigrations, readMigration, migrations } = await import('../../server/migrations.js'));
  ({ bootstrapIgorCompany } = await import('../../server/company-bootstrap.js'));
});
after(async () => {
  await control.end();
  assert.equal(sha(await readFile(originalMigrationPath)), originalChecksum);
});

async function makeCase(t, label, { legacy = false, initialize = true } = {}) {
  assert.match(label, /^[a-z_]+$/);
  const name = `gradefy_validation_${runId}_${label}`;
  assert.ok(name.length < 64);
  await control.query(`CREATE DATABASE "${name}"`);
  const url = new URL(input);
  url.pathname = `/${name}`;
  url.searchParams.set('application_name', `gradefy_validation_${label}`);
  const raw = new pg.Client({
    connectionString: url.href,
    ssl: false,
    connectionTimeoutMillis: 5000,
  });
  await raw.connect();
  t.after(() => raw.end());
  if (legacy) {
    await raw.query(schema);
    await raw.query(await readFile(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8'));
  }
  const db = initialize ? await createDatabase(url.href) : null;
  if (db) t.after(() => db.close());
  return { url: url.href, raw, db };
}
async function snapshot(raw, tables) {
  const result = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    result[table] = (await raw.query(`SELECT * FROM ${table}`)).rows.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  }
  return result;
}
const count = async (db, table) =>
  Number((await db.get(`SELECT COUNT(*) AS count FROM ${table}`)).count);
async function assertCatalog(db) {
  for (const table of ['companies', 'niches', 'templates', 'company_settings'])
    assert.equal(await count(db, table), 1);
  assert.equal(await count(db, 'schema_migrations'), 2);
  assert.deepEqual(
    (await db.all('SELECT id,max_professionals FROM plans ORDER BY id')).map((p) => [
      p.id,
      p.max_professionals,
    ]),
    [
      ['individual', 1],
      ['team', null],
    ],
  );
  assert.equal((await db.get('SELECT id FROM companies')).id, 'igor-barber-club');
  assert.equal((await db.get('SELECT id FROM niches')).id, 'barbershop');
  assert.equal((await db.get('SELECT id FROM templates')).id, 'barber-classic');
  assert.equal(await count(db, 'subscriptions'), 0);
}
async function shadow(t) {
  // Copy under ignored test-results so application dependencies resolve to this repository.
  const parent = join(root, 'test-results', 'postgres-validation');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'shadow-'));
  t.after(async () => {
    const target = relative(resolve(parent), resolve(directory));
    assert.ok(!isAbsolute(target) && !target.startsWith('..') && /^shadow-[^\\/]+$/.test(target));
    await rm(directory, { recursive: true, force: true });
  });
  await cp(join(root, 'server'), join(directory, 'server'), { recursive: true });
  return {
    directory,
    migration: join(directory, 'server', 'migrations', '001-gradefy-foundation.sql'),
    loadDatabase: () => import(pathToFileURL(join(directory, 'server', 'database.js')).href),
    loadRunner: () => import(pathToFileURL(join(directory, 'server', 'migrations.js')).href),
  };
}

test('01 PostgreSQL vazio: schema legado, migration 001 e catálogos completos', async (t) => {
  const { db, raw } = await makeCase(t, 'empty');
  assert.equal(db.dialect, 'postgres');
  const tables = (
    await raw.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    )
  ).rows
    .map((r) => r.table_name)
    .sort();
  assert.deepEqual(tables, [...legacyTables, ...foundationTables].sort());
  await assertCatalog(db);
  assert.equal(await count(db, 'users'), 0);
  assert.equal(await count(db, 'appointments'), 0);
  assert.equal(await count(db, 'portfolio'), 5);
  for (const row of (
    await raw.query(
      "SELECT table_name FROM information_schema.columns WHERE column_name='company_id' AND table_schema='public'",
    )
  ).rows)
    assert.ok(!legacyTables.includes(row.table_name));
});

test('02 PostgreSQL legado: preserva todas as 17 tabelas, IDs, índices e contatos', async (t) => {
  const { raw, url } = await makeCase(t, 'legacy', { legacy: true, initialize: false });
  const before = await snapshot(raw, legacyTables);
  const db = await createDatabase(url);
  t.after(() => db.close());
  assert.deepEqual(await snapshot(raw, legacyTables), before);
  await assertCatalog(db);
  assert.equal((await db.get("SELECT price FROM services WHERE id='corte'")).price, 4321);
  assert.equal((await db.get("SELECT name FROM barbers WHERE id='igor'")).name, 'Igor editado');
  assert.equal((await db.get("SELECT active FROM services WHERE id='combo'")).active, 0);
  assert.equal((await db.get('SELECT user_id,role FROM company_members')).user_id, 'legacy-admin');
  assert.equal(await count(db, 'company_members'), 1);
  assert.ok(
    (await raw.query("SELECT indexname FROM pg_indexes WHERE indexname='legacy_extra_index'")).rows
      .length,
  );
});

test('03 Reexecução: migration já aplicada e reinicialização sem nenhuma alteração', async (t) => {
  const { db, raw, url } = await makeCase(t, 'repeat', { legacy: true });
  const before = await snapshot(raw, [...legacyTables, ...foundationTables]);
  assert.deepEqual(await runMigrations(db), []);
  const second = await createDatabase(url);
  try {
    assert.deepEqual(await runMigrations(second), []);
    assert.deepEqual(await snapshot(raw, [...legacyTables, ...foundationTables]), before);
  } finally {
    await second.close();
  }
});

test('04 Bootstrap repetido: preserva configurações e membros, sem inferir plano pela equipe', async (t) => {
  const { db, raw } = await makeCase(t, 'bootstrap', { legacy: true });
  assert.equal(await count(db, 'barbers'), 2);
  await db.run("UPDATE companies SET name='Nome empresarial editado'");
  await db.run("UPDATE company_members SET status='inactive',role='owner'");
  await db.run("UPDATE company_settings SET city='Cidade editada',version=4");
  const before = await snapshot(raw, [...legacyTables, ...foundationTables]);
  await bootstrapIgorCompany(db);
  await bootstrapIgorCompany(db);
  await assertCatalog(db);
  assert.deepEqual(await snapshot(raw, [...legacyTables, ...foundationTables]), before);
});

test(
  '05 Concorrência real: duas inicializações esperam o advisory lock e terminam consistentes',
  { timeout: 30000 },
  async (t) => {
    const { raw, url } = await makeCase(t, 'concurrent', { initialize: false });
    await raw.query('BEGIN');
    await raw.query('SELECT pg_advisory_xact_lock(789127)');
    const attempts = Promise.allSettled([createDatabase(url), createDatabase(url)]);
    let waiting = 0;
    try {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        waiting = Number(
          (
            await raw.query(
              "SELECT COUNT(*) AS count FROM pg_locks WHERE locktype='advisory' AND NOT granted AND objid=789127 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())",
            )
          ).rows[0].count,
        );
        if (waiting === 2) break;
        await new Promise((done) => setTimeout(done, 25));
      }
    } finally {
      await raw.query('ROLLBACK');
    }
    const results = await attempts;
    for (const result of results)
      if (result.status === 'fulfilled') t.after(() => result.value.close());
    assert.equal(
      waiting,
      2,
      'Both independent connections must actually wait on the migration lock',
    );
    assert.ok(
      results.every((r) => r.status === 'fulfilled'),
      results.map((r) => r.reason?.message).join('\n'),
    );
    const [first, second] = results.map((r) => r.value);
    await Promise.all([bootstrapIgorCompany(first), bootstrapIgorCompany(second)]);
    await assertCatalog(first);
    assert.equal(await count(first, 'portfolio'), 5);
    assert.deepEqual(await runMigrations(second), []);
  },
);

test('06 Rollback PostgreSQL: falha SQL no meio da migration não deixa tabelas ou versão parcial', async (t) => {
  const { raw, url } = await makeCase(t, 'rollback', { legacy: true, initialize: false });
  const before = await snapshot(raw, legacyTables);
  const copy = await shadow(t);
  const original = await readFile(copy.migration, 'utf8');
  await writeFile(
    copy.migration,
    original.replace(
      'CREATE TABLE plans (',
      'SELECT gradefy_deliberate_missing_function();\n-- statement-breakpoint\nCREATE TABLE plans (',
    ),
  );
  const temporary = await copy.loadDatabase();
  await assert.rejects(temporary.createDatabase(url), { code: '42883' });
  const tables = (
    await raw.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
  ).rows.map((r) => r.table_name);
  assert.deepEqual(tables.sort(), [...legacyTables].sort());
  assert.deepEqual(await snapshot(raw, legacyTables), before);
  // A clean retry must succeed and record the original, unmodified migration.
  const db = await createDatabase(url);
  t.after(() => db.close());
  await assertCatalog(db);
});

test('07 Checksum: alteração artificial do arquivo já aplicado é recusada sem alterar banco', async (t) => {
  const { raw, url } = await makeCase(t, 'checksum', { legacy: true });
  const before = await snapshot(raw, [...legacyTables, ...foundationTables]);
  const copy = await shadow(t);
  await writeFile(
    copy.migration,
    (await readFile(copy.migration, 'utf8')) + '\n-- Artificial change in disposable copy only.\n',
  );
  const temporary = await copy.loadDatabase();
  await assert.rejects(
    temporary.createDatabase(url),
    /Histórico de migrations incompatível na versão 1/,
  );
  assert.deepEqual(await snapshot(raw, [...legacyTables, ...foundationTables]), before);
  assert.equal(sha(await readFile(originalMigrationPath)), originalChecksum);
});

test('08 Restrição de empresa: segunda empresa e ID nulo são rejeitados pelo PostgreSQL', async (t) => {
  const { db } = await makeCase(t, 'single');
  const insert =
    "INSERT INTO companies (id,slug,name,niche_id,template_id,created_at,updated_at) VALUES (?,?,?,'barbershop','barber-classic',?,?)";
  const now = new Date().toISOString();
  await assert.rejects(db.run(insert, ['another', 'another', 'Outra Empresa', now, now]), {
    code: '23514',
    constraint: 'gradefy_single_company',
  });
  await assert.rejects(db.run(insert, [null, 'null-id', 'ID inválido', now, now]), {
    code: '23502',
  });
  await assert.rejects(db.run("UPDATE companies SET id='another'"), { code: '23514' });
  await assertCatalog(db);
});

test('09 SQL PostgreSQL: tipos, defaults, FKs, índices parciais, timestamps textuais e UPSERT', async (t) => {
  const { db, raw } = await makeCase(t, 'compatibility', { legacy: true });
  assert.equal(typeof (await db.get('SELECT COUNT(*) AS count FROM companies')).count, 'string');
  const company = await db.get('SELECT * FROM companies');
  assert.equal(company.status, 'active');
  assert.equal(company.timezone, 'America/Sao_Paulo');
  assert.equal(company.locale, 'pt-BR');
  assert.equal(company.currency, 'BRL');
  assert.equal((await db.get('SELECT version FROM company_settings')).version, 0);
  assert.equal((await db.get('SELECT active FROM niches')).active, 1);
  assert.equal((await db.get('SELECT version FROM templates')).version, 1);
  assert.match(company.created_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
  const types = (
    await raw.query(
      "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public'",
    )
  ).rows;
  assert.equal(
    types.find((r) => r.table_name === 'plans' && r.column_name === 'max_professionals').data_type,
    'integer',
  );
  assert.equal(
    types.find((r) => r.table_name === 'companies' && r.column_name === 'created_at').data_type,
    'text',
  );
  const indexes = (
    await raw.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'")
  ).rows;
  assert.ok(indexes.some((i) => i.indexname === 'company_members_user'));
  assert.match(
    indexes.find((i) => i.indexname === 'subscriptions_one_current_per_company').indexdef,
    /UNIQUE.*WHERE/,
  );
  await assert.rejects(
    db.run(
      "INSERT INTO company_members (company_id,user_id,role,created_at) VALUES ('igor-barber-club','missing','admin','2026-01-01')",
    ),
    { code: '23503' },
  );
  await db.run(
    "INSERT INTO niches (id,name,created_at) VALUES ('test-niche','Teste','2026-01-01')",
  );
  await assert.rejects(db.run("UPDATE companies SET niche_id='test-niche'"), { code: '23503' });
  await assert.rejects(
    db.run("UPDATE plans SET max_professionals=? WHERE id='individual'", ['1.5']),
    { code: '22P02' },
  );
  await assert.rejects(db.run("UPDATE plans SET max_professionals=0 WHERE id='individual'"), {
    code: '23514',
  });
  const sub = (id, status) =>
    db.run(
      "INSERT INTO subscriptions (id,company_id,plan_id,status,source,created_at,updated_at) VALUES (?,'igor-barber-club','individual',?,'manual',?,?)",
      [id, status, company.created_at, company.created_at],
    );
  await sub('active', 'active');
  await assert.rejects(sub('other-current', 'pending'), { code: '23505' });
  await sub('historical', 'cancelled');
  await assert.rejects(
    db.run(
      "UPDATE subscriptions SET starts_at='2030-02-01',ends_at='2030-01-01' WHERE id='historical'",
    ),
    { code: '23514' },
  );
  // TEXT dates accept arbitrary strings; this test documents that limitation without changing schema.
  await db.run("UPDATE subscriptions SET created_at='not-a-date' WHERE id='historical'");
  assert.equal(
    (await db.get("SELECT created_at FROM subscriptions WHERE id='historical'")).created_at,
    'not-a-date',
  );
  const before = await snapshot(raw, foundationTables);
  await bootstrapIgorCompany(db);
  assert.deepEqual(await snapshot(raw, foundationTables), before);
  // Unlike SQLite, a failed statement poisons the PostgreSQL transaction until rollback/savepoint.
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.run(
        "INSERT INTO plans (id,name,created_at) VALUES ('rollback-probe','Teste','2026-01-01')",
      );
      await assert.rejects(
        tx.run("UPDATE plans SET max_professionals=0 WHERE id='rollback-probe'"),
        { code: '23514' },
      );
      await tx.get('SELECT 1');
    }),
    { code: '25P02' },
  );
  assert.equal(await db.get("SELECT id FROM plans WHERE id='rollback-probe'"), undefined);
});

test('10 Evolução futura: migration 003 temporária remove a restrição sem edição manual do banco', async (t) => {
  const { db, url } = await makeCase(t, 'future');
  const copy = await shadow(t);
  const manifest = join(copy.directory, 'server', 'migrations.js');
  const original = await readFile(manifest, 'utf8');
  const anchor = '\n]);';
  assert.ok(original.includes(anchor));
  await writeFile(
    manifest,
    original.replace(
      anchor,
      "\n  Object.freeze({ version: 3, name: 'test-remove-single-company', file: '003-test-only.sql' })," +
        anchor,
    ),
  );
  await writeFile(
    join(copy.directory, 'server', 'migrations', '003-test-only.sql'),
    'ALTER TABLE companies DROP CONSTRAINT gradefy_single_company;\n',
  );
  const temporary = await copy.loadDatabase();
  const upgraded = await temporary.createDatabase(url);
  try {
    assert.deepEqual(
      (await upgraded.all('SELECT version FROM schema_migrations ORDER BY version')).map(
        (r) => r.version,
      ),
      [1, 2, 3],
    );
    const runner = await copy.loadRunner();
    assert.deepEqual(await runner.runMigrations(upgraded), []);
    await upgraded.run(
      "INSERT INTO companies (id,slug,name,niche_id,template_id,created_at,updated_at) VALUES ('test-second','test-second','Somente teste','barbershop','barber-classic','2026-01-01','2026-01-01')",
    );
    assert.equal(await count(upgraded, 'companies'), 2);
    // The unmodified application refuses a newer database instead of ignoring its migration.
    await assert.rejects(runMigrations(db), /versão 3/);
  } finally {
    await upgraded.close();
  }
  assert.equal(sha(await readFile(originalMigrationPath)), originalChecksum);
});

test('11 Comparação SQLite em memória: chave nula corrigida; diferenças restantes documentadas', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  assert.equal(typeof (await db.get('SELECT COUNT(*) AS count FROM companies')).count, 'number');
  await assert.rejects(
    db.run("UPDATE plans SET max_professionals=? WHERE id='individual'", ['1.5']),
    /CHECK/,
  );
  await db.transaction(async (tx) => {
    await assert.rejects(tx.run("UPDATE plans SET max_professionals=0 WHERE id='individual'"));
    assert.equal((await tx.get('SELECT 1 AS value')).value, 1);
  });
  await db.run("UPDATE companies SET created_at='not-a-date'");
  assert.equal((await db.get('SELECT created_at FROM companies')).created_at, 'not-a-date');
  await assert.rejects(
    db.run(
      "INSERT INTO companies (id,slug,name,niche_id,template_id,created_at,updated_at) VALUES (NULL,'null-id','Teste apenas em memória','barbershop','barber-classic','2026-01-01','2026-01-01')",
    ),
    /NOT NULL/,
  );
  assert.equal(await count(db, 'companies'), 1);
});

test('12 Integridade PostgreSQL: todas as chaves obrigatórias rejeitam NULL e referências inválidas', async (t) => {
  const { db } = await makeCase(t, 'integrity');
  await assertFoundationIntegrity(db);
});

test('13 Upgrade PostgreSQL 001 para 002: preserva linhas, índice personalizado e checksum original', async (t) => {
  const { raw, url } = await makeCase(t, 'upgrade', { legacy: true, initialize: false });
  for (const statement of readMigration(migrations[0]).statements) await raw.query(statement);
  await raw.query(
    'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY CHECK(version>0),name TEXT NOT NULL,checksum TEXT NOT NULL CHECK(length(checksum)=64),applied_at TEXT NOT NULL)',
  );
  await raw.query('INSERT INTO schema_migrations VALUES(1,$1,$2,$3)', [
    migrations[0].name,
    readMigration(migrations[0]).checksum,
    '2026-01-01',
  ]);
  const tx = {
    dialect: 'postgres',
    run: async (sql, args = []) => {
      let n = 0;
      return raw.query(
        sql.replace(/\?/g, () => `$${++n}`),
        args,
      );
    },
    all: async (sql) => (await raw.query(sql)).rows,
  };
  await bootstrapIgorCompany(tx);
  await raw.query("UPDATE company_members SET role='owner',status='inactive'");
  await raw.query("UPDATE company_settings SET city='Editada',version=8");
  await raw.query(
    "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES('manual','igor-barber-club','team','active','manual','2025-01-01','2025-01-01')",
  );
  await raw.query('CREATE INDEX custom_company_name ON companies(name)');
  const before = await snapshot(raw, [...legacyTables, ...foundationTables]);
  const db = await createDatabase(url);
  t.after(() => db.close());
  const after = await snapshot(raw, [...legacyTables, ...foundationTables]);
  assert.deepEqual(
    after.schema_migrations.map((row) => row.version),
    [1, 2],
  );
  assert.deepEqual(after.schema_migrations[0], before.schema_migrations[0]);
  delete after.schema_migrations;
  delete before.schema_migrations;
  assert.deepEqual(after, before);
  assert.equal(
    (await raw.query("SELECT indexname FROM pg_indexes WHERE indexname='custom_company_name'")).rows
      .length,
    1,
  );
  assert.deepEqual(await runMigrations(db), []);
});

test('14 Evolução SQLite: migration futura remove só a restrição de empresa e mantém NOT NULL e FKs', async (t) => {
  const copy = await shadow(t);
  const manifest = join(copy.directory, 'server', 'migrations.js');
  const original = await readFile(manifest, 'utf8');
  assert.ok(original.includes('\n]);'));
  await writeFile(
    manifest,
    original.replace(
      '\n]);',
      "\n  Object.freeze({version:3,name:'test-remove-single-company',file:'003-test-only.sql'}),\n]);",
    ),
  );
  const statements = readMigration(migrations[1]).statements.filter((sql) =>
    sql.startsWith('-- dialect: sqlite\n'),
  );
  const sql = statements.join('\n-- statement-breakpoint\n');
  const restriction = ",\n  CONSTRAINT gradefy_single_company CHECK(id = 'igor-barber-club')";
  assert.ok(sql.includes(restriction));
  await writeFile(
    join(copy.directory, 'server', 'migrations', '003-test-only.sql'),
    sql.replace(restriction, ''),
  );
  const temporary = await copy.loadDatabase();
  const db = await temporary.createDatabase('', ':memory:');
  try {
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES('test-second','test-second','Somente teste','barbershop','barber-classic','2026','2026')",
    );
    await assert.rejects(db.run("UPDATE companies SET id=NULL WHERE id='test-second'"), /NOT NULL/);
    await assert.rejects(
      db.run("UPDATE companies SET niche_id='missing' WHERE id='test-second'"),
      /FOREIGN KEY/,
    );
    assert.deepEqual(await db.all('PRAGMA foreign_key_check'), []);
    assert.equal(await count(db, 'companies'), 2);
    const runner = await copy.loadRunner();
    assert.deepEqual(await runner.runMigrations(db), []);
  } finally {
    await db.close();
  }
});
