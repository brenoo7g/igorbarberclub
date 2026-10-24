import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Provision only a BRAND NEW local SQLite database. Ignore every production URL
// and .env, and never start workers, seed users or contact Resend/DNS.
process.env.DOTENV_CONFIG_PATH = process.platform === 'win32' ? 'NUL' : '/dev/null';
process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';
process.env.EMAIL_DELIVERY_MODE = 'disabled';
const directory = await mkdtemp(join(tmpdir(), 'gradefy-email-alpha-'));
const path = join(directory, 'homologation.sqlite');
const { createDatabase } = await import('../server/database.js');
const db = await createDatabase('', path);
try {
  const counts = {};
  for (const table of [
    'users',
    'appointments',
    'notifications',
    'password_recovery',
    'email_deliveries',
  ]) {
    counts[table] = Number((await db.get(`SELECT COUNT(*) AS n FROM ${table}`)).n);
    if (counts[table] !== 0)
      throw new Error('Homologation must contain no user or notification history.');
  }
  console.log(
    JSON.stringify(
      { database: path, mode: 'disabled', counts, productionAccess: false, emailSent: false },
      null,
      2,
    ),
  );
} finally {
  await db.close();
}
