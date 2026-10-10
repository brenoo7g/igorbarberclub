import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { resolveCompanyContext, requireCompanyRole } from './company-access.js';
import { lockResource, lockCatalog } from './scheduling-locks.js';
import { domainError, lockEntitlements } from './entitlements.js';
import { normalizeSiteImage, assetPrefix } from './site-storage.js';
import { cleanupAssets, readAsset, portfolioImage } from './site-assets.js';
import { publicAsset, getPublicSite } from './public-site.js';
import { publicProfessionals } from './professionals.js';
import { lockPublication, validatePublication } from './site-publication.js';

const version = z.number().int().nonnegative();
const optionalText = (max) => z.string().trim().max(max);
const phone = optionalText(30)
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => !v || /^\d{10,13}$/.test(v), 'Informe um telefone com DDD.');
const https = optionalText(500).refine(
  (v) => !v || (publicAsset(v)?.startsWith('https://') ?? false),
  'Use um link HTTPS válido.',
);
export const siteEditorSchema = z
  .object({
    version,
    name: z.string().trim().min(2).max(100),
    slogan: optionalText(180),
    description: optionalText(1000),
    primary_color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .nullable(),
    secondary_color: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .nullable(),
    whatsapp: phone,
    phone,
    instagram_url: optionalText(200).refine(
      (v) => !v || /^https:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(v),
      'Informe o perfil no Instagram.',
    ),
    address: optionalText(250),
    city: optionalText(100),
    region: optionalText(2).refine((v) => !v || /^[A-Z]{2}$/.test(v)),
    location_url: https,
    sections: z.object({ about: z.boolean(), gallery: z.boolean() }).strict(),
  })
  .strict();
const lockEditor = (tx, cid) => lockResource(tx, cid, 'site-editor', 'settings');
async function authorized(tx, req) {
  if (tx.dialect === 'postgres') {
    await tx.get(
      'SELECT user_id FROM company_members WHERE company_id=? AND user_id=? FOR NO KEY UPDATE',
      [req.companyContext.companyId, req.user.id],
    );
    // No IDs are changed: keep FK KEY SHARE locks from existing catalog/idempotency writes compatible.
    await tx.get('SELECT id FROM companies WHERE id=? FOR NO KEY UPDATE', [
      req.companyContext.companyId,
    ]);
  }
  const context = await resolveCompanyContext(tx, req.user, req.companyContext.companyId);
  if (!['owner', 'manager'].includes(context.role))
    domainError(403, 'COMPANY_ROLE_DENIED', 'Sem permissão para editar este site.');
  const row = await tx.get(
    "SELECT c.id,c.name,c.slug,c.site_published,c.template_id,s.* FROM companies c JOIN company_settings s ON s.company_id=c.id WHERE c.id=? AND c.status='active'",
    [context.companyId],
  );
  if (!row || row.template_id !== 'barber-classic')
    domainError(409, 'TEMPLATE_UNAVAILABLE', 'O editor está disponível para Barber Classic.');
  return row;
}
function assertVersion(row, expected) {
  if (row.site_version !== expected)
    domainError(
      409,
      'SITE_VERSION_CONFLICT',
      'O site foi alterado em outra aba. Recarregue os dados antes de salvar.',
    );
}
const fields = [
  'slogan',
  'description',
  'primary_color',
  'secondary_color',
  'whatsapp',
  'phone',
  'instagram_url',
  'address',
  'city',
  'region',
  'location_url',
];
const imageUrl = (cid, id) =>
  `/api/company-site/assets/${encodeURIComponent(id)}/image?company=${encodeURIComponent(cid)}`;
export async function siteEditorImage(db, cid, value) {
  if (!value?.startsWith('asset:')) return publicAsset(value);
  const id = value.slice(6);
  return (await db.get(
    "SELECT id FROM company_site_assets WHERE company_id=? AND id=? AND status='ready'",
    [cid, id],
  ))
    ? imageUrl(cid, id)
    : null;
}
export async function siteEditorSnapshot(db, cid, storage) {
  const row = await db.get(
    'SELECT c.id,c.name,c.slug,c.site_published,s.* FROM companies c JOIN company_settings s ON s.company_id=c.id WHERE c.id=?',
    [cid],
  );
  let sections = { about: true, gallery: true };
  try {
    sections = { ...sections, ...JSON.parse(row.sections_json || '{}') };
  } catch {}
  const gallery = await db.all(
    'SELECT id,title,version FROM portfolio WHERE company_id=? ORDER BY sort_order,created_at DESC,id DESC',
    [cid],
  );
  return {
    company: { id: cid, name: row.name, slug: row.slug, sitePublished: row.site_published === 1 },
    settings: {
      ...Object.fromEntries(fields.map((f) => [f, row[f] ?? ''])),
      primary_color: row.primary_color,
      secondary_color: row.secondary_color,
      sections,
      version: row.site_version,
    },
    images: {
      logo: await siteEditorImage(db, cid, row.logo_url),
      banner: await siteEditorImage(db, cid, row.hero_image_url),
    },
    gallery: gallery.map((g) => ({
      ...g,
      image: `/api/company-site/gallery/${encodeURIComponent(g.id)}/image?company=${encodeURIComponent(cid)}`,
    })),
    storage: {
      configured: !!storage,
      maxBytes: 3145728,
      formats: ['image/jpeg', 'image/png', 'image/webp'],
      cleanupPending: Number(
        (
          await db.get(
            "SELECT COUNT(*) AS n FROM company_site_assets WHERE company_id=? AND status='deleting'",
            [cid],
          )
        ).n,
      ),
    },
    operations: {
      services: Number(
        (await db.get('SELECT COUNT(*) AS n FROM services WHERE company_id=? AND active=1', [cid]))
          .n,
      ),
      professionals: Number(
        (await db.get('SELECT COUNT(*) AS n FROM barbers WHERE company_id=? AND active=1', [cid]))
          .n,
      ),
    },
  };
}
export function installCompanySite(app, db, { authenticated, storage }) {
  app.use('/api/company-site', authenticated, async (req, _res, next) => {
    req.companyContext = await resolveCompanyContext(
      db,
      req.user,
      req.get('X-Gradefy-Company-Id') ?? req.query.company,
    );
    requireCompanyRole(req, _res, next);
  });
  const transaction = (req, perform, visibility = false) =>
    db.transaction(async (tx) => {
      await lockEditor(tx, req.companyContext.companyId);
      if (visibility) {
        await lockPublication(tx, req.companyContext.companyId);
        // Professional mutations take this lock before membership rows: preserve that order.
        await lockEntitlements(tx, req.companyContext.companyId);
        // Service creation takes catalog before FK row locks on companies.
        await lockCatalog(tx, req.companyContext.companyId);
      }
      const row = await authorized(tx, req);
      return perform(tx, row);
    });
  const snapshot = (req, source = db) =>
    siteEditorSnapshot(source, req.companyContext.companyId, storage);
  const respond = async (req, res, saved, status = 200) => {
    await cleanupAssets(db, storage, req.companyContext.companyId);
    saved.storage.cleanupPending = Number(
      (
        await db.get(
          "SELECT COUNT(*) AS n FROM company_site_assets WHERE company_id=? AND status='deleting'",
          [req.companyContext.companyId],
        )
      ).n,
    );
    res.status(status).json(saved);
  };
  const bump = (tx, cid) =>
    tx.run(
      'UPDATE company_settings SET site_version=site_version+1,updated_at=? WHERE company_id=?',
      [new Date().toISOString(), cid],
    );
  app.get('/api/company-site', async (req, res) => {
    await cleanupAssets(db, storage, req.companyContext.companyId);
    res.json(await transaction(req, (tx) => snapshot(req, tx)));
  });
  app.get('/api/company-site/preview', async (req, res) => {
    res.json(
      await transaction(req, async (tx, row) => ({
        site: await getPublicSite(tx, row.company_id, { preview: true }),
        services: await tx.all(
          'SELECT * FROM services WHERE company_id=? AND active=1 ORDER BY price',
          [row.company_id],
        ),
        professionals: await publicProfessionals(tx, row.company_id),
        portfolio: (await snapshot(req, tx)).gallery.map((g) => ({ ...g, category: 'Trabalhos' })),
      })),
    );
  });
  for (const [action, published] of [
    ['publish', 1],
    ['unpublish', 0],
  ]) {
    app.post(`/api/company-site/${action}`, async (req, res) => {
      const data = z.object({ version }).strict().parse(req.body);
      res.json(
        await transaction(
          req,
          async (tx, row) => {
            // Same desired state is a successful retry, including response loss/concurrent clicks.
            if (published) await validatePublication(tx, row, storage);
            if (row.site_published === published) return snapshot(req, tx);
            assertVersion(row, data.version);
            await tx.run('UPDATE companies SET site_published=?,updated_at=? WHERE id=?', [
              published,
              new Date().toISOString(),
              row.company_id,
            ]);
            await bump(tx, row.company_id);
            return snapshot(req, tx);
          },
          true,
        ),
      );
    });
  }
  app.put('/api/company-site', async (req, res) => {
    const data = siteEditorSchema.parse(req.body);
    const saved = await transaction(req, async (tx, row) => {
      assertVersion(row, data.version);
      const cid = row.company_id;
      await tx.run('UPDATE companies SET name=?,updated_at=? WHERE id=?', [
        data.name,
        new Date().toISOString(),
        cid,
      ]);
      await tx.run(
        `UPDATE company_settings SET ${fields.map((f) => `${f}=?`).join(',')},sections_json=? WHERE company_id=?`,
        [...fields.map((f) => data[f]), JSON.stringify(data.sections), cid],
      );
      if (data.name !== row.name)
        await tx.run('UPDATE company_settings SET wordmark_title=NULL WHERE company_id=?', [cid]);
      await bump(tx, cid);
      return snapshot(req, tx);
    });
    res.json(saved);
  });
  app.get('/api/company-site/assets/:id/image', async (req, res) =>
    res
      .type('image/webp')
      .send(await readAsset(db, storage, req.companyContext.companyId, String(req.params.id))),
  );
  app.get('/api/company-site/gallery/:id/image', async (req, res) =>
    res
      .type('image/webp')
      .send(await portfolioImage(db, storage, req.companyContext.companyId, String(req.params.id))),
  );
  app.post(
    '/api/company-site/uploads/:purpose',
    express.raw({ type: () => true, limit: '3mb' }),
    async (req, res) => {
      const purpose = z.enum(['logo', 'banner', 'gallery']).parse(req.params.purpose);
      const expected = z.coerce.number().int().nonnegative().parse(req.get('X-Site-Version'));
      const image = await normalizeSiteImage(req.body, req.get('Content-Type'));
      if (!storage)
        domainError(
          503,
          'STORAGE_NOT_CONFIGURED',
          'Configure o armazenamento privado para enviar imagens.',
        );
      const cid = req.companyContext.companyId,
        id = randomUUID(),
        key = `${assetPrefix(cid)}${id}.webp`;
      await cleanupAssets(db, storage, cid);
      await transaction(req, async (tx, row) => {
        assertVersion(row, expected);
        if (
          Number(
            (await tx.get('SELECT COUNT(*) AS n FROM portfolio WHERE company_id=?', [cid])).n,
          ) >= 40 &&
          purpose === 'gallery'
        )
          domainError(409, 'GALLERY_LIMIT', 'A galeria permite até 40 fotos.');
        if (
          Number(
            (
              await tx.get('SELECT COUNT(*) AS n FROM company_site_assets WHERE company_id=?', [
                cid,
              ])
            ).n,
          ) >= 48
        )
          domainError(
            409,
            'ASSET_LIMIT',
            'Há imagens aguardando limpeza. Tente novamente em instantes.',
          );
        await tx.run(
          "INSERT INTO company_site_assets(id,company_id,purpose,storage_key,status,mime,bytes,width,height,created_at) VALUES(?,?,?,?,'pending','image/webp',?,?,?,?)",
          [id, cid, purpose, key, image.bytes, image.width, image.height, new Date().toISOString()],
        );
      });
      let saved;
      try {
        await storage.put(key, image.buffer);
        saved = await transaction(req, async (tx, row) => {
          assertVersion(row, expected);
          await tx.run(
            "UPDATE company_site_assets SET status='ready' WHERE company_id=? AND id=? AND status='pending'",
            [cid, id],
          );
          if (purpose === 'gallery') {
            const portfolioId = randomUUID();
            const position =
              Number(
                (
                  await tx.get(
                    'SELECT COALESCE(MAX(sort_order),0) AS n FROM portfolio WHERE company_id=?',
                    [cid],
                  )
                ).n,
              ) + 1;
            await tx.run(
              "INSERT INTO portfolio(company_id,id,title,category,image,version,created_at,sort_order) VALUES(?,?,'Fotografia','Trabalhos','',1,?,?)",
              [cid, portfolioId, new Date().toISOString(), position],
            );
            await tx.run(
              'INSERT INTO portfolio_assets(company_id,portfolio_id,asset_id) VALUES(?,?,?)',
              [cid, portfolioId, id],
            );
          } else {
            const field = purpose === 'logo' ? 'logo_url' : 'hero_image_url',
              old = row[field];
            await tx.run(`UPDATE company_settings SET ${field}=? WHERE company_id=?`, [
              `asset:${id}`,
              cid,
            ]);
            if (old?.startsWith('asset:'))
              await tx.run(
                "UPDATE company_site_assets SET status='deleting' WHERE company_id=? AND id=?",
                [cid, old.slice(6)],
              );
          }
          await bump(tx, cid);
          return snapshot(req, tx);
        });
      } catch (error) {
        await db
          .run(
            "UPDATE company_site_assets SET status='deleting' WHERE company_id=? AND id=? AND status='pending'",
            [cid, id],
          )
          .catch(() => {});
        await cleanupAssets(db, storage, cid);
        throw error;
      }
      await respond(req, res, saved, 201);
    },
  );
  app.delete('/api/company-site/images/:purpose', async (req, res) => {
    const purpose = z.enum(['logo', 'banner']).parse(req.params.purpose),
      data = z.object({ version }).strict().parse(req.body);
    const saved = await transaction(req, async (tx, row) => {
      assertVersion(row, data.version);
      const field = purpose === 'logo' ? 'logo_url' : 'hero_image_url';
      await tx.run(`UPDATE company_settings SET ${field}=NULL WHERE company_id=?`, [
        row.company_id,
      ]);
      if (row[field]?.startsWith('asset:'))
        await tx.run(
          "UPDATE company_site_assets SET status='deleting' WHERE company_id=? AND id=?",
          [row.company_id, row[field].slice(6)],
        );
      await bump(tx, row.company_id);
      return snapshot(req, tx);
    });
    await respond(req, res, saved);
  });
  app.delete('/api/company-site/gallery/:id', async (req, res) => {
    const data = z.object({ version }).strict().parse(req.body);
    const saved = await transaction(req, async (tx, row) => {
      assertVersion(row, data.version);
      const cid = row.company_id,
        id = String(req.params.id);
      if (!(await tx.get('SELECT id FROM portfolio WHERE company_id=? AND id=?', [cid, id])))
        domainError(404, 'IMAGE_NOT_FOUND', 'Foto não encontrada.');
      const linked = await tx.get(
        'SELECT asset_id FROM portfolio_assets WHERE company_id=? AND portfolio_id=?',
        [cid, id],
      );
      await tx.run('DELETE FROM portfolio WHERE company_id=? AND id=?', [cid, id]);
      if (linked)
        await tx.run(
          "UPDATE company_site_assets SET status='deleting' WHERE company_id=? AND id=?",
          [cid, linked.asset_id],
        );
      await bump(tx, cid);
      return snapshot(req, tx);
    });
    await respond(req, res, saved);
  });
  app.put('/api/company-site/gallery/order', async (req, res) => {
    const data = z
      .object({ version, ids: z.array(z.string().min(1)).max(40) })
      .strict()
      .parse(req.body);
    const saved = await transaction(req, async (tx, row) => {
      assertVersion(row, data.version);
      const ids = (await tx.all('SELECT id FROM portfolio WHERE company_id=?', [row.company_id]))
        .map((g) => g.id)
        .sort();
      if (JSON.stringify(ids) !== JSON.stringify([...data.ids].sort()))
        domainError(
          400,
          'INVALID_GALLERY_ORDER',
          'Informe todas as fotos desta empresa uma única vez.',
        );
      for (let i = 0; i < data.ids.length; i++)
        await tx.run('UPDATE portfolio SET sort_order=? WHERE company_id=? AND id=?', [
          i + 1,
          row.company_id,
          data.ids[i],
        ]);
      await bump(tx, row.company_id);
      return snapshot(req, tx);
    });
    res.json(saved);
  });
  app.use('/api/company-site', (_req, res) =>
    res.status(404).json({ error: 'Rota não encontrada.' }),
  );
}
