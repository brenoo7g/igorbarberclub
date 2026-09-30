import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bootstrapIgorCompany, IGOR_COMPANY_ID } from './company-bootstrap.js';
import { prepareDataOwnership, finishDataOwnership } from './data-ownership.js';
import { prepareMultitenantAccess, finishMultitenantAccess } from './multitenant-migration.js';

export const migrations = Object.freeze([
  Object.freeze({ version: 1, name: 'gradefy-foundation', file: '001-gradefy-foundation.sql' }),
  Object.freeze({
    version: 2,
    name: 'gradefy-foundation-integrity',
    file: '002-gradefy-foundation-integrity.sql',
  }),
  Object.freeze({
    version: 3,
    name: 'gradefy-data-ownership',
    file: '003-gradefy-data-ownership.sql',
  }),
  Object.freeze({
    version: 4,
    name: 'gradefy-multitenant-access',
    file: '004-gradefy-multitenant-access.sql',
  }),
]);

const foundationTables = [
  'niches',
  'templates',
  'plans',
  'companies',
  'company_members',
  'company_settings',
  'subscriptions',
  'schema_migrations',
];

async function checkSQLiteFoundation(tx, rebuilding = false) {
  const columns = rebuilding
    ? Object.fromEntries(
        readMigration(migrations[0]).statements.flatMap((sql) => {
          const table = sql.match(/CREATE TABLE (\w+) \(/)?.[1];
          return table
            ? [[table, [...sql.matchAll(/^  (\w+) (?:TEXT|INTEGER)\b/gm)].map((match) => match[1])]]
            : [];
        }),
      )
    : {};
  columns.schema_migrations = ['version', 'name', 'checksum', 'applied_at'];
  for (const table of foundationTables) {
    if ((await tx.all(`PRAGMA foreign_key_check(${table})`)).length)
      throw new Error(
        `Integridade Gradefy: referências inválidas em ${table}; nenhum dado foi corrigido ou removido.`,
      );
    if (rebuilding) {
      const actual = (await tx.all(`PRAGMA table_info(${table})`)).map((row) => row.name).sort();
      if (JSON.stringify(actual) !== JSON.stringify([...columns[table]].sort()))
        throw new Error(
          `Integridade Gradefy: colunas personalizadas em ${table} exigem migração explícita.`,
        );
      const custom = await tx.all(
        "SELECT name FROM sqlite_schema WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL AND name NOT IN ('company_members_user','subscriptions_one_current_per_company')",
        [table],
      );
      if (custom.length)
        throw new Error(
          `Integridade Gradefy: objetos personalizados em ${table} exigem migração explícita: ${custom.map((row) => row.name).join(', ')}.`,
        );
    }
  }
}

// Explicit separators support SQL containing semicolons; do not split SQL on every ';'.
export function readMigration(migration) {
  const sql = readFileSync(
    new URL(`./migrations/${migration.file}`, import.meta.url),
    'utf8',
  ).replace(/\r\n?/g, '\n');
  return {
    ...migration,
    checksum: createHash('sha256').update(sql).digest('hex'),
    statements: sql
      .split(/^-- statement-breakpoint\s*$/m)
      .map((sql) => sql.trim())
      .filter(Boolean),
  };
}

// Caller owns the transaction. Uses the same lock as the legacy schema/seed initialization.
export async function applyMigrations(tx) {
  if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789127)');
  await tx.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT NOT NULL PRIMARY KEY CHECK(version > 0),
    name TEXT NOT NULL,
    checksum TEXT NOT NULL CHECK(length(checksum) = 64),
    applied_at TEXT NOT NULL
  )`);
  const definitions = migrations.map(readMigration);
  const applied = await tx.all('SELECT * FROM schema_migrations ORDER BY version');
  // Validate the entire history before applying anything. Never silently adopt a drifted schema.
  for (const [index, row] of applied.entries()) {
    const expected = definitions[index];
    if (
      !expected ||
      expected.version !== row.version ||
      expected.name !== row.name ||
      expected.checksum !== row.checksum
    )
      throw new Error(`Histórico de migrations incompatível na versão ${row.version}.`);
  }
  const installed = [];
  for (const migration of definitions.slice(applied.length)) {
    // Only a genuinely new foundation is bootstrapped before 003. Existing foundations
    // must already contain Igor; never silently repair a missing company during adoption.
    if (migration.version === 3 && applied.length === 0) await bootstrapIgorCompany(tx);
    const ownership = migration.version === 3 ? await prepareDataOwnership(tx) : null;
    const access = migration.version === 4 ? await prepareMultitenantAccess(tx) : null;
    if (migration.version === 2 && tx.dialect === 'sqlite') await checkSQLiteFoundation(tx, true);
    for (const statement of migration.statements) {
      // Both dialect branches belong to the same immutable, checksummed migration file.
      const dialect = statement.match(/^-- dialect: (postgres|sqlite)\n/);
      if (dialect && dialect[1] !== tx.dialect) continue;
      const sql = dialect ? statement.slice(dialect[0].length) : statement;
      await tx.run(sql, sql.startsWith('-- igor-backfill\n') ? [IGOR_COMPANY_ID] : []);
    }
    if (migration.version === 2 && tx.dialect === 'sqlite') await checkSQLiteFoundation(tx);
    if (ownership) await finishDataOwnership(tx, ownership);
    if (access) await finishMultitenantAccess(tx, access);
    await tx.run(
      'INSERT INTO schema_migrations (version,name,checksum,applied_at) VALUES (?,?,?,?)',
      [migration.version, migration.name, migration.checksum, new Date().toISOString()],
    );
    installed.push(migration.version);
  }
  return installed;
}

export const runMigrations = (db) => db.transaction(applyMigrations);
