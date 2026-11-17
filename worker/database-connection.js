export function workerDatabaseConnection(env) {
  if (env.HYPERDRIVE?.connectionString) return env.HYPERDRIVE.connectionString;

  // Direct PostgreSQL is only for the isolated, disposable local Worker test.
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (
        ['postgres:', 'postgresql:'].includes(url.protocol) &&
        ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
      )
        return env.DATABASE_URL;
    } catch {
      // An invalid URL is treated as an absent connection.
    }
  }
  throw new Error('Hyperdrive não configurado para o Worker.');
}
