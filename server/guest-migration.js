// Called inside the schema transaction, before the connection is exposed to requests.
export async function migrateGuestBookings(tx) {
  let columns =
    tx.dialect === 'postgres'
      ? await tx.all(
          "SELECT column_name AS name,is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='appointments'",
        )
      : await tx.all('PRAGMA table_info(appointments)');
  const owner = columns.find((column) => column.name === 'user_id');
  if (tx.dialect === 'postgres' && owner.is_nullable === 'NO')
    await tx.run('ALTER TABLE appointments ALTER COLUMN user_id DROP NOT NULL');
  if (tx.dialect === 'sqlite' && owner.notnull) {
    const table = await tx.get(
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name='appointments'",
    );
    const definitions = await tx.all(
      "SELECT sql FROM sqlite_schema WHERE tbl_name='appointments' AND type IN ('index','trigger') AND sql IS NOT NULL",
    );
    const replacement = table.sql
      .replace(
        /^CREATE TABLE (?:IF NOT EXISTS )?["`]?appointments["`]?/i,
        'CREATE TABLE appointments_guest_migration',
      )
      .replace(/\buser_id\s+TEXT\s+NOT NULL/i, 'user_id TEXT');
    if (replacement === table.sql || /\buser_id\s+TEXT\s+NOT NULL/i.test(replacement))
      throw new Error('Unsupported appointments schema for guest migration.');
    await tx.run(replacement);
    const names = columns.map((column) => `"${column.name.replaceAll('"', '""')}"`).join(',');
    await tx.run(
      `INSERT INTO appointments_guest_migration (${names}) SELECT ${names} FROM appointments`,
    );
    await tx.run('DROP TABLE appointments');
    await tx.run('ALTER TABLE appointments_guest_migration RENAME TO appointments');
    for (const definition of definitions) await tx.run(definition.sql);
  }
  for (const name of ['guest_name', 'guest_email', 'guest_phone']) {
    if (!columns.some((column) => column.name === name))
      await tx.run(`ALTER TABLE appointments ADD COLUMN ${name} TEXT`);
  }
  if (tx.dialect === 'sqlite' && (await tx.all('PRAGMA foreign_key_check')).length)
    throw new Error('Guest migration failed foreign key validation.');
}
