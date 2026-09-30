import 'dotenv/config';
import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { seed, demoMode } from './seed.js';
import { startCompanyNotifications } from './notifications.js';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('Defina JWT_SECRET com pelo menos 32 caracteres.');
  if (!process.env.APP_URL?.startsWith('https://'))
    throw new Error('Defina APP_URL com a URL HTTPS pública.');
}
const testGuestAccess = process.argv.includes('--guest-test-mode');
if (testGuestAccess && (!demoMode || process.env.VERCEL || process.env.NODE_ENV === 'production'))
  throw new Error('O acesso simplificado só pode iniciar em demonstração local.');
if (testGuestAccess) {
  // Never send test reservations or recovery requests through real providers.
  for (const key of [
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_CONTENT_SID',
    'JWT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
  ])
    delete process.env[key];
  console.log(
    'Modo de teste: banco temporário separado; os dados são descartados ao encerrar. Defina APP_URL para o endereço usado no navegador.',
  );
}
const db = testGuestAccess ? await createDatabase('', ':memory:') : await createDatabase();
await seed(db);
const stopNotifications = startCompanyNotifications(db);
const port = Number(process.env.PORT || 3001);
const app = createApp(db, { testGuestAccess });
const recoveryTimer = setInterval(() => void app.locals.processPasswordEmails(), 15000);
recoveryTimer.unref();
const server = app.listen(port, () =>
  console.log(`Igor Barber Club API: http://localhost:${port} (${db.dialect})`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopNotifications();
    clearInterval(recoveryTimer);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
