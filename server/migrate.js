import 'dotenv/config';
import { createDatabase } from './database.js';

// Applies the same initialization as the application, without starting HTTP, creating demo
// users, resetting credentials or sending notifications. Always backs onto the configured DB.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (
  (process.env.VERCEL || process.env.NODE_ENV === 'production') &&
  !/^postgres(?:ql)?:\/\//.test(url || '')
)
  throw new Error('Defina DATABASE_URL ou POSTGRES_URL PostgreSQL antes de migrar em produção.');
const db = await createDatabase(url);
try {
  const rows = await db.all('SELECT version,name FROM schema_migrations ORDER BY version');
  console.log(
    'Migrations verificadas:',
    rows.map((row) => `${row.version} ${row.name}`).join(', '),
  );
  console.log(
    'Fundação Gradefy pronta. Igor permanece a única empresa; plano não é atribuído automaticamente.',
  );
} finally {
  await db.close();
}
