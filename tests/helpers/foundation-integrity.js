import assert from 'node:assert/strict';

export const foundationTables = [
  'niches',
  'templates',
  'plans',
  'companies',
  'company_members',
  'company_settings',
  'subscriptions',
  'schema_migrations',
];
export async function snapshotFoundation(db) {
  const result = {};
  for (const table of foundationTables)
    result[table] = JSON.parse(JSON.stringify(await db.all(`SELECT * FROM ${table}`)));
  return result;
}

// The same behavioral assertions run against SQLite and real PostgreSQL.
export async function assertFoundationIntegrity(db) {
  const now = '2026-01-01T00:00:00.000Z';
  const company = 'igor-barber-club';
  const nullError = db.dialect === 'postgres' ? { code: '23502' } : /NOT NULL/;
  const fkError = db.dialect === 'postgres' ? { code: '23503' } : /FOREIGN KEY/;
  await db.run(
    "INSERT INTO users (id,name,email,phone,password_hash,role,created_at) VALUES ('integrity-user','Teste','integrity@example.test','21999990000','test-only','client',?)",
    [now],
  );
  const rows = {
    niches: { id: 'integrity-niche', name: 'Teste', created_at: now },
    templates: { id: 'integrity-template', niche_id: 'barbershop', name: 'Teste', created_at: now },
    plans: { id: 'integrity-plan', name: 'Teste', created_at: now },
    companies: {
      id: company,
      slug: 'null-test-slug',
      name: 'Teste',
      niche_id: 'barbershop',
      template_id: 'barber-classic',
      created_at: now,
      updated_at: now,
    },
    company_members: {
      company_id: company,
      user_id: 'integrity-user',
      role: 'manager',
      created_at: now,
    },
    company_settings: { company_id: company, updated_at: now },
    subscriptions: {
      id: 'integrity-sub',
      company_id: company,
      plan_id: 'individual',
      status: 'cancelled',
      source: 'manual',
      created_at: now,
      updated_at: now,
    },
    schema_migrations: {
      version: 99,
      name: 'test-only',
      checksum: 'f'.repeat(64),
      applied_at: now,
    },
  };
  const required = {
    niches: ['id'],
    templates: ['id', 'niche_id'],
    plans: ['id'],
    companies: ['id', 'slug', 'niche_id', 'template_id'],
    company_members: ['company_id', 'user_id'],
    company_settings: ['company_id'],
    subscriptions: ['id', 'company_id', 'plan_id'],
    schema_migrations: ['version', 'name', 'checksum', 'applied_at'],
  };
  for (const [table, columns] of Object.entries(required)) {
    const row = rows[table];
    const names = Object.keys(row);
    for (const column of columns) {
      const args = names.map((name) => (name === column ? null : row[name]));
      await assert.rejects(
        db.run(
          `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
          args,
        ),
        nullError,
        `${table}.${column} INSERT NULL`,
      );
    }
    if (!['companies', 'company_settings', 'schema_migrations'].includes(table))
      await db.run(
        `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`,
        Object.values(row),
      );
    for (const column of columns)
      await assert.rejects(
        db.run(`UPDATE ${table} SET ${column}=NULL`),
        nullError,
        `${table}.${column} UPDATE NULL`,
      );
  }
  for (const [table, column] of [
    ['templates', 'niche_id'],
    ['companies', 'niche_id'],
    ['companies', 'template_id'],
    ['company_members', 'company_id'],
    ['company_members', 'user_id'],
    ['company_settings', 'company_id'],
    ['subscriptions', 'company_id'],
    ['subscriptions', 'plan_id'],
  ])
    await assert.rejects(
      db.run(`UPDATE ${table} SET ${column}='missing-reference'`),
      fkError,
      `${table}.${column} invalid reference`,
    );
  for (const [table, column] of [
    ['plans', 'max_professionals'],
    ['templates', 'version'],
    ['company_settings', 'version'],
    ['schema_migrations', 'version'],
  ]) {
    await assert.rejects(
      db.run(`UPDATE ${table} SET ${column}=?`, ['1.5']),
      db.dialect === 'postgres' ? { code: '22P02' } : /CHECK/,
      `${table}.${column} fractional integer`,
    );
    await assert.rejects(
      db.run(`UPDATE ${table} SET ${column}=?`, ['2147483648']),
      db.dialect === 'postgres' ? { code: '22003' } : /CHECK/,
      `${table}.${column} out-of-range integer`,
    );
  }
  const columns =
    db.dialect === 'postgres'
      ? await db.all(
          "SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE table_schema='public'",
        )
      : (
          await Promise.all(
            foundationTables.map(async (table) =>
              (await db.all(`PRAGMA table_info(${table})`)).map((col) => ({
                table_name: table,
                column_name: col.name,
                is_nullable: col.notnull ? 'NO' : 'YES',
              })),
            ),
          )
        ).flat();
  for (const [table, names] of Object.entries(required))
    for (const column of names)
      assert.equal(
        columns.find((col) => col.table_name === table && col.column_name === column)?.is_nullable,
        'NO',
        `${table}.${column} explicit non-nullability`,
      );
  assert.equal(Number((await db.get('SELECT COUNT(*) AS count FROM companies')).count), 1);
}
