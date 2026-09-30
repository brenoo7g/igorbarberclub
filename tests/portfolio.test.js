import { getLegacyCompanyId } from '../server/company-context.js';
import { IGOR_COMPANY_ID } from '../server/company-bootstrap.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import sharp from 'sharp';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { seedPortfolio } from '../server/portfolio-seed.js';

test('portfolio: real seed, permissions, validated images, concurrent edits and persistent removal', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const server = createApp(db, { test: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  async function request(path, method = 'GET', body, cookie) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const initial = await request('/portfolio');
  assert.equal(initial.body.length, 5);
  assert.equal(initial.body[0].id, 'igor-corte-5');
  assert.ok(
    initial.body.every((p) => p.image.startsWith('/api/portfolio/') && !('created_at' in p)),
  );
  const firstImage = await fetch(base.replace('/api', '') + initial.body[0].image);
  assert.equal(firstImage.headers.get('content-type'), 'image/webp');
  assert.equal(
    (await sharp(Buffer.from(await firstImage.arrayBuffer())).metadata()).format,
    'webp',
  );
  assert.equal((await request('/admin/portfolio', 'POST', {})).status, 401);
  const client = await request('/auth/login', 'POST', {
    email: 'cliente@example.com',
    password: 'ClienteDemo2026!',
  });
  assert.equal((await request('/admin/portfolio', 'POST', {}, client.cookie)).status, 403);
  assert.equal(
    (await request('/admin/portfolio/igor-corte-1', 'DELETE', undefined, client.cookie)).status,
    403,
  );
  const admin = await request('/auth/login', 'POST', {
    email: 'admin@igorbarberclub.com.br',
    password: 'IgorDemo2026!',
  });
  const invalidOrigin = await fetch(base + '/admin/portfolio/igor-corte-1', {
    method: 'DELETE',
    headers: { Cookie: admin.cookie, Origin: 'https://untrusted.example' },
  });
  assert.equal(invalidOrigin.status, 403);
  const png = await sharp({
    create: { width: 1700, height: 1400, channels: 3, background: '#365aff' },
  })
    .png()
    .toBuffer();
  const data = {
    title: 'Foto de teste',
    category: 'Teste',
    image: `data:image/png;base64,${png.toString('base64')}`,
  };
  for (const bad of [
    'https://example.com/foto.jpg',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,YWJj',
  ]) {
    assert.equal(
      (await request('/admin/portfolio', 'POST', { ...data, image: bad }, admin.cookie)).status,
      400,
    );
  }
  assert.equal(
    (await request('/admin/portfolio', 'POST', { ...data, title: '' }, admin.cookie)).status,
    400,
  );
  const created = await request('/admin/portfolio', 'POST', data, admin.cookie);
  assert.equal(created.status, 201);
  const image = await fetch(base + `/portfolio/${created.body.id}/image`);
  const info = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(info.format, 'webp');
  assert.ok(info.width <= 1200 && info.height <= 1200);
  assert.equal(info.exif, undefined);
  const changes = await Promise.all(
    ['Novo titulo A', 'Novo titulo B'].map((title) =>
      request(
        `/admin/portfolio/${created.body.id}`,
        'PUT',
        { title, category: 'Teste', version: 1 },
        admin.cookie,
      ),
    ),
  );
  assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (
      await request(
        `/admin/portfolio/${created.body.id}`,
        'PUT',
        { title: 'bad', category: 'OK', version: 2, image: 'bad' },
        admin.cookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (await db.get('SELECT version FROM portfolio WHERE id=?', [created.body.id])).version,
    2,
  );
  await request('/admin/portfolio/igor-corte-1', 'DELETE', undefined, admin.cookie);
  await db.transaction((tx) => seedPortfolio(tx, getLegacyCompanyId()));
  assert.equal(await db.get('SELECT id FROM portfolio WHERE id=?', ['igor-corte-1']), undefined);
  assert.equal(
    (await request(`/admin/portfolio/${created.body.id}`, 'DELETE', undefined, admin.cookie))
      .status,
    200,
  );
  assert.equal((await fetch(base + `/portfolio/${created.body.id}/image`)).status, 404);
  assert.equal(
    (
      await request(
        `/admin/portfolio/${created.body.id}`,
        'PUT',
        { title: 'New', category: 'OK', version: 2 },
        admin.cookie,
      )
    ).status,
    404,
  );
  for (let i = 4; i < 40; i++)
    await db.run(
      `INSERT INTO portfolio (company_id,id,title,category,image,version,created_at) VALUES ('${IGOR_COMPANY_ID}',?,?,?,?,?,?)`,
      [`limit-${i}`, 'Test', 'Test', 'AA==', 1, '2026-09-10'],
    );
  assert.equal((await request('/admin/portfolio', 'POST', data, admin.cookie)).status, 409);
});
