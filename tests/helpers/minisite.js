import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { runMigrations } from '../../server/migrations.js';
import { addDays, dateInBrazil } from '../../server/domain.js';
import { operationalSchema } from '../../server/operational-settings.js';
import { reconstructBeforeMinisite } from './minisite-migration.js';
import { testSiteStorage } from './site-storage.js';

export async function assertMinisite(t, db, second = db) {
  await seed(db);
  const snapshotIgor = () =>
    Promise.all(
      [
        'companies',
        'company_settings',
        'services',
        'barbers',
        'portfolio',
        'appointments',
        'subscriptions',
      ].map((table) =>
        db.all(
          `SELECT * FROM ${table} WHERE ${table === 'companies' ? 'id' : 'company_id'}='igor-barber-club' ORDER BY 1`,
        ),
      ),
    );
  const igor = await snapshotIgor();
  await t.test(
    '020 only adds an idempotent catalog row; transactional rollback and checksums preserve every existing business',
    async () => {
      await reconstructBeforeMinisite(db);
      const journal = await db.all('SELECT * FROM schema_migrations ORDER BY version');
      await assert.rejects(
        runMigrations({
          transaction: (fn) =>
            db.transaction((tx) =>
              fn({
                ...tx,
                run(sql, args) {
                  if (sql.startsWith('INSERT INTO templates')) throw Error('injected 020 failure');
                  return tx.run(sql, args);
                },
              }),
            ),
        }),
        /injected 020/,
      );
      assert.equal(await db.get("SELECT id FROM templates WHERE id='gradefy-minisite'"), undefined);
      assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), journal);
      assert.deepEqual(await runMigrations(db), [20]);
      assert.deepEqual(await runMigrations(db), []);
      assert.equal(
        Number((await db.get("SELECT COUNT(*) AS n FROM templates WHERE id='gradefy-minisite'")).n),
        1,
      );
      assert.deepEqual(await snapshotIgor(), igor);
    },
  );
  const secret = 'mini-site-disposable-test-signing-secret';
  for (const id of ['mini-a', 'mini-b', 'mini-classic', 'mini-client', 'mini-pro'])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21999998888','test','client','2026')",
      [id, id, id + '@example.test'],
    );
  const storage = testSiteStorage();
  const servers = [db, second].map((connection) =>
    createApp(connection, {
      secret,
      test: true,
      serveStatic: false,
      siteStorage: storage,
      notificationAdapters: { email: async () => false, whatsapp: async () => false },
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(() => Promise.all(servers.map((s) => new Promise((r) => s.close(r)))));
  const cookie = (user) =>
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: user,
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  async function req(
    path,
    { user = 'mini-a', cid, method = 'GET', body, raw, version, instance = 0, extraCookie } = {},
  ) {
    const r = await fetch('http://127.0.0.1:' + servers[instance].address().port + '/api' + path, {
      method,
      headers: {
        'Content-Type': raw ? 'image/png' : 'application/json',
        ...(user ? { Cookie: cookie(user) } : extraCookie ? { Cookie: extraCookie } : {}),
        ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
        ...(version !== undefined ? { 'X-Site-Version': String(version) } : {}),
      },
      ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: r.headers.get('content-type')?.includes('application/json')
        ? await r.json()
        : Buffer.from(await r.arrayBuffer()),
      cookies: r.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; '),
    };
  }
  const companies = {},
    services = {},
    people = {};
  const days = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    active: weekday !== 0,
    start_time: '09:00',
    end_time: '19:00',
    breaks: [{ start_time: '12:20', end_time: '14:00' }],
  }));
  await t.test(
    'new company defaults to Mini Site; explicit Barber Classic and existing Igor retain their template',
    async () => {
      const cat = await req('/onboarding/catalog');
      assert.equal(cat.data.defaultTemplateCode, 'gradefy-minisite');
      assert.equal(cat.data.templates[0].code, 'gradefy-minisite');
      assert.deepEqual(
        cat.data.niches.map((n) => n.code),
        ['barbershop'],
      );
      for (const user of ['mini-a', 'mini-b', 'mini-classic']) {
        const created = await req('/onboarding/business', {
          user,
          method: 'POST',
          body: {
            name: 'Espaço ' + user,
            slug: 'studio-' + user,
            phone: '21999998888',
            city: 'Rio de Janeiro',
            region: 'RJ',
            nicheCode: 'barbershop',
            planCode: 'individual',
            ...(user === 'mini-classic' ? { templateCode: 'barber-classic' } : {}),
          },
        });
        assert.equal(created.status, 201, JSON.stringify(created.data));
        companies[user] = created.data.company;
        assert.equal(
          created.data.company.template.code,
          user === 'mini-classic' ? 'barber-classic' : 'gradefy-minisite',
        );
      }
      assert.equal(
        (await db.get("SELECT template_id FROM companies WHERE id='igor-barber-club'")).template_id,
        'barber-classic',
      );
      assert.equal(
        (
          await req('/onboarding/template-selection', {
            method: 'POST',
            user: 'mini-client',
            body: { nicheCode: 'salon', templateCode: 'gradefy-minisite', planCode: 'team' },
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    'real operational onboarding creates services, professionals, routine and exactly one trial; sites stay private',
    async () => {
      for (const user of Object.keys(companies)) {
        services[user] = (
          await req('/onboarding/operations/services', {
            user,
            method: 'POST',
            body: {
              name: 'Corte ' + user,
              description: 'Acabamento personalizado',
              category: 'Corte',
              duration: 40,
              price: 3500,
              active: true,
            },
          })
        ).data;
        people[user] = (
          await req('/onboarding/operations/professionals', {
            user,
            method: 'POST',
            body: { name: 'Profissional ' + user, services: [services[user].id] },
          })
        ).data;
        assert.ok(people[user].id);
        assert.equal(
          (
            await req('/onboarding/operations/professionals/' + people[user].id + '/schedule', {
              user,
              method: 'PUT',
              body: { agenda_mode: 'auto', max_days_ahead: 14, version: 0, days },
            })
          ).status,
          200,
        );
        assert.equal(
          (await req('/onboarding/operations/complete', { user, method: 'POST', body: {} })).status,
          200,
        );
        assert.equal(
          (await req('/public/' + companies[user].slug + '/site', { user: null })).status,
          404,
        );
        assert.equal(
          Number(
            (
              await db.get('SELECT COUNT(*) AS n FROM subscriptions WHERE company_id=?', [
                companies[user].id,
              ])
            ).n,
          ),
          1,
        );
      }
    },
  );
  const cid = companies['mini-a'].id,
    slug = companies['mini-a'].slug;
  const state = () => req('/company-site', { cid });
  const upload = async (purpose, opts = {}) =>
    req('/company-site/uploads/' + purpose, {
      cid,
      method: 'POST',
      version: (await state()).data.settings.version,
      raw: image,
      ...opts,
    });
  const image = await sharp({
    create: { width: 80, height: 100, channels: 3, background: '#6243b5' },
  })
    .png()
    .toBuffer();
  let gallery = [];
  await t.test(
    'editor and preview require owner/manager of the selected company; public routes cannot read private content',
    async () => {
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'mini-pro','professional','2026')",
        [cid],
      );
      assert.equal((await req('/company-site', { cid, user: null })).status, 401);
      for (const user of ['mini-b', 'mini-client', 'mini-pro'])
        assert.equal((await req('/company-site', { cid, user })).status, 403);
      const r = await state();
      assert.equal(r.status, 200);
      assert.equal(r.data.galleryLimit, 5);
      assert.equal(r.data.company.template, 'gradefy-minisite');
      const legacy = await req('/company-site', {
        cid: companies['mini-classic'].id,
        user: 'mini-classic',
      });
      assert.equal(legacy.data.galleryLimit, 40);
    },
  );
  await t.test(
    'identity, slogan, contact, colors and existing address persist through editor; stale writes cannot overwrite',
    async () => {
      const current = (await state()).data;
      const body = {
        ...current.settings,
        name: 'Mini Empresa A',
        slogan: 'Seu estilo, seu horário.',
        whatsapp: '21987654321',
        instagram_url: 'https://www.instagram.com/mini_a/',
        address: 'Rua Exemplo, 10',
        city: 'Rio de Janeiro',
        region: 'RJ',
        primary_color: '#7c3aed',
        secondary_color: '#00d4ff',
      };
      assert.equal((await req('/company-site', { cid, method: 'PUT', body })).status, 200);
      assert.equal((await req('/company-site', { cid, method: 'PUT', body })).status, 409);
      const fresh = (await state()).data;
      assert.equal(fresh.settings.slogan, body.slogan);
      assert.equal(fresh.settings.address, body.address);
      const result = await Promise.all([
        req('/company-site', {
          cid,
          method: 'PUT',
          body: { ...fresh.settings, name: 'Mini Empresa A' },
        }),
        req('/company-site', {
          cid,
          method: 'PUT',
          body: { ...fresh.settings, name: 'Mini Empresa A' },
          instance: 1,
        }),
      ]);
      assert.deepEqual(result.map((r) => r.status).sort(), [200, 409]);
    },
  );
  await t.test(
    'logo/banner and exactly five optimized photos upload to private storage; sixth photo is rejected in both write APIs',
    async () => {
      assert.equal((await upload('logo')).status, 201);
      assert.equal((await upload('banner')).status, 201);
      for (let i = 0; i < 4; i++) assert.equal((await upload('gallery')).status, 201);
      const version = (await state()).data.settings.version;
      const competing = await Promise.all([
        upload('gallery', { version }),
        upload('gallery', { version, instance: 1 }),
      ]);
      assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
      gallery = (await state()).data.gallery;
      assert.equal(gallery.length, 5);
      const before = storage.objects.size;
      assert.equal((await upload('gallery')).status, 409);
      assert.equal(storage.objects.size, before);
      const legacy = await req('/admin/portfolio', {
        cid,
        method: 'POST',
        body: {
          title: 'Sexta foto',
          category: 'Corte',
          image: 'data:image/png;base64,' + image.toString('base64'),
        },
      });
      assert.equal(legacy.status, 409);
      assert.equal(
        Number((await db.get('SELECT COUNT(*) AS n FROM portfolio WHERE company_id=?', [cid])).n),
        5,
      );
      assert.equal(
        (
          await req('/company-site/gallery/' + gallery[0].id + '/image?company=' + cid, {
            user: null,
          })
        ).status,
        401,
      );
      assert.equal(
        (await req('/public/' + slug + '/portfolio/' + gallery[0].id + '/image', { user: null }))
          .status,
        404,
      );
    },
  );
  await t.test(
    'gallery order and removal remain company-scoped and versioned; a replacement restores five photos',
    async () => {
      let s = (await state()).data;
      const ids = s.gallery.map((g) => g.id).reverse();
      assert.equal(
        (
          await req('/company-site/gallery/order', {
            cid,
            method: 'PUT',
            body: { version: s.settings.version, ids },
          })
        ).status,
        200,
      );
      s = (await state()).data;
      assert.deepEqual(
        s.gallery.map((g) => g.id),
        ids,
      );
      assert.equal(
        (
          await req('/company-site/gallery/order', {
            cid,
            method: 'PUT',
            body: { version: s.settings.version, ids: ids.map(() => ids[0]) },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/company-site/gallery/' + ids[0], {
            cid: companies['mini-b'].id,
            user: 'mini-b',
            method: 'DELETE',
            body: { version: 0 },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req('/company-site/gallery/' + ids[0], {
            cid,
            method: 'DELETE',
            body: { version: s.settings.version },
          })
        ).status,
        200,
      );
      assert.equal((await state()).data.gallery.length, 4);
      assert.equal((await upload('gallery')).status, 201);
      gallery = (await state()).data.gallery;
    },
  );
  await t.test(
    'private preview selects Mini Site and exposes only its public DTO; missing company hours never invent an opening status',
    async () => {
      const p = await req('/company-site/preview', { cid });
      assert.equal(p.status, 200);
      assert.equal(p.data.site.company.template, 'gradefy-minisite');
      assert.equal(p.data.portfolio.length, 5);
      assert.equal(p.data.site.hours, null);
      for (const field of [
        'password_hash',
        'session_version',
        'subscription_id',
        'guest_email',
        'membership',
        'mini-b',
      ])
        assert.equal(JSON.stringify(p.data).includes(field), false, field);
      const settings = (await req('/admin/settings', { cid })).data;
      const body = Object.fromEntries(
        Object.keys(operationalSchema.shape).map((key) => [key, settings[key]]),
      );
      body.working_days = days;
      assert.equal((await req('/admin/settings', { cid, method: 'PUT', body })).status, 200);
      const h = (await req('/company-site/preview', { cid })).data.site.hours;
      assert.deepEqual(h.days, days);
      assert.equal(h.timezone, 'America/Sao_Paulo');
      assert.ok(Number.isFinite(Date.parse(h.now)));
    },
  );
  await t.test(
    'Mini Site draft atomically saves commercial hours without changing personal routines, postal metadata, trial or publication',
    async () => {
      const routines = () =>
        Promise.all(
          ['barber_settings', 'barber_working_hours', 'barber_working_breaks'].map((table) =>
            db.all(`SELECT * FROM ${table} WHERE company_id=? ORDER BY 1`, [cid]),
          ),
        );
      const before = await routines(),
        subscriptions = await db.all('SELECT * FROM subscriptions WHERE company_id=?', [cid]);
      await db.run(
        "UPDATE company_settings SET postal_code='23080000',street='Rua Exemplo',address_number='10',neighborhood='Centro' WHERE company_id=?",
        [cid],
      );
      const saved = (await state()).data;
      assert.equal(saved.addressDetails.postal_code, '23080000');
      const commercial = days.map((d) => ({
        ...d,
        active: d.weekday > 0 && d.weekday < 6,
        end_time: '20:00',
      }));
      const invalid = structuredClone(commercial);
      invalid[1].end_time = '08:00';
      assert.equal(
        (
          await req('/company-site', {
            cid,
            method: 'PUT',
            body: { ...saved.settings, name: 'Invalid draft', working_days: invalid },
          })
        ).status,
        400,
      );
      assert.equal((await state()).data.company.name, saved.company.name);
      assert.equal(
        (
          await req('/company-site', {
            cid,
            method: 'PUT',
            body: { ...saved.settings, name: saved.company.name, working_days: commercial },
          })
        ).status,
        200,
      );
      const current = (await state()).data;
      assert.deepEqual(current.settings.working_days, commercial);
      assert.equal(current.addressDetails.postal_code, '23080000');
      assert.equal(current.company.sitePublished, false);
      assert.deepEqual(await routines(), before);
      assert.deepEqual(
        await db.all('SELECT * FROM subscriptions WHERE company_id=?', [cid]),
        subscriptions,
      );
      assert.deepEqual(
        (await req('/company-site/preview', { cid })).data.site.hours.days,
        commercial,
      );
      assert.equal(
        (
          await req('/company-site', {
            cid,
            method: 'PUT',
            body: { ...saved.settings, name: 'Stale draft' },
          })
        ).status,
        409,
      );
      const peers = await Promise.all(
        [0, 1].map((instance) =>
          req('/company-site', {
            cid,
            method: 'PUT',
            instance,
            body: { ...current.settings, name: current.company.name, working_days: days },
          }),
        ),
      );
      assert.deepEqual(peers.map((r) => r.status).sort(), [200, 409]);
      await db.run("UPDATE subscriptions SET status='expired' WHERE company_id=?", [cid]);
      const expired = (await state()).data;
      assert.equal(
        (
          await req('/company-site', {
            cid,
            method: 'PUT',
            body: { ...expired.settings, name: 'Should roll back', working_days: commercial },
          })
        ).status,
        409,
      );
      assert.equal((await state()).data.company.name, current.company.name);
      await db.run("UPDATE subscriptions SET status='trialing' WHERE company_id=?", [cid]);
    },
  );
  await t.test(
    'publication keeps original readiness and subscription checks; public data and all images stay scoped',
    async () => {
      await db.run("UPDATE subscriptions SET status='expired' WHERE company_id=?", [cid]);
      assert.equal(
        (
          await req('/company-site/publish', {
            cid,
            method: 'POST',
            body: { version: (await state()).data.settings.version },
          })
        ).status,
        409,
      );
      await db.run("UPDATE subscriptions SET status='trialing' WHERE company_id=?", [cid]);
      assert.equal(
        (
          await req('/company-site/publish', {
            cid,
            method: 'POST',
            body: { version: (await state()).data.settings.version },
          })
        ).status,
        200,
      );
      const site = await req('/public/' + slug + '/site', { user: null });
      assert.equal(site.status, 200);
      assert.equal(site.data.company.name, 'Mini Empresa A');
      assert.equal(site.data.company.template, 'gradefy-minisite');
      const photos = await req('/public/' + slug + '/portfolio', { user: null });
      assert.equal(photos.data.length, 5);
      assert.deepEqual(
        photos.data.map((p) => p.id),
        gallery.map((p) => p.id),
      );
      assert.equal(
        (await req('/public/' + slug + '/portfolio/' + gallery[0].id + '/image', { user: null }))
          .status,
        200,
      );
      assert.equal(
        (
          await req(
            '/public/' + companies['mini-b'].slug + '/portfolio/' + gallery[0].id + '/image',
            { user: null },
          )
        ).status,
        404,
      );
      assert.equal((await req('/public/' + slug + '/admin/settings')).status, 404);
    },
  );
  let appointment, date, miniClientCookie;
  await t.test(
    'explicit clients reuse duration, breaks and blocks; anonymous bookings fail and clients cancel only their own reservations',
    async () => {
      date = addDays(dateInBrazil(), 1);
      while (new Date(date + 'T12:00Z').getUTCDay() === 0) date = addDays(date, 1);
      const root = '/public/' + slug;
      assert.equal(
        (
          await req('/admin/blocks', {
            cid,
            method: 'POST',
            body: {
              barberId: people['mini-a'].id,
              date,
              start: '14:00',
              end: '14:40',
              reason: 'Pausa pessoal',
            },
          })
        ).status,
        201,
      );
      const available = await req(
        root +
          '/availability?date=' +
          date +
          '&barberId=' +
          people['mini-a'].id +
          '&services=' +
          services['mini-a'].id,
        { user: null },
      );
      assert.equal(available.status, 200);
      assert.ok(available.data.slots.includes('11:40'));
      assert.equal(available.data.slots.includes('12:20'), false);
      assert.equal(available.data.slots.includes('14:00'), false);
      const body = {
        barberId: people['mini-a'].id,
        services: [services['mini-a'].id],
        date,
        time: '09:00',
      };
      assert.equal((await req(root + '/auth/me')).data.user, null);
      assert.equal((await req(root + '/appointments', { method: 'POST', body })).status, 401);
      assert.equal(
        (
          await req(root + '/appointments/guest', {
            user: null,
            method: 'POST',
            body: {
              ...body,
              guest: {
                name: 'Cliente Visitante',
                email: 'mini-guest@example.test',
                phone: '21987654321',
              },
            },
          })
        ).status,
        401,
      );
      const registered = await req(root + '/auth/register', {
        user: null,
        method: 'POST',
        body: {
          name: 'Cliente Autenticado',
          email: 'mini-authenticated@example.test',
          phone: '21987654321',
          password: 'ClienteMini2026!',
          confirmPassword: 'ClienteMini2026!',
        },
      });
      assert.equal(registered.status, 201, JSON.stringify(registered.data));
      miniClientCookie = registered.cookies;
      assert.match(miniClientCookie, /^gradefy-client=/);
      assert.equal(
        (await req('/companies', { user: null, extraCookie: miniClientCookie })).status,
        401,
      );
      assert.equal(
        (await req(root + '/auth/me', { user: null, extraCookie: miniClientCookie })).data.user
          .role,
        'client',
      );
      assert.equal(
        (await req(root + '/admin/appointments', { user: null, extraCookie: miniClientCookie }))
          .status,
        404,
      );
      const saved = await req(root + '/appointments', {
        user: null,
        extraCookie: miniClientCookie,
        method: 'POST',
        body,
      });
      assert.equal(saved.status, 201, JSON.stringify(saved.data));
      appointment = saved.data;
      assert.equal(appointment.user_id, registered.data.user.id);
      assert.equal(
        (
          await req(root + '/appointments', {
            user: null,
            extraCookie: miniClientCookie,
            method: 'POST',
            body: { ...body, time: '09:40' },
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await req(root + '/appointments', {
            user: null,
            extraCookie: miniClientCookie,
            method: 'POST',
            body,
          })
        ).status,
        409,
      );
      assert.deepEqual(
        (
          await req('/public/' + companies['mini-b'].slug + '/appointments', {
            user: null,
            extraCookie: miniClientCookie,
          })
        ).data,
        [],
      );
      assert.equal(
        (
          await req(root + '/appointments/' + appointment.id + '/cancel', {
            user: null,
            extraCookie: miniClientCookie,
            method: 'PATCH',
            body: {},
          })
        ).status,
        200,
      );
      assert.equal(
        (await req(root + '/appointments', { user: null, extraCookie: miniClientCookie })).data
          .length,
        2,
      );
      await db.run('UPDATE company_settings SET online_booking_enabled=0 WHERE company_id=?', [
        cid,
      ]);
      assert.equal(
        (
          await req(root + '/appointments', {
            user: null,
            extraCookie: miniClientCookie,
            method: 'POST',
            body: { ...body, time: '10:20' },
          })
        ).status,
        409,
      );
      await db.run('UPDATE company_settings SET online_booking_enabled=1 WHERE company_id=?', [
        cid,
      ]);
    },
  );
  await t.test(
    'unpublish hides the mini site and photos, preserves reservations/history and does not start another trial',
    async () => {
      const subscriptions = await db.all('SELECT * FROM subscriptions WHERE company_id=?', [cid]);
      const stateNow = (await state()).data;
      assert.equal(
        (
          await req('/company-site/unpublish', {
            cid,
            method: 'POST',
            body: { version: stateNow.settings.version },
          })
        ).status,
        200,
      );
      for (const path of [
        '/site',
        '/services',
        '/portfolio',
        '/portfolio/' + gallery[0].id + '/image',
      ])
        assert.equal((await req('/public/' + slug + path, { user: null })).status, 404);
      assert.equal(
        (
          await req('/public/' + slug + '/appointments', {
            user: null,
            extraCookie: miniClientCookie,
          })
        ).status,
        200,
      );
      assert.ok(
        await db.get('SELECT id FROM appointments WHERE company_id=? AND id=?', [
          cid,
          appointment.id,
        ]),
      );
      assert.deepEqual(
        await db.all('SELECT * FROM subscriptions WHERE company_id=?', [cid]),
        subscriptions,
      );
    },
  );
  await t.test(
    'Barber Classic retains more than five photos and the Igor root contracts remain unchanged',
    async () => {
      const user = 'mini-classic',
        c = companies[user].id;
      for (let i = 0; i < 6; i++) {
        const s = (await req('/company-site', { user, cid: c })).data;
        assert.equal(
          (
            await req('/company-site/uploads/gallery', {
              user,
              cid: c,
              version: s.settings.version,
              raw: image,
              method: 'POST',
            })
          ).status,
          201,
        );
      }
      assert.equal((await req('/company-site', { user, cid: c })).data.gallery.length, 6);
      assert.equal((await req('/company-site/preview', { user, cid: c })).data.portfolio.length, 6);
      assert.deepEqual(await snapshotIgor(), igor);
      assert.equal((await req('/site', { user: null })).data.company.template, 'barber-classic');
    },
  );
}
