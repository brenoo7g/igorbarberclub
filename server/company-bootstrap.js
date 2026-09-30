export const IGOR_COMPANY_ID = 'igor-barber-club';

// Accepts either the database or the already locked transaction used by serverless seed.
export async function bootstrapIgorCompany(db) {
  if (typeof db.transaction === 'function') return db.transaction(bootstrapIgorCompany);
  if (db.dialect === 'postgres') await db.run('SELECT pg_advisory_xact_lock(789127)');
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO niches (id,name,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING',
    ['barbershop', 'Barbearia', now],
  );
  await db.run(
    'INSERT INTO templates (id,niche_id,name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
    ['barber-classic', 'barbershop', 'Barber Classic', now],
  );
  for (const [id, name, maximum] of [
    ['individual', 'Individual', 1],
    ['team', 'Equipe', null],
  ])
    await db.run(
      'INSERT INTO plans (id,name,max_professionals,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING',
      [id, name, maximum, now],
    );
  await db.run(
    'INSERT INTO companies (id,slug,name,niche_id,template_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
    [
      IGOR_COMPANY_ID,
      'igor-barber-club',
      'Igor Barber Club',
      'barbershop',
      'barber-classic',
      now,
      now,
    ],
  );
  await db.run(
    'INSERT INTO company_settings (company_id,city,region,instagram_url,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(company_id) DO NOTHING',
    [IGOR_COMPANY_ID, 'Campo Grande', 'RJ', 'https://www.instagram.com/igor_barber_club/', now],
  );
  // After 004, membership is authorization. Never recreate a removed membership
  // from the global user role during startup/seed/redeploy.
  const accessApplied = await db.all('SELECT version FROM schema_migrations WHERE version=4');
  if (accessApplied.length) return;
  // Compatibility for checksummed pre-004 upgrades only.
  const administrators = await db.all("SELECT id FROM users WHERE role='admin'");
  for (const user of administrators)
    await db.run(
      'INSERT INTO company_members (company_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(company_id,user_id) DO NOTHING',
      [IGOR_COMPANY_ID, user.id, 'admin', now],
    );
  // Deliberately no subscription: neither the seed nor professional count selects Igor's plan.
}
