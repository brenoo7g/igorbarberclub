import { createServer } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createCompanyNotificationDispatcher } from '../server/notifications.js';
import { createCloudflareImageProcessor } from './image-processor.js';
import { createSiteStorage } from '../server/site-storage.js';
import { migrations } from '../server/migrations.js';
import { isIP } from 'node:net';
import { workerDatabaseConnection } from './database-connection.js';

const sensitiveAuth =
  /^\/api\/(?:auth|public\/[^/]+\/auth)\/(?:login|register|forgot-password|reset-password)$/;
const bookingCreation = /^\/api\/public\/[^/]+\/appointments(?:\/guest)?$/;

async function withApplication(env, fn, { http = false } = {}) {
  const connectionString = workerDatabaseConnection(env);
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString))
    throw new Error('PostgreSQL não configurado para o Worker.');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    throw new Error('JWT_SECRET não configurado para o Worker.');
  if (env.EMAIL_DELIVERY_MODE !== 'disabled')
    throw new Error('Envio de e-mails bloqueado nesta fase.');
  if (env.TWILIO_ACCOUNT_SID || env.TWILIO_AUTH_TOKEN)
    throw new Error('Envio de WhatsApp bloqueado nesta fase.');
  const siteStorage = createSiteStorage(env);
  if (!siteStorage) throw new Error('Storage privado não configurado para o Worker.');

  // A pool belongs to one invocation only. Hyperdrive owns cross-request pooling.
  // This path never runs schema SQL, migrations, bootstrap or seed.
  const db = await createDatabase(connectionString, undefined, { initialize: false });
  let server;
  try {
    const applied = await db.all('SELECT version,name FROM schema_migrations ORDER BY version');
    if (
      applied.length !== migrations.length ||
      applied.some(
        (row, index) =>
          row.version !== migrations[index].version || row.name !== migrations[index].name,
      )
    )
      throw new Error('Migrations pendentes ou inconsistentes no banco do Worker.');

    const app = createApp(db, {
      secret: env.JWT_SECRET,
      serveStatic: false,
      imageProcessor: createCloudflareImageProcessor(env.IMAGES),
      siteStorage,
      workerRuntime: true,
    });
    if (http) {
      // The port is an internal Workers routing key, not a public TCP listener.
      server = createServer(app);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, resolve);
      });
    }
    return await fn({ db, app, port: server?.address().port });
  } finally {
    if (server) await new Promise((resolve) => server.close(() => resolve()));
    await db.close();
  }
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (
        request.method === 'POST' &&
        (sensitiveAuth.test(pathname) || bookingCreation.test(pathname))
      ) {
        const limiter = sensitiveAuth.test(pathname)
          ? env.AUTH_RATE_LIMITER
          : env.BOOKING_RATE_LIMITER;
        if (!limiter) throw new Error('Rate limiter ausente.');
        const edgeIp = request.headers.get('CF-Connecting-IP');
        const key = `${pathname}:${isIP(edgeIp || '') ? edgeIp : 'unknown'}`;
        if (!(await limiter.limit({ key })).success)
          return Response.json(
            { error: 'Muitas tentativas. Aguarde um minuto.' },
            { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
          );
      }
      return await withApplication(env, ({ port }) => handleAsNodeRequest(port, request), {
        http: true,
      });
    } catch (error) {
      console.error('Worker API unavailable:', error.code || error.name);
      return Response.json(
        { error: 'O serviço está temporariamente indisponível.', code: 'SERVER_UNAVAILABLE' },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } },
      );
    }
  },
  async scheduled(_event, env) {
    await withApplication(env, async ({ db, app }) => {
      const dispatch = createCompanyNotificationDispatcher(db, { batchSize: 2 });
      await Promise.all([app.locals.processPasswordEmails(), dispatch()]);
    });
  },
};
