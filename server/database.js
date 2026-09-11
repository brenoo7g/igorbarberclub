import 'dotenv/config';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrateGuestBookings } from './guest-migration.js';
import { seedPortfolio } from './portfolio-seed.js';

export async function createDatabase(
  url = process.env.DATABASE_URL,
  path = process.env.SQLITE_PATH || './data/barber.db',
) {
  let db;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 5000,
    });
    // Idle pooled connections may be terminated by the database provider.
    pool.on('error', (error) => console.error('PostgreSQL pool error:', error.code || error.name));
    if (process.env.VERCEL) {
      const { attachDatabasePool } = await import('@vercel/functions');
      attachDatabasePool(pool);
    }
    const wrap = (client) => ({
      dialect: 'postgres',
      async all(sql, args = []) {
        let n = 0;
        return (
          await client.query(
            sql.replace(/\?/g, () => `$${++n}`),
            args,
          )
        ).rows;
      },
      async get(sql, args = []) {
        return (await this.all(sql, args))[0];
      },
      async run(sql, args = []) {
        let n = 0;
        return client.query(
          sql.replace(/\?/g, () => `$${++n}`),
          args,
        );
      },
    });
    db = {
      ...wrap(pool),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const value = await fn(wrap(client));
          await client.query('COMMIT');
          return value;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    const sqlite = new DatabaseSync(path);
    sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    let queue = Promise.resolve();
    const direct = {
      dialect: 'sqlite',
      async all(sql, args = []) {
        return sqlite.prepare(sql).all(...args);
      },
      async get(sql, args = []) {
        return sqlite.prepare(sql).get(...args);
      },
      async run(sql, args = []) {
        return sqlite.prepare(sql).run(...args);
      },
    };
    // Queue every connection operation, so readers cannot see an uncommitted transaction.
    const enqueue = (fn) => {
      const result = queue.then(fn);
      queue = result.catch(() => {});
      return result;
    };
    db = {
      dialect: 'sqlite',
      all: (...args) => enqueue(() => direct.all(...args)),
      get: (...args) => enqueue(() => direct.get(...args)),
      run: (...args) => enqueue(() => direct.run(...args)),
      transaction: (fn) =>
        enqueue(async () => {
          sqlite.exec('BEGIN IMMEDIATE');
          try {
            const value = await fn(direct);
            sqlite.exec('COMMIT');
            return value;
          } catch (e) {
            sqlite.exec('ROLLBACK');
            throw e;
          }
        }),
      close: () => enqueue(() => sqlite.close()),
    };
  }
  let stage = 'database-schema-file';
  try {
    const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
    stage = 'database-connection';
    // SQLite requires this outside the transaction when rebuilding a NOT NULL column.
    // The database is not yet available to application requests.
    if (db.dialect === 'sqlite') await db.run('PRAGMA foreign_keys=OFF');
    await db.transaction(async (tx) => {
      stage = 'database-schema';
      if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789127)');
      for (const statement of schema
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        await tx.run(statement);
      // Additive, repeatable migration for existing installations. Runs under the schema lock.
      const columns =
        tx.dialect === 'postgres'
          ? await tx.all(
              "SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='users'",
            )
          : await tx.all('PRAGMA table_info(users)');
      for (const [name, definition] of [
        ['avatar', 'TEXT'],
        ['profile_version', 'INTEGER NOT NULL DEFAULT 0'],
        ['session_version', 'INTEGER NOT NULL DEFAULT 0'],
      ]) {
        if (!columns.some((column) => column.name === name))
          await tx.run(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      }
      await migrateGuestBookings(tx);
      await seedPortfolio(tx);
    });
    if (db.dialect === 'sqlite') await db.run('PRAGMA foreign_keys=ON');
  } catch (error) {
    error.initializationStage = stage;
    await db.close();
    throw error;
  }
  return db;
}
