import { readFileSync } from 'node:fs';

// Imported once, under the database schema lock. Removed/edited photos stay that way on redeploy.
export async function seedPortfolio(tx) {
  const migration = 'igor-real-portfolio-2026-09-10';
  if (await tx.get('SELECT id FROM content_migrations WHERE id=?', [migration])) return;
  const photos = [
    ['1', 'Degradê com acabamento marcado', '2023-05-18'],
    ['2', 'Disfarçado na régua', '2023-05-19'],
    ['3', 'Degradê com topo texturizado', '2025-04-25'],
    ['4', 'Corte baixo com acabamento', '2025-07-09'],
    ['5', 'Degradê no Club', '2025-10-08'],
  ];
  for (const [number, title, date] of photos) {
    const image = readFileSync(
      new URL(`./portfolio-photos/corte-${number}.webp`, import.meta.url),
    ).toString('base64');
    await tx.run(
      'INSERT INTO portfolio (id,title,category,image,version,created_at) VALUES (?,?,?,?,?,?)',
      [`igor-corte-${number}`, title, 'Degradês', image, 1, `${date}T12:00:00.000Z`],
    );
  }
  await tx.run('INSERT INTO content_migrations (id) VALUES (?)', [migration]);
}
