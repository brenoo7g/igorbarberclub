import { IGOR_COMPANY_ID } from '../server/company-bootstrap.js';
process.env.DEMO_MODE = 'true';
process.env.APP_URL = 'http://127.0.0.1:4173';
const { createDatabase } = await import('../server/database.js');
const { seed } = await import('../server/seed.js');
const { createApp } = await import('../server/app.js');
const db = await createDatabase('', ':memory:');
await seed(db);
const { installBarberClassicFixture } = await import('./helpers/barber-classic.js');
await installBarberClassicFixture(db);
// Isolated recovery fixture: no real email transport is started by this test server.
const { createHash } = await import('node:crypto');
const recoveryHash = (
  await db.get("SELECT password_hash FROM users WHERE email='cliente@example.com'")
).password_hash;
await db.run(
  'INSERT INTO users (id,name,email,phone,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)',
  [
    'recovery-browser',
    'Cliente Recuperação',
    'recovery-browser@example.com',
    '21999999999',
    recoveryHash,
    'client',
    new Date().toISOString(),
  ],
);
await db.run(
  'INSERT INTO password_recovery (id,user_id,email,session_version,token_hash,event,created_at,expires_at,next_attempt_at,status) VALUES (?,?,?,?,?,?,?,?,?,?)',
  [
    'recovery-browser-token',
    'recovery-browser',
    'recovery-browser@example.com',
    0,
    createHash('sha256').update('a'.repeat(64)).digest('hex'),
    'reset',
    new Date().toISOString(),
    new Date(Date.now() + 1800000).toISOString(),
    new Date().toISOString(),
    'sent',
  ],
);
await db.run(
  `INSERT INTO barbers (company_id,id,name,specialty) VALUES ('${IGOR_COMPANY_ID}',?,?,?)`,
  ['week-qa', 'Agenda QA', 'Teste de abertura semanal'],
);
await db.run(
  "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) SELECT company_id,'week-qa',id,'2026' FROM services WHERE company_id=?",
  [IGOR_COMPANY_ID],
);
await db.run(
  "INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,'service-qa','Somente Barba QA','Teste de associação')",
  [IGOR_COMPANY_ID],
);
await db.run(
  "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,'service-qa','barba','2026')",
  [IGOR_COMPANY_ID],
);
const { testSiteStorage } = await import('./helpers/site-storage.js');
const { installDashboardBrowserFixture } = await import('./helpers/dashboard-browser.js');
await installDashboardBrowserFixture(db, recoveryHash);
createApp(db, { test: true, siteStorage: testSiteStorage() }).listen(4173, '127.0.0.1', () =>
  console.log('Browser test server listening on 4173'),
);
