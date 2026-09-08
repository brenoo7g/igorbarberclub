import { createDatabase } from './database.js';
import { createApp } from './app.js';
import { seed } from './seed.js';
import { createNotificationProcessor } from './notifications.js';

export function serverlessConfig(env = process.env) {
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL;
  const appUrl =
    env.APP_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : env.VERCEL_URL
        ? `https://${env.VERCEL_URL}`
        : '');
  const missing = [];
  if (!databaseUrl || !/^postgres(?:ql)?:\/\//.test(databaseUrl)) missing.push('DATABASE_URL');
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) missing.push('JWT_SECRET');
  try {
    if (new URL(appUrl).protocol !== 'https:') missing.push('APP_URL');
  } catch {
    missing.push('APP_URL');
  }
  if (missing.length) {
    const error = new Error('Configure o banco e a autenticação no ambiente da Vercel.');
    error.code = 'SERVER_NOT_CONFIGURED';
    error.missing = missing;
    throw error;
  }
  return { databaseUrl, appUrl };
}

// Reuse the pool and app within a warm function instance. A failed initialization
// clears the promise so a later request can recover from a transient DB outage.
let runtimePromise;
export function getServerlessRuntime() {
  if (!runtimePromise) {
    runtimePromise = initialize().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

async function initialize() {
  const config = serverlessConfig();
  process.env.APP_URL = config.appUrl;
  const db = await createDatabase(config.databaseUrl);
  try {
    await db.transaction(async (tx) => {
      await tx.run('SELECT pg_advisory_xact_lock(789127)');
      await seed(tx);
    });
    return {
      app: createApp(db, { secret: process.env.JWT_SECRET, serveStatic: false }),
      processNotifications: createNotificationProcessor(db, { batchSize: 2 }),
    };
  } catch (error) {
    await db.close();
    throw error;
  }
}
