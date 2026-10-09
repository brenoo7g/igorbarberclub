// Only SQLite needs table replacement to extend the existing status CHECK.
export async function prepareProfessionalsMigration(tx) {
  if (tx.dialect !== 'sqlite') return [];
  const expected = 'id company_id plan_id status source starts_at ends_at created_at updated_at'
    .split(' ')
    .sort();
  const actual = (await tx.all('PRAGMA table_info(subscriptions)')).map((c) => c.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Gradefy 006: colunas adicionais em subscriptions exigem migração explícita.');
  // A custom incoming ON DELETE CASCADE could otherwise discard data during DROP TABLE.
  for (const { name } of await tx.all(
    "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )) {
    const quoted = '"' + name.replaceAll('"', '""') + '"';
    if (
      (await tx.all(`PRAGMA foreign_key_list(${quoted})`)).some(
        (fk) => fk.table === 'subscriptions',
      )
    )
      throw new Error(
        'Gradefy 006: dependência externa de subscriptions exige migração explícita.',
      );
  }
  if ((await tx.all('PRAGMA foreign_key_check')).length)
    throw new Error('Gradefy 006: referências inválidas antes da migração.');
  return tx.all(
    "SELECT sql FROM sqlite_schema WHERE tbl_name='subscriptions' AND type IN ('index','trigger') AND sql IS NOT NULL AND name<>'subscriptions_one_current_per_company'",
  );
}

export async function finishProfessionalsMigration(tx, objects) {
  if (tx.dialect !== 'sqlite') return;
  for (const { sql } of objects) await tx.run(sql);
  if ((await tx.all('PRAGMA foreign_key_check')).length)
    throw new Error('Gradefy 006: referências inválidas; alterações revertidas.');
}
