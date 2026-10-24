import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { publicAsset, getPublicSite, publicationIssues } from '../../server/public-site.js';
import { migrations, readMigration, runMigrations } from '../../server/migrations.js';
import { reconstructBeforeBarberClassic, siteColumns } from './barber-classic-migration.js';
import { addDays, dateInBrazil, weekday } from '../../server/domain.js';
import { appointmentEmail } from '../../server/notifications.js';

export async function installBarberClassicFixture(db) {
  const image = (await db.get('SELECT image FROM portfolio LIMIT 1'))?.image || 'fixture';
  for (const [id, name, city, color] of [
    ['barbearia-imperial', 'Barbearia Imperial', 'Niterói', '#1144cc'],
    ['navalha-club', 'Navalha Club', 'Petrópolis', '#dd2244'],
  ]) {
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic','2026','2026')",
      [id, id, name],
    );
    await db.run(
      'INSERT INTO company_settings(company_id,city,region,logo_url,hero_image_url,description,instagram_url,address,whatsapp,phone,location_url,primary_color,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        id,
        city,
        'RJ',
        `https://media.example.test/${id}-logo.svg`,
        `https://media.example.test/${id}-hero.jpg`,
        `Conheça a ${name}.`,
        `https://www.instagram.com/${id.replaceAll('-', '_')}/`,
        `Rua ${name}, 123`,
        '5521999999999',
        '21999999999',
        `https://maps.google.com/?q=${encodeURIComponent(city)}`,
        color,
        '2026',
      ],
    );
    await db.run('INSERT INTO barbers(company_id,id,name,specialty,photo_url) VALUES(?,?,?,?,?)', [
      id,
      `${id}-professional`,
      `Equipe ${name}`,
      'Cortes',
      `https://media.example.test/${id}-professional.jpg`,
    ]);
    await db.run(
      "INSERT INTO services(company_id,id,name,description,duration,price,category) VALUES(?,?,?,'Corte exclusivo',40,3700,'Corte')",
      [id, `${id}-service`, `Corte ${name}`],
    );
    await db.run(
      'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
      [id, `${id}-professional`, `${id}-service`, '2026'],
    );
    await db.run(
      'INSERT INTO portfolio(company_id,id,title,category,image,version,created_at) VALUES(?,?,?,?,?,1,?)',
      [id, `${id}-portfolio`, `Corte ${name}`, 'Corte', image, '2026'],
    );
    await db.run(
      "INSERT INTO barber_settings(company_id,barber_id,agenda_mode,max_days_ahead,version) VALUES(?,?,'auto',90,0)",
      [id, `${id}-professional`],
    );
    for (let day = 0; day < 7; day++)
      await db.run(
        "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,'09:00','19:00')",
        [id, `${id}-professional`, day],
      );
  }
}

export async function assertBarberClassic(t, db) {
  await seed(db);
  await t.test(
    '008 preserves business data and checksums; repeated bootstrap keeps customized identity',
    async () => {
      await reconstructBeforeBarberClassic(db);
      const before = {};
      for (const table of [
        'companies',
        'barbers',
        'services',
        'portfolio',
        'appointments',
        'appointment_services',
        'schema_migrations',
      ])
        before[table] = await db.all(`SELECT * FROM ${table} ORDER BY 1`);
      const failing = {
        transaction: (fn) =>
          db.transaction((tx) =>
            fn({
              ...tx,
              run: (sql, args) => {
                if (sql.startsWith('ALTER TABLE barbers ADD COLUMN'))
                  throw new Error('injected 008 failure');
                return tx.run(sql, args);
              },
            }),
          ),
      };
      await assert.rejects(runMigrations(failing), /injected 008 failure/);
      for (const [table, rows] of Object.entries(before))
        assert.deepEqual(await db.all(`SELECT * FROM ${table} ORDER BY 1`), rows);
      await assert.rejects(db.all('SELECT logo_url FROM company_settings'));
      assert.deepEqual(
        await runMigrations(db),
        [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
      );
      for (const row of before.companies) row.site_published = 1;
      for (const row of before.barbers) row.photo_url = null;
      for (const row of before.portfolio) row.sort_order = 0;
      for (const row of before.appointments) row.notes = '';
      for (const row of before.appointments) row.cancellation_reason = '';
      for (const row of before.notifications || [])
        Object.assign(row, { provider_message_id: null, submitted_at: null });
      for (const [table, rows] of Object.entries(before))
        if (table !== 'schema_migrations')
          assert.deepEqual(await db.all(`SELECT * FROM ${table} ORDER BY 1`), rows);
      const history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
      assert.deepEqual(history.slice(0, 7), before.schema_migrations);
      assert.equal(history[7].checksum, readMigration(migrations[7]).checksum);
      await db.run(
        "UPDATE company_settings SET slogan='Personalizado' WHERE company_id='igor-barber-club'",
      );
      await seed(db);
      assert.deepEqual(await runMigrations(db), []);
      assert.equal((await getPublicSite(db, 'igor-barber-club')).settings.slogan, 'Personalizado');
      assert.equal(siteColumns.length, 17);
    },
  );
  await installBarberClassicFixture(db);
  const server = createApp(db, { test: true, serveStatic: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((done) => server.close(done)));
  const request = async (path, method = 'GET', body, cookie = '') => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      body: await res.json(),
      cookie: res.headers.get('set-cookie')?.split(';')[0],
    };
  };
  await t.test(
    'public company identity, logo, services, professionals, portfolio and contacts are scoped',
    async () => {
      const legacy = await request('/site'),
        scoped = await request('/public/igor-barber-club/site');
      assert.equal(legacy.status, 200);
      assert.deepEqual(scoped.body, legacy.body);
      for (const c of ['barbearia-imperial', 'navalha-club']) {
        const prefix = `/public/${c}`;
        const site = (await request(`${prefix}/site`)).body;
        assert.equal(site.company.id, c);
        assert.match(site.settings.logo_url, new RegExp(c));
        assert.equal(site.counts.professionals, 1);
        assert.deepEqual(publicationIssues(site), []);
        for (const [path, field] of [
          ['services', 'id'],
          ['barbers', 'id'],
          ['portfolio', 'id'],
        ]) {
          const result = await request(`${prefix}/${path}`);
          assert.equal(result.status, 200);
          assert.equal(result.body.length, 1);
          assert.ok(result.body.every((r) => r[field].startsWith(c)));
        }
        const professionals = (await request(`${prefix}/barbers`)).body;
        assert.match(professionals[0].photo_url, new RegExp(c));
        assert.equal(
          (
            await request(
              `${prefix}/portfolio/${c === 'barbearia-imperial' ? 'navalha-club' : 'barbearia-imperial'}-portfolio/image`,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(`${prefix}/admin/professionals`, 'POST', {
              name: 'Intruso',
              services: [],
            })
          ).status,
          404,
        );
      }
      assert.equal((await request('/public/not-a-company/site')).status, 404);
      await db.run("UPDATE companies SET status='suspended' WHERE id='navalha-club'");
      assert.equal((await request('/public/navalha-club/site')).status, 404);
      await db.run("UPDATE companies SET status='active' WHERE id='navalha-club'");
    },
  );
  await t.test(
    'existing booking API and visitor history stay scoped; notification identity and links follow the company',
    async () => {
      const c = 'barbearia-imperial',
        prefix = `/public/${c}`;
      let date = addDays(dateInBrazil(), 4);
      while (weekday(date) === 0) date = addDays(date, 1);
      const slots = await request(
        `${prefix}/availability?date=${date}&barberId=${c}-professional&services=${c}-service`,
      );
      assert.equal(slots.status, 200);
      assert.ok(slots.body.slots.length);
      const data = {
        date,
        time: slots.body.slots[0],
        barberId: `${c}-professional`,
        services: [`${c}-service`],
        guest: {
          name: 'Cliente Imperial',
          email: 'imperial-client@example.test',
          phone: '21999999999',
        },
      };
      const booking = await request(`${prefix}/appointments/guest`, 'POST', data);
      assert.equal(booking.status, 201);
      assert.equal(booking.body.company_id, c);
      const mine = await request(`${prefix}/appointments`, 'GET', null, booking.cookie);
      assert.ok(mine.body.some((a) => a.id === booking.body.id));
      const other = await request('/public/navalha-club/appointments', 'GET', null, booking.cookie);
      assert.ok(other.status === 401 || other.body.length === 0);
      assert.equal(
        (
          await request(`${prefix}/appointments/guest`, 'POST', {
            ...data,
            services: ['navalha-club-service'],
          })
        ).status,
        400,
      );
      const event = await db.get(
        "SELECT * FROM notifications WHERE company_id=? AND appointment_id=? AND channel='email'",
        [c, booking.body.id],
      );
      const payload = JSON.parse(event.payload);
      assert.equal(payload.brand.name, 'Barbearia Imperial');
      const email = appointmentEmail(
        payload,
        'confirmed',
        `https://example.test/${c}/minha-conta`,
        c,
      );
      assert.match(email.text, /Barbearia Imperial/);
      assert.doesNotMatch(email.text, /Igor/);
      assert.equal(
        (
          await request(
            `${prefix}/appointments/${booking.body.id}/cancel`,
            'PATCH',
            null,
            booking.cookie,
          )
        ).status,
        200,
      );
    },
  );
  await t.test(
    'optional settings safely omit invalid URLs, colors and unsupported publication data',
    async () => {
      for (const value of [
        'javascript:alert(1)',
        '//example.com/x',
        '/api/public/navalha-club/portfolio/x/image',
        'https://user:password@example.com/a',
      ])
        assert.equal(publicAsset(value), null);
      await db.run(
        "UPDATE company_settings SET logo_url='javascript:alert(1)',instagram_url='https://example.test/foreign',primary_color='#zzzzzz' WHERE company_id='barbearia-imperial'",
      );
      const site = await getPublicSite(db, 'barbearia-imperial');
      assert.equal(site.settings.logo_url, null);
      assert.equal(site.settings.instagram_url, null);
      assert.equal(site.settings.primary_color, null);
      assert.deepEqual(
        publicationIssues({ ...site, counts: { services: 0, professionals: 0, portfolio: 0 } }),
        ['services', 'professionals'],
      );
    },
  );
}
