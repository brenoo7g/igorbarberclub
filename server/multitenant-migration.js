// Schema maintenance only; called inside the versioned migration transaction.
export async function prepareMultitenantAccess(tx) {
  if (tx.dialect !== 'sqlite') return [];
  const expected = {
    companies:
      'id slug name niche_id template_id status timezone locale currency created_at updated_at',
    company_members: 'company_id user_id role status created_at',
  };
  const objects = [];
  for (const [table, names] of Object.entries(expected)) {
    const columns = (await tx.all(`PRAGMA table_info(${table})`)).map((c) => c.name).sort();
    if (JSON.stringify(columns) !== JSON.stringify(names.split(' ').sort()))
      throw new Error(`Gradefy 004: colunas inesperadas em ${table}; migração cancelada.`);
    objects.push(
      ...(await tx.all(
        "SELECT sql FROM sqlite_schema WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL AND name<>'company_members_user'",
        [table],
      )),
    );
  }
  if ((await tx.all('PRAGMA foreign_key_check')).length)
    throw new Error('Gradefy 004: referências inválidas antes da migração.');
  return objects;
}

export async function finishMultitenantAccess(tx, objects) {
  if (tx.dialect !== 'sqlite') return;
  for (const { sql } of objects) await tx.run(sql);
  if ((await tx.all('PRAGMA foreign_key_check')).length)
    throw new Error('Gradefy 004: referências inválidas após a migração.');
  // All references have been checked after rebuilding the parent with the same IDs.
  await tx.run('PRAGMA defer_foreign_keys=OFF');
}
