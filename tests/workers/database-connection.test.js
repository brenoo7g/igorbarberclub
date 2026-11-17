import assert from 'node:assert/strict';
import test from 'node:test';
import { workerDatabaseConnection } from '../../worker/database-connection.js';

test('Worker exige Hyperdrive para bancos remotos', () => {
  assert.equal(
    workerDatabaseConnection({ HYPERDRIVE: { connectionString: 'postgres://binding' } }),
    'postgres://binding',
  );
  assert.equal(
    workerDatabaseConnection({ DATABASE_URL: 'postgres://local@127.0.0.1:5433/test' }),
    'postgres://local@127.0.0.1:5433/test',
  );
  assert.equal(
    workerDatabaseConnection({ DATABASE_URL: 'postgres://local@[::1]:5433/test' }),
    'postgres://local@[::1]:5433/test',
  );
  assert.throws(
    () => workerDatabaseConnection({ DATABASE_URL: 'postgres://remote@db.example.test/prod' }),
    /Hyperdrive/,
  );
  assert.throws(() => workerDatabaseConnection({ DATABASE_URL: 'not-a-url' }), /Hyperdrive/);
  assert.throws(() => workerDatabaseConnection({}), /Hyperdrive/);
});
