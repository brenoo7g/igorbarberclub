import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { addDays, dateInBrazil } from '../../server/domain.js';
import { testSiteStorage } from './site-storage.js';

export async function assertSitePublication(t, db, second = db) {
  await seed(db);
  const legacy = await db.get("SELECT * FROM companies WHERE id='igor-barber-club'");
  const history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const secret = 'publication-disposable-secret';
  const cookies = {};
  for (const user of ['pub-a', 'pub-b', 'pub-manager', 'pub-client']) {
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','test','client','2026')",
      [user, user, `${user}@example.test`],
    );
    cookies[user] =
      `session=${jwt.sign({ version: 0 }, secret, { subject: user, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  }
  const storage = testSiteStorage();
  let failure = false,
    pause = null,
    bookStarted = null;
  const controlled = {
    ...db,
    transaction: (fn, options) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: async (sql, args) => {
              if (sql.startsWith('UPDATE companies SET site_published=')) {
                if (failure) {
                  failure = false;
                  throw Object.assign(new Error('injected publication failure'), { status: 503 });
                }
                if (pause) {
                  const p = pause;
                  pause = null;
                  p.enter();
                  await p.wait;
                }
              }
              return tx.run(sql, args);
            },
          }),
        options,
      ),
  };
  const concurrent = {
    ...second,
    transaction: (...args) => {
      bookStarted?.();
      return second.transaction(...args);
    },
  };
  const servers = [controlled, concurrent].map((source) =>
    createApp(source, { secret, test: true, serveStatic: false, siteStorage: storage }).listen(
      0,
      '127.0.0.1',
    ),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const s of servers) await new Promise((resolve) => s.close(resolve));
  });
  async function req(
    path,
    { user = 'pub-a', cid, method = 'GET', data, instance = 0, raw, version, key } = {},
  ) {
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path}`,
      {
        method,
        headers: {
          ...(user ? { Cookie: cookies[user] } : {}),
          ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
          'Content-Type': raw ? 'image/png' : 'application/json',
          ...(version !== undefined ? { 'X-Site-Version': String(version) } : {}),
          ...(key ? { 'Idempotency-Key': key } : {}),
        },
        ...(raw ? { body: raw } : data !== undefined ? { body: JSON.stringify(data) } : {}),
      },
    );
    return {
      status: response.status,
      headers: response.headers,
      data: response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : Buffer.from(await response.arrayBuffer()),
    };
  }
  const business = {},
    services = {},
    people = {};
  for (const user of ['pub-a', 'pub-b']) {
    const created = await req('/onboarding/business', {
      user,
      method: 'POST',
      data: {
        name: `Barbearia ${user}`,
        slug: `studio-${user}`,
        phone: '21999998888',
        city: 'Rio de Janeiro',
        region: 'RJ',
        planCode: 'individual',
        nicheCode: 'barbershop',
        templateCode: 'barber-classic',
      },
    });
    assert.equal(created.status, 201);
    business[user] = created.data.company;
  }
  const cid = business['pub-a'].id,
    slug = business['pub-a'].slug,
    other = business['pub-b'].id;
  const command = (action, expected, options = {}) =>
    req(`/company-site/${action}`, {
      cid,
      method: 'POST',
      data: { version: expected },
      ...options,
    });
  const state = () => req('/company-site', { cid });
  await t.test(
    'pending onboarding cannot publish; operational completion remains private without another trial',
    async () => {
      assert.equal((await command('publish', 0)).status, 403);
      for (const user of ['pub-a', 'pub-b']) {
        services[user] = (
          await req('/onboarding/operations/services', {
            user,
            method: 'POST',
            data: {
              name: `Corte ${user}`,
              description: 'Corte real',
              duration: 40,
              price: 3000,
              category: 'Corte',
              active: true,
            },
          })
        ).data;
        people[user] = (
          await req('/onboarding/operations/professionals', {
            user,
            method: 'POST',
            data: { name: `Equipe ${user}`, services: [services[user].id] },
          })
        ).data;
        assert.equal(
          (
            await req(`/onboarding/operations/professionals/${people[user].id}/schedule`, {
              user,
              method: 'PUT',
              data: {
                agenda_mode: 'auto',
                max_days_ahead: 15,
                version: 0,
                days: Array.from({ length: 7 }, (_, weekday) => ({
                  weekday,
                  active: true,
                  start_time: '09:00',
                  end_time: '19:00',
                  breaks: [],
                })),
              },
            })
          ).status,
          200,
        );
        assert.equal(
          (await req('/onboarding/operations/complete', { user, method: 'POST', data: {} })).status,
          200,
        );
      }
      assert.equal((await state()).data.company.sitePublished, false);
      assert.equal((await req(`/public/${slug}/site`, { user: null })).status, 404);
    },
  );
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'pub-manager','manager','2026')",
    [cid],
  );
  await t.test(
    'real private preview requires session and management membership, no fallback or public API leak',
    async () => {
      assert.equal((await req('/company-site/preview', { user: null, cid })).status, 401);
      for (const path of ['preview', 'publish', 'unpublish']) {
        const result = await req(`/company-site/${path}`, {
          cid: other,
          method: path === 'preview' ? 'GET' : 'POST',
          data: path === 'preview' ? undefined : { version: 0 },
        });
        assert.equal(result.status, 403);
      }
      assert.equal((await req('/company-site/preview', { user: 'pub-client', cid })).status, 403);
      const preview = await req('/company-site/preview', { cid, user: 'pub-manager' });
      assert.equal(preview.status, 200);
      assert.equal(preview.headers.get('cache-control'), 'no-store');
      assert.equal(preview.data.site.company.name, 'Barbearia pub-a');
      assert.equal(preview.data.services[0].id, services['pub-a'].id);
      assert.equal(preview.data.professionals[0].id, people['pub-a'].id);
      assert.ok(!JSON.stringify(preview.data).includes('Corte pub-b'));
      assert.equal(
        (await req('/company-site/preview', { cid, method: 'POST', data: {} })).status,
        404,
      );
      for (const path of ['site', 'services', 'barbers', 'portfolio', 'appointments/guest'])
        assert.equal(
          (
            await req(`/public/${slug}/${path}`, {
              user: null,
              method: path.endsWith('guest') ? 'POST' : 'GET',
              data: path.endsWith('guest') ? {} : undefined,
            })
          ).status,
          404,
        );
      for (const bad of ['absent-studio', 'app', 'admin', 'preview', 'api'])
        assert.equal((await req(`/public/${bad}/site`, { user: null })).status, 404);
    },
  );
  await t.test(
    'publication revalidates services, associations, explicit schedules, template, slug and trial',
    async () => {
      const rejects = async (change, restore, code) => {
        await change();
        try {
          const r = await command('publish', 0);
          assert.equal(r.status, 409);
          if (code) assert.equal(r.data.code, code);
        } finally {
          await restore();
        }
        assert.equal((await state()).data.company.sitePublished, false);
      };
      await rejects(
        () => db.run('UPDATE services SET active=0 WHERE company_id=?', [cid]),
        () => db.run('UPDATE services SET active=1 WHERE company_id=?', [cid]),
        'SITE_NOT_READY',
      );
      await rejects(
        () => db.run('DELETE FROM barber_services WHERE company_id=?', [cid]),
        () =>
          db.run(
            "INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,'2026')",
            [cid, people['pub-a'].id, services['pub-a'].id],
          ),
        'SITE_NOT_READY',
      );
      await rejects(
        () => db.run('UPDATE barber_working_hours SET active=0 WHERE company_id=?', [cid]),
        () => db.run('UPDATE barber_working_hours SET active=1 WHERE company_id=?', [cid]),
        'SITE_NOT_READY',
      );
      await rejects(
        () => db.run("UPDATE companies SET slug='app' WHERE id=?", [cid]),
        () => db.run('UPDATE companies SET slug=? WHERE id=?', [slug, cid]),
        'INVALID_PUBLIC_IDENTITY',
      );
      await rejects(
        () => db.run("UPDATE templates SET active=0 WHERE id='barber-classic'"),
        () => db.run("UPDATE templates SET active=1 WHERE id='barber-classic'"),
        'TEMPLATE_UNAVAILABLE',
      );
      const subscription = await db.get('SELECT * FROM subscriptions WHERE company_id=?', [cid]);
      await rejects(
        () =>
          db.run(
            "UPDATE subscriptions SET trial_ends_at='2000-01-02T00:00:00.000Z',trial_started_at='2000-01-01T00:00:00.000Z' WHERE company_id=?",
            [cid],
          ),
        () =>
          db.run('UPDATE subscriptions SET trial_started_at=?,trial_ends_at=? WHERE company_id=?', [
            subscription.trial_started_at,
            subscription.trial_ends_at,
            cid,
          ]),
        'TRIAL_EXPIRED',
      );
      await rejects(
        () => db.run("UPDATE company_onboarding SET status='pending' WHERE company_id=?", [cid]),
        () => db.run("UPDATE company_onboarding SET status='completed' WHERE company_id=?", [cid]),
        'ONBOARDING_INCOMPLETE',
      );
    },
  );
  let logoUrl, galleryUrl;
  await t.test(
    'private managed images, rollback and unreadable storage block publication atomically',
    async () => {
      const png = await sharp({
        create: { width: 50, height: 50, channels: 3, background: '#4455aa' },
      })
        .png()
        .toBuffer();
      for (const purpose of ['logo', 'banner', 'gallery']) {
        const before = (await state()).data;
        assert.equal(
          (
            await req(`/company-site/uploads/${purpose}`, {
              cid,
              method: 'POST',
              raw: png,
              version: before.settings.version,
            })
          ).status,
          201,
        );
      }
      const preview = (await req('/company-site/preview', { cid })).data;
      logoUrl = preview.site.settings.logo_url;
      galleryUrl = preview.portfolio[0].image;
      assert.equal((await req(logoUrl.slice(4), { cid })).status, 200);
      assert.equal((await req(logoUrl.slice(4), { cid: other, user: 'pub-b' })).status, 404);
      const item = [...storage.objects.entries()][0];
      storage.objects.delete(item[0]);
      assert.equal((await command('publish', (await state()).data.settings.version)).status, 404);
      storage.objects.set(...item);
      failure = true;
      assert.equal((await command('publish', (await state()).data.settings.version)).status, 503);
      assert.equal((await state()).data.company.sitePublished, false);
    },
  );
  const subscriptionBefore = await db.all('SELECT * FROM subscriptions WHERE company_id=?', [cid]);
  await t.test(
    'simultaneous publication/retry/lost response is idempotent across connections',
    async () => {
      const version = (await state()).data.settings.version;
      const results = await Promise.all([
        command('publish', version),
        command('publish', version, { instance: 1 }),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        [200, 200],
      );
      const current = (await state()).data;
      assert.equal(current.settings.version, version + 1);
      assert.equal((await command('publish', version)).status, 200);
      assert.equal((await state()).data.settings.version, current.settings.version);
      assert.deepEqual(
        await db.all('SELECT * FROM subscriptions WHERE company_id=?', [cid]),
        subscriptionBefore,
      );
    },
  );
  let booked;
  await t.test(
    'published API and images are company scoped; real booking reuses original motor',
    async () => {
      const site = await req(`/public/${slug}/site`, { user: null });
      assert.equal(site.status, 200);
      assert.equal(site.data.company.id, cid);
      assert.equal((await req(site.data.settings.logo_url.slice(4), { user: null })).status, 200);
      const gallery = await req(`/public/${slug}/portfolio`, { user: null });
      assert.equal((await req(gallery.data[0].image.slice(4), { user: null })).status, 200);
      logoUrl = site.data.settings.logo_url;
      galleryUrl = gallery.data[0].image;
      const result = await req(`/public/${slug}/appointments`, {
        user: 'pub-client',
        method: 'POST',
        data: {
          services: [services['pub-a'].id],
          barberId: people['pub-a'].id,
          date: addDays(dateInBrazil(), 1),
          time: '09:00',
        },
      });
      assert.equal(result.status, 201);
      booked = result.data;
      assert.equal(
        (await db.get('SELECT company_id FROM appointments WHERE id=?', [booked.id])).company_id,
        cid,
      );
      assert.equal((await req(`/public/${slug}/appointments`, { user: 'pub-b' })).data.length, 0);
      const saved = (await state()).data;
      assert.equal(
        (
          await req('/company-site', {
            cid,
            method: 'PUT',
            data: { ...saved.settings, name: 'Nome atualizado' },
          })
        ).status,
        200,
      );
      assert.equal(
        (await req(`/public/${slug}/site`, { user: null })).data.company.name,
        'Nome atualizado',
      );
    },
  );
  await t.test(
    'unpublish serializes with in-flight bookings, hides images/content and preserves cancellation/history',
    async () => {
      let enter, release, started;
      const entered = new Promise((r) => (enter = r)),
        wait = new Promise((r) => (release = r)),
        book = new Promise((r) => (started = r));
      pause = { enter, wait };
      const version = (await state()).data.settings.version;
      const withdrawing = command('unpublish', version);
      await entered;
      bookStarted = started;
      const booking = req(`/public/${slug}/appointments`, {
        user: 'pub-client',
        method: 'POST',
        instance: 1,
        data: {
          services: [services['pub-a'].id],
          barberId: people['pub-a'].id,
          date: addDays(dateInBrazil(), 1),
          time: '09:40',
        },
      });
      // SQLite serializes even the public resolver's SELECT; PostgreSQL enters the booking tx now.
      if (db.dialect === 'postgres') await book;
      release();
      assert.equal((await withdrawing).status, 200);
      assert.equal((await booking).status, 404);
      bookStarted = null;
      assert.equal((await command('unpublish', version)).status, 200);
      for (const path of [
        `/public/${slug}/site`,
        `/public/${slug}/services`,
        logoUrl.slice(4),
        galleryUrl.slice(4),
      ])
        assert.equal((await req(path, { user: null })).status, 404);
      assert.equal((await req('/company-site/preview', { cid })).status, 200);
      assert.equal((await req(`/public/${slug}/appointments`, { user: null })).status, 401);
      assert.equal(
        (await req(`/public/${slug}/appointments`, { user: 'pub-client' })).data[0].id,
        booked.id,
      );
      assert.equal(
        (
          await req(`/public/${slug}/appointments/${booked.id}/cancel`, {
            user: 'pub-b',
            method: 'PATCH',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req(`/public/${slug}/appointments/${booked.id}/cancel`, {
            user: 'pub-client',
            method: 'PATCH',
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.get('SELECT status FROM appointments WHERE id=?', [booked.id])).status,
        'cancelled',
      );
      assert.equal((await state()).data.gallery.length, 1);
      assert.equal(
        (await command('publish', (await state()).data.settings.version, { user: 'pub-manager' }))
          .status,
        200,
      );
    },
  );
  await t.test(
    'publication remains consistent with simultaneous catalog and professional writes',
    async () => {
      for (let round = 0; round < 3; round++) {
        await command('unpublish', (await state()).data.settings.version);
        const results = await Promise.all([
          command('publish', (await state()).data.settings.version),
          req('/admin/services', {
            cid,
            method: 'POST',
            instance: 1,
            data: {
              name: `Serviço adicional ${round}`,
              description: '',
              duration: 40,
              price: 3000,
              category: 'Teste',
              professionalIds: [people['pub-a'].id],
            },
          }),
          req('/admin/professionals', {
            cid,
            method: 'POST',
            instance: 1,
            key: `pub-inactive-${round}`,
            data: { name: 'Profissional inativo', active: false, services: [] },
          }),
        ]);
        assert.deepEqual(
          results.map((r) => r.status),
          [200, 201, 201],
        );
        assert.equal((await state()).data.company.sitePublished, true);
      }
    },
  );
  await t.test(
    'legacy Igor and migration history are unchanged; revoked management is denied',
    async () => {
      assert.equal((await req('/site', { user: null })).status, 200);
      assert.deepEqual(await db.get("SELECT * FROM companies WHERE id='igor-barber-club'"), legacy);
      assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), history);
      await db.run(
        "UPDATE company_members SET role='professional' WHERE company_id=? AND user_id='pub-manager'",
        [cid],
      );
      assert.equal((await command('unpublish', 0, { user: 'pub-manager' })).status, 403);
    },
  );
}
