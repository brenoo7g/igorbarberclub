import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrations, readMigration, runMigrations } from '../../server/migrations.js';
import { bootstrapIgorCompany, IGOR_COMPANY_ID } from '../../server/company-bootstrap.js';
import { ownedTables } from '../../server/data-ownership.js';
import { calculateMetrics } from '../../server/domain.js';

const schema = readFileSync(new URL('../../server/schema.sql', import.meta.url), 'utf8');
export const legacyTables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
  (m) => m[1],
);
export const fixtureCounts = {
  barbers: 2,
  services: 2,
  portfolio: 1,
  barber_settings: 1,
  barber_working_hours: 1,
  barber_working_breaks: 1,
  released_weeks: 1,
  appointments: 2,
  appointment_services: 2,
  guest_sessions: 1,
  guest_appointments: 1,
  blocks: 1,
  notifications: 1,
};
export async function installOwnershipFixture(db) {
  await db.transaction(async (tx) => {
    for (const sql of schema
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await tx.run(sql);
    await tx.run(
      'CREATE TABLE schema_migrations(version INT NOT NULL PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)',
    );
    for (const definition of migrations.slice(0, 2)) {
      const migration = readMigration(definition);
      for (const sql of migration.statements) {
        const dialect = sql.match(/^-- dialect: (sqlite|postgres)\n/);
        if (dialect && dialect[1] !== tx.dialect) continue;
        await tx.run(sql);
      }
      await tx.run('INSERT INTO schema_migrations VALUES(?,?,?,?)', [
        migration.version,
        migration.name,
        migration.checksum,
        '2026-01-01',
      ]);
    }
    for (const sql of readFileSync(
      new URL('../postgres/fixtures/legacy.sql', import.meta.url),
      'utf8',
    )
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await tx.run(sql);
    // Nonzero finance regression: both account and guest visits, two historical services.
    await tx.run("UPDATE appointments SET status='completed'");
    await bootstrapIgorCompany(tx);
  });
}
export async function ownershipSnapshot(db) {
  const result = {};
  for (const table of [...legacyTables, 'schema_migrations'])
    result[table] = JSON.parse(JSON.stringify(await db.all(`SELECT * FROM ${table}`))).sort(
      (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
  return result;
}
export async function assertOwnershipUpgrade(db) {
  const before = await ownershipSnapshot(db);
  const metrics = calculateMetrics(before.appointments, before.appointment_services, '2030-01-08');
  assert.equal(metrics.daily, 12321);
  assert.equal(metrics.clients, 2);
  assert.equal(metrics.visits, 2);
  assert.deepEqual(await runMigrations(db), [3]);
  const after = await ownershipSnapshot(db);
  assert.deepEqual(after.schema_migrations.slice(0, 2), before.schema_migrations);
  delete after.schema_migrations;
  delete before.schema_migrations;
  for (const table of ownedTables) {
    assert.equal(after[table].length, fixtureCounts[table]);
    for (const row of after[table]) {
      assert.equal(row.company_id, IGOR_COMPANY_ID);
      delete row.company_id;
    }
  }
  assert.deepEqual(after, before);
  assert.deepEqual(
    calculateMetrics(
      await db.all('SELECT * FROM appointments'),
      await db.all('SELECT * FROM appointment_services'),
      '2030-01-08',
    ),
    metrics,
  );
  const stable = await ownershipSnapshot(db);
  assert.deepEqual(await runMigrations(db), []);
  await bootstrapIgorCompany(db);
  assert.deepEqual(await ownershipSnapshot(db), stable);
  return fixtureCounts;
}
export async function assertOwnershipConstraints(db) {
  for (const table of ownedTables) {
    const row = await db.get(`SELECT * FROM ${table}`);
    const columns = Object.keys(row).filter((c) => c !== 'company_id');
    const values = columns.map((c) => row[c]);
    // Deliberately omit company_id, with all old mandatory values provided.
    await assert.rejects(
      db.run(
        `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
        values,
      ),
      db.dialect === 'postgres' ? { code: '23502' } : /NOT NULL/,
    );
    await assert.rejects(
      db.run(`UPDATE ${table} SET company_id=NULL`),
      db.dialect === 'postgres' ? { code: '23502' } : /NOT NULL/,
    );
    await assert.rejects(
      db.run(`UPDATE ${table} SET company_id='nonexistent-company'`),
      db.dialect === 'postgres' ? { code: '23503' } : /FOREIGN KEY/,
    );
  }
  const updates = [
    ['barber_settings', 'barber_id'],
    ['barber_working_hours', 'barber_id'],
    ['barber_working_breaks', 'weekday'],
    ['released_weeks', 'barber_id'],
    ['appointments', 'barber_id'],
    ['appointment_services', 'service_id'],
    ['guest_appointments', 'visitor_id'],
    ['blocks', 'barber_id'],
    ['notifications', 'appointment_id'],
  ];
  for (const [table, column] of updates)
    await assert.rejects(
      db.run(`UPDATE ${table} SET ${column}=?`, [column === 'weekday' ? 6 : 'missing-parent']),
      db.dialect === 'postgres' ? { code: '23503' } : /FOREIGN KEY/,
    );
  const columns =
    db.dialect === 'postgres'
      ? await db.all(
          "SELECT table_name,column_name,is_nullable,column_default FROM information_schema.columns WHERE column_name='company_id' AND table_schema='public'",
        )
      : (
          await Promise.all(
            ownedTables.map(async (table) =>
              (await db.all(`PRAGMA table_info(${table})`))
                .filter((c) => c.name === 'company_id')
                .map((c) => ({
                  table_name: table,
                  is_nullable: c.notnull ? 'NO' : 'YES',
                  column_default: c.dflt_value,
                })),
            ),
          )
        ).flat();
  for (const table of ownedTables) {
    const column = columns.find((c) => c.table_name === table);
    assert.equal(column.is_nullable, 'NO');
    assert.equal(column.column_default, null);
  }
  await assert.rejects(
    db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES('second','second','Não habilitada','barbershop','barber-classic','2026','2026')",
    ),
  );
}

// Called ONLY by future-migration tests in disposable copies where the single-company
// CHECK was intentionally removed. Both companies/parents exist: only composite FKs can reject.
export async function assertCrossCompanyRelations(db) {
  const a = IGOR_COMPANY_ID,
    b = 'test-second';
  for (const [company, suffix] of [
    [a, 'a'],
    [b, 'b'],
  ]) {
    await db.run('INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,?,?,?)', [
      company,
      `cross-${suffix}`,
      'Teste',
      'Teste',
    ]);
    await db.run(
      'INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,?,?,?,?,?)',
      [company, `service-${suffix}`, 'Teste', 'Teste', 40, 1000, 'Teste'],
    );
    await db.run(
      'INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,?,?)',
      [company, `cross-${suffix}`, 3, '09:00', '18:00'],
    );
    await db.run(
      'INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,created_at) VALUES(?,?,?,?,540,580,1000,?)',
      [company, `appointment-${suffix}`, `cross-${suffix}`, '2030-01-08', '2026'],
    );
    await db.run(
      'INSERT INTO guest_sessions(company_id,id,token_hash,name,email,phone,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
      [
        company,
        `visitor-${suffix}`,
        `hash-${suffix}`,
        'Teste',
        `${suffix}@example.test`,
        '21999999999',
        '2026',
        '2030',
      ],
    );
  }
  const cases = [
    ["INSERT INTO barber_settings(company_id,barber_id) VALUES(?,'cross-b')", [a]],
    [
      "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,'cross-b',4,1,'09:00','18:00')",
      [a],
    ],
    [
      "INSERT INTO barber_working_breaks(company_id,barber_id,weekday,position,start_time,end_time) VALUES(?,'cross-b',3,1,'12:00','13:00')",
      [a],
    ],
    [
      "INSERT INTO released_weeks(company_id,barber_id,week_start,start_date,end_date,created_at) VALUES(?,'cross-b','2030-01-07','2030-01-08','2030-01-12','2026')",
      [a],
    ],
    [
      "INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,created_at) VALUES(?,'invalid','cross-b','2030-01-08',600,640,1000,'2026')",
      [a],
    ],
    [
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,'appointment-b','service-a','Teste',1000,40)",
      [a],
    ],
    [
      "INSERT INTO appointment_services(company_id,appointment_id,service_id,name,price,duration) VALUES(?,'appointment-a','service-b','Teste',1000,40)",
      [a],
    ],
    [
      "INSERT INTO guest_appointments(company_id,appointment_id,visitor_id) VALUES(?,'appointment-b','visitor-a')",
      [a],
    ],
    [
      "INSERT INTO guest_appointments(company_id,appointment_id,visitor_id) VALUES(?,'appointment-a','visitor-b')",
      [a],
    ],
    [
      "INSERT INTO blocks(company_id,id,barber_id,date,start_minute,end_minute,reason) VALUES(?,'invalid','cross-b','2030-01-08',600,640,'Teste')",
      [a],
    ],
    [
      "INSERT INTO notifications(company_id,id,appointment_id,channel,event,payload,created_at,next_attempt_at) VALUES(?,'invalid','appointment-b','email','confirmed','{}','2026','2026')",
      [a],
    ],
  ];
  for (const [sql, args] of cases)
    await assert.rejects(
      db.run(sql, args),
      db.dialect === 'postgres' ? { code: '23503' } : /FOREIGN KEY/,
    );
}
