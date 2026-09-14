import 'dotenv/config';
import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { seed } from './seed.js';
import { startNotifications } from './notifications.js';

if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('Defina JWT_SECRET com pelo menos 32 caracteres.');
  if (!process.env.APP_URL?.startsWith('https://'))
    throw new Error('Defina APP_URL com a URL HTTPS pública.');
}
const db = await createDatabase();
await seed(db);
const stopNotifications = startNotifications(db);
const port = Number(process.env.PORT || 3001);
const app = createApp(db);
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
