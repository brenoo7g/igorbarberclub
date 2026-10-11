import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { runMigrations } from '../../server/migrations.js';
import { reconstructBeforeSiteEditor } from './site-editor-migration.js';
import { testSiteStorage } from './site-storage.js';

export async function assertSiteEditor(t, db, second = db) {
  await seed(db);
  const legacyTables = [
    'companies',
    'company_settings',
    'company_members',
    'portfolio',
    'services',
    'barbers',
    'subscriptions',
  ];
  const legacy = () =>
    Promise.all(
      legacyTables.map((table) =>
        db.all(
          `SELECT * FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}='igor-barber-club' ORDER BY 1`,
        ),
      ),
    );
  const before = await legacy();
  await t.test(
    '011 preserves legacy, checksums and images; failure rolls back and repeated migration is inert',
    async () => {
      await reconstructBeforeSiteEditor(db);
      const history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
      const faulty = {
        transaction: (fn) =>
          db.transaction((tx) =>
            fn({
              ...tx,
              run: (sql, args) => {
                if (sql.startsWith('CREATE TABLE portfolio_assets'))
                  throw new Error('injected 011 failure');
                return tx.run(sql, args);
              },
            }),
          ),
      };
      await assert.rejects(runMigrations(faulty), /injected 011 failure/);
      await assert.rejects(db.all('SELECT site_version FROM company_settings'));
      await assert.rejects(db.all('SELECT * FROM company_site_assets'));
      assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), history);
      assert.deepEqual(await runMigrations(db), [11, 12, 13]);
      assert.deepEqual(await runMigrations(db), []);
      assert.deepEqual(
        await db.all('SELECT * FROM schema_migrations WHERE version<11 ORDER BY version'),
        history,
      );
      assert.deepEqual(await legacy(), before);
    },
  );
  const secret = 'site-editor-disposable-secret',
    cookies = {};
  for (const id of ['site-owner', 'site-manager', 'site-pro', 'site-owner-b', 'site-outsider']) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','test','client','2026')",
      [id, id, `${id}@example.test`],
    );
    cookies[id] =
      `session=${jwt.sign({ version: 0 }, secret, { subject: id, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  }
  for (const id of ['site-a', 'site-b']) {
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',0,'2026','2026')",
      [id, id, id],
    );
    await db.run("INSERT INTO company_settings(company_id,updated_at) VALUES(?,'2026')", [id]);
  }
  for (const [cid, user, role] of [
    ['site-a', 'site-owner', 'owner'],
    ['site-a', 'site-manager', 'manager'],
    ['site-a', 'site-pro', 'professional'],
    ['site-b', 'site-owner-b', 'owner'],
  ])
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,'2026')",
      [cid, user, role],
    );
  const storage = testSiteStorage();
  let failOn = null;
  const faulty = {
    ...db,
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (failOn && sql.startsWith(failOn)) {
              failOn = null;
              throw Object.assign(new Error('injected editor failure'), { status: 503 });
            }
            return tx.run(sql, args);
          },
        }),
      ),
  };
  const servers = [db, second, faulty, db].map((source, i) =>
    createApp(source, {
      secret,
      test: true,
      serveStatic: false,
      siteStorage: i === 3 ? null : storage,
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const s of servers) await new Promise((resolve) => s.close(resolve));
  });
  async function req(
    user = 'site-owner',
    path = '',
    method = 'GET',
    body,
    instance = 0,
    cid = 'site-a',
    type = 'application/json',
    version,
  ) {
    const r = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path.startsWith('/api:') ? path.slice(5) : '/company-site' + path}`,
      {
        method,
        headers: {
          'Content-Type': type,
          ...(user ? { Cookie: cookies[user] } : {}),
          ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
          ...(version === undefined ? {} : { 'X-Site-Version': String(version) }),
        },
        ...(body === undefined
          ? {}
          : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      },
    );
    return {
      status: r.status,
      headers: r.headers,
      data: r.headers.get('content-type')?.includes('application/json')
        ? await r.json()
        : Buffer.from(await r.arrayBuffer()),
    };
  }
  const state = async (user = 'site-owner', cid = 'site-a') =>
    (await req(user, '', 'GET', undefined, 0, cid)).data;
  const payload = async (user = 'site-owner', cid = 'site-a') => {
    const s = await state(user, cid);
    return { ...s.settings, name: s.company.name };
  };
  const image = await sharp({
    create: { width: 18, height: 22, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  const upload = async (purpose = 'logo', user = 'site-owner', cid = 'site-a', instance = 0) =>
    req(
      user,
      `/uploads/${purpose}`,
      'POST',
      image,
      instance,
      cid,
      'image/png',
      (await state(user, cid)).settings.version,
    );
  await t.test(
    'owner/manager authorization, no Igor fallback, strict company and private reads',
    async () => {
      assert.equal((await req(null)).status, 401);
      assert.equal((await req('site-outsider')).status, 403);
      assert.equal((await req('site-pro')).status, 403);
      assert.equal((await req('site-owner-b')).status, 403);
      assert.equal((await req('site-owner', '', 'GET', undefined, 0, 'site-b')).status, 403);
      assert.equal((await req('site-manager')).status, 200);
      assert.equal(
        (await req('site-owner', '', 'GET', undefined, 0, 'igor-barber-club')).status,
        403,
      );
      assert.equal((await req('site-owner', '/api:/public/site-a/site')).status, 404);
      assert.equal((await state()).company.sitePublished, false);
    },
  );
  await t.test(
    'identity/contact/colors/sections save durably, manager edit and stale/concurrent saves',
    async () => {
      const body = {
        ...(await payload()),
        name: 'Minha Barbearia',
        slogan: 'Meu estilo',
        description: 'Descrição empresarial.',
        phone: '(21) 99999-8888',
        whatsapp: '21999998888',
        instagram_url: 'https://instagram.com/meu_espaco/',
        city: 'Rio de Janeiro',
        region: 'RJ',
        address: 'Rua Um, 10',
        location_url: 'https://maps.google.com/?q=Rua+Um',
        primary_color: '#123456',
        secondary_color: '#abcdef',
        sections: { about: false, gallery: true },
      };
      const saved = await req('site-owner', '', 'PUT', body);
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      assert.equal(saved.data.settings.version, 1);
      assert.equal(saved.data.settings.phone, '21999998888');
      assert.equal((await state()).company.name, 'Minha Barbearia');
      assert.deepEqual((await state()).settings.sections, { about: false, gallery: true });
      assert.equal((await req('site-owner', '', 'PUT', body)).data.code, 'SITE_VERSION_CONFLICT');
      for (const patch of [
        { company_id: 'site-b' },
        { site_published: 1 },
        { logo_url: 'https://other.example.test/a.svg' },
        { primary_color: 'red;display:none' },
        { location_url: 'javascript:alert(1)' },
        { instagram_url: 'https://evil.test/name' },
      ])
        assert.equal(
          (await req('site-owner', '', 'PUT', { ...(await payload()), ...patch })).status,
          400,
        );
      const current = await payload();
      const races = await Promise.all([
        req('site-owner', '', 'PUT', { ...current, slogan: 'Um' }, 0),
        req('site-manager', '', 'PUT', { ...current, slogan: 'Dois' }, 1),
      ]);
      assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        (await req('site-manager', '', 'PUT', { ...(await payload()), slogan: 'Gestor editou' }))
          .status,
        200,
      );
      assert.equal((await state()).settings.slogan, 'Gestor editou');
      assert.equal(
        (await db.get("SELECT site_published FROM companies WHERE id='site-a'")).site_published,
        0,
      );
      assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM subscriptions')).n), 0);
    },
  );
  await t.test(
    'real image decoding, MIME/size checks, no configured provider and no new base64 persistence',
    async () => {
      const v = (await state()).settings.version;
      for (const [buffer, type] of [
        [Buffer.from('<svg><script/></svg>'), 'image/svg+xml'],
        [Buffer.from('MZ executable'), 'image/jpeg'],
        [image, 'image/jpeg'],
        [Buffer.from('<html/>'), 'image/png'],
      ])
        assert.equal(
          (await req('site-owner', '/uploads/logo', 'POST', buffer, 0, 'site-a', type, v)).status,
          400,
        );
      assert.equal(
        (
          await req(
            'site-owner',
            '/uploads/logo',
            'POST',
            Buffer.alloc(3145729),
            0,
            'site-a',
            'image/png',
            v,
          )
        ).status,
        413,
      );
      assert.equal(
        (await req('site-owner', '/uploads/logo', 'POST', image, 3, 'site-a', 'image/png', v)).data
          .code,
        'STORAGE_NOT_CONFIGURED',
      );
      assert.equal(
        (await req('site-owner', '', 'GET', undefined, 3)).data.storage.configured,
        false,
      );
      const saved = await upload();
      assert.equal(saved.status, 201, JSON.stringify(saved.data));
      assert.ok(saved.data.images.logo.includes('/api/company-site/assets/'));
      const asset = await db.get(
        "SELECT * FROM company_site_assets WHERE company_id='site-a' AND purpose='logo'",
      );
      assert.equal(asset.mime, 'image/webp');
      assert.equal(asset.width, 18);
      assert.equal((await sharp(storage.objects.get(asset.storage_key)).metadata()).format, 'webp');
      const read = await req('site-owner', `/assets/${asset.id}/image`);
      assert.equal(read.status, 200);
      assert.equal(read.headers.get('cache-control'), 'no-store');
      assert.equal(
        (await req('site-owner-b', `/assets/${asset.id}/image`, 'GET', undefined, 0, 'site-b'))
          .status,
        404,
      );
      assert.equal((await req(null, `/assets/${asset.id}/image`)).status, 401);
      assert.equal(
        (await req('site-owner', `/api:/public/site-a/site-assets/${asset.id}/image`)).status,
        404,
      );
      assert.ok(!JSON.stringify(saved.data).includes('storage_key'));
      assert.ok(!JSON.stringify(saved.data).includes('base64'));
    },
  );
  await t.test(
    'logo replacement, banner, gallery/order/deletion and tenant foreign-key protection',
    async () => {
      assert.equal((await upload('logo', 'site-owner-b', 'site-b')).status, 201);
      const b = await db.get("SELECT * FROM company_site_assets WHERE company_id='site-b'");
      const old = await db.get(
        "SELECT * FROM company_site_assets WHERE company_id='site-a' AND purpose='logo'",
      );
      assert.equal((await upload()).status, 201);
      assert.equal(storage.objects.has(old.storage_key), false);
      assert.equal(storage.objects.has(b.storage_key), true);
      assert.equal((await upload('banner')).status, 201);
      assert.equal((await upload('gallery')).status, 201);
      assert.equal((await upload('gallery')).status, 201);
      const gallery = (await state()).gallery;
      assert.equal(gallery.length, 2);
      assert.ok(
        (await db.all("SELECT image FROM portfolio WHERE company_id='site-a'")).every(
          (r) => r.image === '',
        ),
      );
      assert.equal(
        (
          await req('site-owner', '/gallery/order', 'PUT', {
            version: (await state()).settings.version,
            ids: gallery.map((g) => g.id).reverse(),
          })
        ).status,
        200,
      );
      assert.deepEqual(
        (await state()).gallery.map((g) => g.id),
        gallery.map((g) => g.id).reverse(),
      );
      const item = (await state()).gallery[0];
      assert.equal((await req('site-owner', `/gallery/${item.id}/image`)).status, 200);
      assert.equal(
        (
          await req(
            'site-owner-b',
            `/gallery/${item.id}`,
            'DELETE',
            { version: (await state('site-owner-b', 'site-b')).settings.version },
            0,
            'site-b',
          )
        ).status,
        404,
      );
      await assert.rejects(
        db.run(
          "UPDATE portfolio_assets SET asset_id=? WHERE company_id='site-a' AND portfolio_id=?",
          [b.id, item.id],
        ),
      );
      assert.equal(
        (
          await req('site-owner', '/gallery/order', 'PUT', {
            version: (await state()).settings.version,
            ids: [item.id, item.id],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('site-owner', `/gallery/${item.id}`, 'DELETE', {
            version: (await state()).settings.version,
          })
        ).status,
        200,
      );
      assert.equal((await state()).gallery.length, 1);
      assert.equal(storage.objects.has(b.storage_key), true);
    },
  );
  await t.test(
    'SQL rollback, provider failure compensation and durable deletion retries',
    async () => {
      const prior = await state();
      failOn = 'UPDATE company_settings';
      assert.equal(
        (await req('site-owner', '', 'PUT', { ...(await payload()), name: 'Não gravar' }, 2))
          .status,
        503,
      );
      assert.deepEqual(await state(), prior);
      failOn = "UPDATE company_site_assets SET status='ready'";
      const count = storage.objects.size;
      assert.equal((await upload('banner', 'site-owner', 'site-a', 2)).status, 503);
      assert.equal(storage.objects.size, count);
      assert.equal((await state()).images.banner, prior.images.banner);
      storage.failPut = true;
      assert.equal((await upload()).status, 503);
      storage.failPut = false;
      storage.failRemove = true;
      assert.equal(
        (
          await req('site-owner', '/images/banner', 'DELETE', {
            version: (await state()).settings.version,
          })
        ).status,
        200,
      );
      assert.equal((await state()).images.banner, null);
      assert.ok((await state()).storage.cleanupPending > 0);
      storage.failRemove = false;
      assert.equal((await state()).storage.cleanupPending, 0);
      assert.deepEqual(await legacy(), before);
      assert.equal((await req(null, '/api:/site', 'GET', undefined, 0, null)).status, 200);
      await db.run(
        "UPDATE company_members SET role='professional' WHERE company_id='site-a' AND user_id='site-manager'",
      );
      assert.equal((await req('site-manager')).status, 403);
    },
  );
  await t.test(
    'simultaneous uploads from two connections cannot overwrite the same site version',
    async () => {
      const v = (await state()).settings.version;
      const results = await Promise.all([
        req('site-owner', '/uploads/logo', 'POST', image, 0, 'site-a', 'image/png', v),
        req('site-owner', '/uploads/logo', 'POST', image, 1, 'site-a', 'image/png', v),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_site_assets WHERE company_id='site-a' AND purpose='logo' AND status='ready'",
            )
          ).n,
        ),
        1,
      );
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_site_assets WHERE company_id='site-a' AND status='pending'",
            )
          ).n,
        ),
        0,
      );
    },
  );
}
