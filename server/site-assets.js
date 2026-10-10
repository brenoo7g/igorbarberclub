import { assertAssetKey } from './site-storage.js';
import { domainError } from './entitlements.js';

export async function readAsset(db, storage, companyId, id) {
  const row = await db.get(
    "SELECT storage_key FROM company_site_assets WHERE company_id=? AND id=? AND status='ready'",
    [companyId, id],
  );
  if (!row) domainError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada.');
  if (!storage)
    domainError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'O armazenamento de imagens ainda não foi configurado.',
    );
  assertAssetKey(companyId, row.storage_key);
  return storage.read(row.storage_key);
}
export async function portfolioImage(db, storage, companyId, id) {
  const row = await db.get('SELECT image FROM portfolio WHERE company_id=? AND id=?', [
    companyId,
    id,
  ]);
  if (!row) domainError(404, 'IMAGE_NOT_FOUND', 'Foto não encontrada.');
  const managed = await db.get(
    'SELECT asset_id FROM portfolio_assets WHERE company_id=? AND portfolio_id=?',
    [companyId, id],
  );
  return managed
    ? readAsset(db, storage, companyId, managed.asset_id)
    : Buffer.from(row.image, 'base64');
}
export async function cleanupAssets(db, storage, companyId) {
  if (!storage) return;
  await db.run(
    "UPDATE company_site_assets SET status='deleting' WHERE company_id=? AND status='pending' AND created_at<?",
    [companyId, new Date(Date.now() - 3600000).toISOString()],
  );
  for (const row of await db.all(
    "SELECT id,storage_key FROM company_site_assets WHERE company_id=? AND status='deleting' ORDER BY created_at LIMIT 10",
    [companyId],
  )) {
    try {
      assertAssetKey(companyId, row.storage_key);
      await storage.remove(row.storage_key);
      await db.run(
        "DELETE FROM company_site_assets WHERE company_id=? AND id=? AND status='deleting'",
        [companyId, row.id],
      );
    } catch {
      /* Durable metadata retains cleanup work for subsequent requests. */
    }
  }
}
export function installSiteAssetRoutes(app, db, companyId, storage) {
  app.get('/site-assets/:id/image', async (req, res) => {
    const id = String(req.params.id);
    const reference = `asset:${id}`;
    const linked = await db.get(
      'SELECT company_id FROM company_settings WHERE company_id=? AND (logo_url=? OR hero_image_url=?)',
      [companyId, reference, reference],
    );
    if (!linked) domainError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada.');
    const image = await readAsset(db, storage, companyId, id);
    await verifyPublicImage(db, companyId, req);
    res.set('Cache-Control', 'no-store').type('image/webp').send(image);
  });
}
export async function verifyPublicImage(db, companyId, req) {
  if (
    req.companyContext.kind === 'public' &&
    !(await db.get("SELECT id FROM companies WHERE id=? AND status='active' AND site_published=1", [
      companyId,
    ]))
  )
    domainError(404, 'IMAGE_NOT_FOUND', 'Imagem não encontrada.');
}
