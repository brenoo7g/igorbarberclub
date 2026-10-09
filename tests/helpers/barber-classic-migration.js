import { migrations, readMigration } from '../../server/migrations.js';
export const siteColumns = readMigration(migrations[7]).statements.flatMap((sql) => {
  const m = sql.match(/^ALTER TABLE company_settings ADD COLUMN (\w+)/);
  return m ? [m[1]] : [];
});
export const igorPresentation = {
  favicon_url: '/favicon.svg',
  wordmark_title: 'IGOR',
  wordmark_subtitle: 'BARBER CLUB',
  slogan: 'Mais que um corte. Sua identidade.',
  hero_image_url: '/images/hero.webp',
  about_image_url: '/images/shop.webp',
  description:
    'Em Campo Grande, no coração do Rio, a Igor Barber Club é um espaço para cuidar do visual, trocar uma ideia e sair com a confiança renovada.',
  about_detail:
    'À frente da cadeira, Igor Borges une técnica e personalidade em cada atendimento. Uma trajetória de aprendizado e dedicação à barbearia, com a referência da #batalhadosbarbeirosbrasil.',
  featured_service_ids: '["corte","barba","combo","sobrancelha"]',
  highlight_service_id: 'combo',
};
export function expectBarberClassicMetadata(before) {
  for (const row of before.company_settings || [])
    if (!('logo_url' in row)) {
      Object.assign(row, Object.fromEntries(siteColumns.map((name) => [name, null])));
      if (row.company_id === 'igor-barber-club') Object.assign(row, igorPresentation);
    }
  for (const row of [...(before.barbers || []), ...(before.professionals || [])])
    if (!('photo_url' in row)) row.photo_url = null;
}
// Test-only rollback of schema metadata in a disposable fixture, never a production migration.
export async function reconstructBeforeBarberClassic(db) {
  if (!(await db.get('SELECT version FROM schema_migrations WHERE version=8'))) return;
  for (const column of siteColumns)
    await db.run(`ALTER TABLE company_settings DROP COLUMN ${column}`);
  await db.run('ALTER TABLE barbers DROP COLUMN photo_url');
  await db.run('DELETE FROM schema_migrations WHERE version=8');
}
