import 'dotenv/config';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export async function createDatabase(
  url = process.env.DATABASE_URL,
  path = process.env.SQLITE_PATH || './data/barber.db',
) {
  let db;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url });
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
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  for (const statement of schema
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.run(statement);
  return db;
}
