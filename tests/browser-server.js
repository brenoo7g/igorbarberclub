process.env.DEMO_MODE = 'true';
process.env.APP_URL = 'http://127.0.0.1:4173';
const { createDatabase } = await import('../server/database.js');
const { seed } = await import('../server/seed.js');
const { createApp } = await import('../server/app.js');
const db = await createDatabase('', ':memory:');
await seed(db);
await db.run('INSERT INTO barbers (id,name,specialty) VALUES (?,?,?)', [
  'week-qa',
  'Agenda QA',
  'Teste de abertura semanal',
]);
createApp(db, { test: true }).listen(4173, '127.0.0.1', () =>
  console.log('Browser test server listening on 4173'),
);
