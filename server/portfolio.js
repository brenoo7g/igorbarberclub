import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const details = z.object({
  title: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(40),
});
const imageSchema = z.string().max(1500000);
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
const metadata = ({ id, title, category, version }) => ({
  id,
  title,
  category,
  version,
  image: `/api/portfolio/${id}/image?v=${version}`,
});

async function normalizeImage(value) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, 'Escolha uma foto JPG, PNG ou WebP.');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 1024 * 1024) fail(413, 'A foto é muito grande. Escolha outra imagem.');
  try {
    const { default: sharp } = await import('sharp');
    const source = sharp(buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    const info = await source.metadata();
    if (info.format !== match[1] || (info.pages || 1) > 1) throw new Error('Invalid image');
    const image = await source
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    return image.toString('base64');
  } catch {
    fail(400, 'Não foi possível ler essa foto. Escolha uma imagem estática válida.');
  }
}

export function installPortfolioRoutes(app, db, { authenticated, admin, authLimiter }) {
  app.get('/api/portfolio', async (_req, res) => {
    res.json(
      (
        await db.all(
          'SELECT id,title,category,version FROM portfolio ORDER BY created_at DESC,id DESC',
        )
      ).map(metadata),
    );
  });
  app.get('/api/portfolio/:id/image', async (req, res) => {
    const row = await db.get('SELECT image FROM portfolio WHERE id=?', [req.params.id]);
    if (!row) fail(404, 'Foto não encontrada.');
    res.type('image/webp').send(Buffer.from(row.image, 'base64'));
  });
  app.post('/api/admin/portfolio', authenticated, admin, authLimiter, async (req, res) => {
    const data = details.extend({ image: imageSchema }).strict().parse(req.body);
    const image = await normalizeImage(data.image);
    const row = { id: randomUUID(), title: data.title, category: data.category, version: 1 };
    await db.transaction(async (tx) => {
      if (tx.dialect === 'postgres') await tx.run('SELECT pg_advisory_xact_lock(789128)');
      const count = await tx.get('SELECT COUNT(*) AS total FROM portfolio');
      if (Number(count.total) >= 40)
        fail(409, 'A galeria permite até 40 fotos. Remova uma foto antes de adicionar outra.');
      await tx.run(
        'INSERT INTO portfolio (id,title,category,image,version,created_at) VALUES (?,?,?,?,?,?)',
        [row.id, row.title, row.category, image, row.version, new Date().toISOString()],
      );
    });
    res.status(201).json(metadata(row));
  });
  app.put('/api/admin/portfolio/:id', authenticated, admin, authLimiter, async (req, res) => {
    const data = details
      .extend({ image: imageSchema.optional(), version: z.number().int().positive() })
      .strict()
      .parse(req.body);
    const image = data.image ? await normalizeImage(data.image) : null;
    const result = await db.transaction(async (tx) => {
      const row = await tx.get(
        `SELECT id,version FROM portfolio WHERE id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,
        [req.params.id],
      );
      if (!row) fail(404, 'Esta foto foi removida. Atualize a galeria.');
      if (row.version !== data.version)
        fail(409, 'Esta foto foi alterada em outra aba. Feche a edição e atualize a galeria.');
      await tx.run(
        'UPDATE portfolio SET title=?,category=?,image=COALESCE(?,image),version=version+1 WHERE id=?',
        [data.title, data.category, image, row.id],
      );
      return metadata({
        ...row,
        title: data.title,
        category: data.category,
        version: row.version + 1,
      });
    });
    res.json(result);
  });
  app.delete('/api/admin/portfolio/:id', authenticated, admin, async (req, res) => {
    await db.run('DELETE FROM portfolio WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  });
}
