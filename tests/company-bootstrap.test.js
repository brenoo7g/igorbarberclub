import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database.js';
import { bootstrapIgorCompany, IGOR_COMPANY_ID } from '../server/company-bootstrap.js';
import { seed } from '../server/seed.js';

test('Gradefy bootstrap: repeat and concurrent calls create only one company and fixed catalogs, without choosing a plan', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await Promise.all(Array.from({ length: 4 }, () => bootstrapIgorCompany(db)));
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM companies')).count, 1);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM niches')).count, 1);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM templates')).count, 1);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM company_settings')).count, 1);
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
  await seed(db);
  const users = await db.all('SELECT * FROM users ORDER BY id');
  const members = await db.all('SELECT * FROM company_members');
  assert.equal(members.length, users.filter((u) => u.role === 'admin').length);
  assert.ok(members.every((m) => m.role === 'admin'));
  await db.run(
    "INSERT INTO barbers (id,name,specialty) VALUES ('second-professional','Outro Profissional','Teste')",
  );
  await seed(db);
  await bootstrapIgorCompany(db);
  assert.deepEqual(await db.all('SELECT * FROM users ORDER BY id'), users);
  assert.deepEqual(await db.all('SELECT * FROM company_members'), members);
  assert.equal((await db.get('SELECT COUNT(*) AS count FROM subscriptions')).count, 0);
});

test('Gradefy bootstrap: preserve edited metadata, revoked memberships and manually assigned subscriptions', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await seed(db);
  await db.run("UPDATE companies SET name='Nome configurado',updated_at='2026-02-01' WHERE id=?", [
    IGOR_COMPANY_ID,
  ]);
  await db.run("UPDATE company_settings SET city='Cidade editada',version=5 WHERE company_id=?", [
    IGOR_COMPANY_ID,
  ]);
  await db.run("UPDATE company_members SET role='owner',status='inactive' WHERE company_id=?", [
    IGOR_COMPANY_ID,
  ]);
  await db.run("UPDATE templates SET name='Template editado',version=2");
  await db.run("UPDATE plans SET name='Equipe editada',max_professionals=7 WHERE id='team'");
  await db.run(
    "INSERT INTO subscriptions (id,company_id,plan_id,status,source,created_at,updated_at) VALUES ('manual',?,'team','active','manual','2026-01-01','2026-01-01')",
    [IGOR_COMPANY_ID],
  );
  const tables = [
    'companies',
    'company_settings',
    'company_members',
    'templates',
    'plans',
    'subscriptions',
  ];
  const before = await Promise.all(tables.map((table) => db.all(`SELECT * FROM ${table}`)));
  await bootstrapIgorCompany(db);
  await seed(db);
  assert.deepEqual(
    await Promise.all(tables.map((table) => db.all(`SELECT * FROM ${table}`))),
    before,
  );
});

test('Gradefy foundation: database refuses a second company, foreign memberships and duplicate current subscriptions', async (t) => {
  const db = await createDatabase('', ':memory:');
  t.after(() => db.close());
  await assert.rejects(
    db.run(
      "INSERT INTO companies (id,slug,name,niche_id,template_id,created_at,updated_at) VALUES ('another','another','Outra Empresa','barbershop','barber-classic','2026-01-01','2026-01-01')",
    ),
    /gradefy_single_company/,
  );
  await assert.rejects(db.run("UPDATE companies SET id='another'"), /gradefy_single_company/);
  await assert.rejects(
    db.run(
      "INSERT INTO company_members (company_id,user_id,role,created_at) VALUES (?,'missing','owner','2026-01-01')",
      [IGOR_COMPANY_ID],
    ),
    /FOREIGN KEY/,
  );
  await assert.rejects(
    db.run(
      "INSERT INTO subscriptions (id,company_id,plan_id,status,source,created_at,updated_at) VALUES ('bad',?,'missing','active','manual','2026-01-01','2026-01-01')",
      [IGOR_COMPANY_ID],
    ),
    /FOREIGN KEY/,
  );
  await db.run(
    "INSERT INTO subscriptions (id,company_id,plan_id,status,source,created_at,updated_at) VALUES ('first',?,'individual','active','manual','2026-01-01','2026-01-01')",
    [IGOR_COMPANY_ID],
  );
  await assert.rejects(
    db.run(
      "INSERT INTO subscriptions (id,company_id,plan_id,status,source,created_at,updated_at) VALUES ('duplicate',?,'team','pending','manual','2026-01-01','2026-01-01')",
      [IGOR_COMPANY_ID],
    ),
    /UNIQUE/,
  );
});
