import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { runMigrations, migrations, readMigration } from '../../server/migrations.js';
import { addDays, dateInBrazil } from '../../server/domain.js';

export async function assertClientMigration(t, db) {
  await seed(db);
  await db.run(
    "INSERT INTO appointments(company_id,id,barber_id,date,start_minute,end_minute,total,status,guest_name,guest_phone,notes,created_at) VALUES('igor-barber-club','client-migration-legacy','igor','2050-01-01',540,580,3300,'cancelled','Legado','','Preservar','2026')",
  );
  await db.run('DROP TABLE client_appointments');
  await db.run('DROP TABLE company_clients');
  await db.run('DELETE FROM schema_migrations WHERE version=13');
  for (const sql of readMigration(migrations[11]).statements)
    if (sql.startsWith('-- dialect: ' + db.dialect) && sql.includes('idempotency'))
      await db.run(sql);
  const before = await db.all('SELECT * FROM appointments ORDER BY id'),
    keys = await db.all('SELECT * FROM idempotency_keys'),
    history = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const broken = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('INSERT INTO schema_migrations'))
              throw new Error('injected 013 failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(broken), /injected 013 failure/);
  await assert.rejects(db.all('SELECT * FROM company_clients'));
  assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), history);
  assert.deepEqual(await runMigrations(db), [13]);
  const clients = await db.all('SELECT * FROM company_clients ORDER BY id'),
    links = await db.all('SELECT * FROM client_appointments ORDER BY appointment_id');
  assert.equal(links.length, before.length);
  assert.equal(
    clients.find((c) => c.source_id === 'client-migration-legacy').phone,
    'não informado',
  );
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(await db.all('SELECT * FROM appointments ORDER BY id'), before);
  assert.deepEqual(await db.all('SELECT * FROM company_clients ORDER BY id'), clients);
  assert.deepEqual(
    await db.all('SELECT * FROM client_appointments ORDER BY appointment_id'),
    links,
  );
  assert.deepEqual(await db.all('SELECT * FROM idempotency_keys'), keys);
  await assert.rejects(
    db.run(
      "INSERT INTO company_clients(id,company_id,name,phone,source_kind,created_at,updated_at) VALUES(NULL,'igor-barber-club','Invalid','123','manual','2026','2026')",
    ),
  );
  await assert.rejects(
    db.run(
      "INSERT INTO company_clients(id,company_id,name,phone,source_kind,created_at,updated_at) VALUES('invalid-client-ref','missing-company','Invalid','123','manual','2026','2026')",
    ),
  );
  const recorded = await db.get('SELECT checksum FROM schema_migrations WHERE version=13');
  assert.equal(recorded.checksum, readMigration(migrations[12]).checksum);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=13', ['0'.repeat(64)]);
  await assert.rejects(runMigrations(db), /Hist/);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=13', [recorded.checksum]);
  t.diagnostic(
    '013: transactional rollback, repeated backfill, explicit NOT NULL/FKs, legacy and checksum preservation',
  );
}

export async function assertBusinessManagement(t, db, second = db) {
  await seed(db);
  const stamp = new Date().toISOString(),
    secret = 'business-management-disposable-secret',
    cookies = {};
  for (const role of ['owner', 'manager', 'professional', 'outsider']) {
    const id = 'business-' + role;
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'21988887777','fixture','client',?)",
      [id, id, id + '@example.test', stamp],
    );
    cookies[role] =
      'session=' +
      jwt.sign({ version: 0 }, secret, {
        subject: id,
        issuer: 'igor-barber-club',
        audience: 'barber-web',
      });
  }
  for (const [cid, plan] of [
    ['business-a', 'team'],
    ['business-b', 'team'],
    ['business-one', 'individual'],
  ]) {
    await db.run(
      "INSERT INTO companies(id,name,slug,niche_id,template_id,site_published,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',1,?,?)",
      [cid, cid, cid, stamp, stamp],
    );
    await db.run(
      "INSERT INTO company_settings(company_id,description,updated_at) VALUES(?,'Negócio',?)",
      [cid, stamp],
    );
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,?,'active','manual',?,?)",
      [cid + '-sub', cid, plan, stamp, stamp],
    );
    for (const role of ['owner', 'manager', 'professional'])
      await db.run(
        'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
        [cid, 'business-' + role, role, stamp],
      );
    await db.run(
      "INSERT INTO services(company_id,id,name,description,category,duration,price) VALUES(?,?,'Corte original','Original','Cabelo',40,4500)",
      [cid, cid + '-service'],
    );
    if (cid === 'business-one') continue;
    await db.run(
      "INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,?,'Equipe original','Cortes')",
      [cid, cid + '-pro'],
    );
    await db.run(
      'INSERT INTO barber_services(company_id,barber_id,service_id,created_at) VALUES(?,?,?,?)',
      [cid, cid + '-pro', cid + '-service', stamp],
    );
    for (let day = 0; day < 7; day++)
      await db.run(
        "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,?,?,1,'09:00','18:00')",
        [cid, cid + '-pro', day],
      );
  }
  let failure = '';
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (failure && sql.startsWith(failure)) {
                failure = '';
                throw Object.assign(new Error('injected business rollback'), { status: 503 });
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((d) =>
    createApp(d, { secret, test: true, serveStatic: false, siteStorage: null }).listen(
      0,
      '127.0.0.1',
    ),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const s of servers) await new Promise((done) => s.close(done));
  });
  async function req(
    path,
    { cid = 'business-a', user = 'owner', method = 'GET', body, key, instance = 0, cookie } = {},
  ) {
    const r = await fetch('http://127.0.0.1:' + servers[instance].address().port + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
        ...(cookie || user ? { Cookie: cookie || cookies[user] } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const count = async (table, cid = 'business-a') =>
    Number((await db.get('SELECT COUNT(*) AS n FROM ' + table + ' WHERE company_id=?', [cid])).n);
  const clientData = { name: 'Cliente Cadastro', phone: '(21) 99888-7777', notes: 'Nota privada' },
    serviceData = {
      name: 'Corte moderno',
      description: 'Descrição',
      category: 'Cabelo',
      duration: 40,
      price: 2299,
      active: true,
      professionalIds: ['business-a-pro'],
    };
  const date = addDays(dateInBrazil(), 3),
    book = (time = '09:00') => ({
      services: ['business-a-service'],
      barberId: 'business-a-pro',
      date,
      time,
    });
  let client, booking, service;
  await t.test(
    'owner/manager access, explicit context and no cross-company data/PII exposure',
    async () => {
      for (const path of [
        '/admin/clients',
        '/admin/services',
        '/admin/professionals',
        '/admin/barbers/business-a-pro/schedule',
      ]) {
        assert.equal((await req(path, { user: null })).status, 401);
        assert.equal((await req(path, { user: 'professional' })).status, 403);
        assert.equal((await req(path, { user: 'outsider' })).status, 403);
        assert.equal((await req(path, { user: 'manager' })).status, 200);
      }
      assert.equal((await req('/admin/clients', { cid: null })).status, 409);
      assert.equal((await req('/admin/clients?company_id=business-b')).status, 400);
      assert.equal((await req('/public/business-a/admin/clients')).status, 404);
      for (const [id, price, max] of [
        ['individual', 2299, 1],
        ['team', 3299, null],
      ]) {
        const p = await db.get('SELECT * FROM plans WHERE id=?', [id]);
        assert.equal(p.price_cents, price);
        assert.equal(p.currency, 'BRL');
        assert.equal(p.trial_days, 7);
        assert.equal(p.max_professionals, max);
        const management = (
          await req('/admin/management', {
            cid: id === 'individual' ? 'business-one' : 'business-a',
          })
        ).data;
        assert.equal(management.plan.priceCents, price);
      }
      assert.equal(await count('subscriptions', 'igor-barber-club'), 0);
    },
  );
  await t.test(
    'manual clients: optional email, idempotent replay/races, duplicate warning, no automatic phone merges or accounts',
    async () => {
      const users = Number((await db.get('SELECT COUNT(*) AS n FROM users')).n);
      const pair = await Promise.all([
        req('/admin/clients', { method: 'POST', body: clientData, key: 'client-create-repeat' }),
        req('/admin/clients', {
          method: 'POST',
          body: clientData,
          key: 'client-create-repeat',
          instance: 1,
        }),
      ]);
      assert.deepEqual(
        pair.map((p) => p.status),
        [201, 201],
      );
      assert.deepEqual(pair[0].data, pair[1].data);
      client = pair[0].data;
      assert.equal(client.email, null);
      assert.deepEqual(
        (
          await req('/admin/clients', {
            method: 'POST',
            body: clientData,
            key: 'client-create-repeat',
            instance: 1,
          })
        ).data,
        client,
      );
      assert.equal(
        (
          await req('/admin/clients', {
            method: 'POST',
            body: { ...clientData, name: 'Outro' },
            key: 'client-create-repeat',
          })
        ).status,
        409,
      );
      assert.equal(
        (await req('/admin/clients', { method: 'POST', body: clientData })).data.code,
        'CLIENT_ALREADY_EXISTS',
      );
      assert.equal(
        (
          await req('/admin/clients', {
            method: 'POST',
            body: { ...clientData, name: 'Outra pessoa' },
          })
        ).status,
        201,
      );
      assert.equal(await count('company_clients'), 2);
      assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM users')).n), users);
      const list = await req('/admin/clients?q=99888-7777');
      assert.equal(list.data.total, 2);
      assert.ok(list.data.items.every((c) => !('notes' in c) && !('source_id' in c)));
      assert.equal((await req('/admin/clients?q=Cadastro')).data.total, 1);
      assert.equal((await req('/admin/clients?q=%25')).data.total, 0);
      assert.equal((await req('/admin/clients/' + client.id, { cid: 'business-b' })).status, 404);
      assert.equal(
        (
          await req('/admin/clients', {
            cid: 'business-b',
            method: 'POST',
            body: clientData,
            key: 'client-create-repeat',
          })
        ).status,
        201,
      );
      assert.equal(
        (await req('/admin/clients', { method: 'POST', body: { ...clientData, email: 'invalid' } }))
          .status,
        400,
      );
      for (let i = 0; i < 31; i++)
        await db.run(
          "INSERT INTO company_clients(id,company_id,name,phone,source_kind,created_at,updated_at) VALUES(?,'business-a',?,'21900000000','manual',?,?)",
          ['pagination-' + i, 'Paginação ' + i, stamp, stamp],
        );
      const paged = (await req('/admin/clients?q=Paginação')).data;
      assert.equal(paged.total, 31);
      assert.equal(paged.items.length, 30);
      assert.equal((await req('/admin/clients?q=Paginação&page=2')).data.items.length, 1);
    },
  );
  await t.test(
    'manual agenda creates links atomically; client edit preserves snapshots, login identity and history',
    async () => {
      const result = await req('/admin/agenda', {
        method: 'POST',
        body: { ...book(), clientId: client.id },
        key: 'managed-business-client',
      });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      booking = result.data;
      assert.equal(booking.client_id, client.id);
      assert.equal(booking.guest_name, clientData.name);
      assert.equal(await count('notifications'), 1); // Optional email: only WhatsApp is enqueued.
      const before = await db.get('SELECT * FROM appointments WHERE id=?', [booking.id]);
      const edit = {
        ...clientData,
        name: 'Cliente Editado',
        email: 'editado@example.test',
        version: 0,
      };
      assert.equal(
        (await req('/admin/clients/' + client.id, { method: 'PUT', body: edit })).status,
        200,
      );
      assert.equal(
        (await req('/admin/clients/' + client.id, { method: 'PUT', body: edit })).data.code,
        'CLIENT_CHANGED',
      );
      assert.deepEqual(await db.get('SELECT * FROM appointments WHERE id=?', [booking.id]), before);
      const detail = (await req('/admin/clients/' + client.id)).data;
      assert.equal(detail.timezone, 'America/Sao_Paulo');
      assert.ok(Number.isFinite(Date.parse(detail.client.created_at)));
      assert.equal(
        detail.client.created_at,
        (await db.get('SELECT created_at FROM company_clients WHERE id=?', [client.id])).created_at,
      );
      assert.equal(detail.client.notes, 'Nota privada');
      assert.equal(detail.history[0].totalCents, 4500);
      assert.equal(detail.next.id, booking.id);
      assert.ok(!('email' in detail.history[0]) && !('notes' in detail.history[0]));
      assert.equal(
        (
          await req('/admin/agenda', {
            method: 'POST',
            body: { ...book('09:40'), clientId: client.id },
            cid: 'business-b',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req('/admin/agenda', {
            method: 'POST',
            body: {
              services: ['business-b-service'],
              barberId: 'business-b-pro',
              date,
              time: '09:00',
              clientId: client.id,
            },
            cid: 'business-b',
          })
        ).status,
        404,
      );
      await assert.rejects(
        db.run(
          'INSERT INTO client_appointments(company_id,client_id,appointment_id) VALUES(?,?,?)',
          ['business-b', client.id, booking.id],
        ),
      );
      await db.run("UPDATE appointments SET status='completed' WHERE id=?", [booking.id]);
      assert.equal((await req('/admin/clients/' + client.id + '?status=completed')).data.total, 1);
      assert.equal((await req('/admin/clients/' + client.id + '?status=cancelled')).data.total, 0);
      const manual = await req('/admin/agenda', {
        method: 'POST',
        body: {
          ...book('09:40'),
          guest: {
            name: 'Contato manual',
            email: 'manual-business@example.test',
            phone: '21912345678',
          },
        },
      });
      assert.equal(manual.status, 201);
      assert.equal((await req('/admin/clients?q=manual-business%40example.test')).data.total, 1);
    },
  );
  await t.test(
    'public Barber Classic booking shares business clients without merging people by contacts',
    async () => {
      const guest = {
        name: 'Visitante Público',
        phone: '21988887777',
        email: 'visitor-business@example.test',
      };
      const first = await req('/public/business-a/appointments/guest', {
        user: null,
        method: 'POST',
        body: { ...book('10:20'), guest },
      });
      assert.equal(first.status, 201, JSON.stringify(first.data));
      const repeat = await req('/public/business-a/appointments/guest', {
        user: null,
        cookie: first.cookie,
        method: 'POST',
        body: { ...book('11:00'), guest },
      });
      assert.equal(repeat.status, 201);
      assert.equal(first.data.client_id, repeat.data.client_id);
      const another = await req('/public/business-a/appointments/guest', {
        user: null,
        method: 'POST',
        body: { ...book('11:40'), guest },
      });
      assert.equal(another.status, 201);
      assert.notEqual(another.data.client_id, first.data.client_id);
      assert.equal((await req('/admin/clients?q=visitor-business')).data.total, 2);
      assert.equal((await req('/admin/clients/' + first.data.client_id)).data.total, 2);
      assert.equal(
        (await req('/public/business-a/clients/' + first.data.client_id, { user: null })).status,
        404,
      );
      assert.equal((await req('/public/business-a/site', { user: null })).status, 200);
      const account = await db.get("SELECT * FROM users WHERE id='business-owner'");
      const own = await req('/public/business-a/appointments', {
        method: 'POST',
        body: book('16:20'),
      });
      const other = await req('/public/business-b/appointments', {
        method: 'POST',
        body: { ...book('16:20'), services: ['business-b-service'], barberId: 'business-b-pro' },
      });
      assert.equal(own.status, 201);
      assert.equal(other.status, 201);
      assert.notEqual(own.data.client_id, other.data.client_id);
      const local = await req('/admin/clients/' + own.data.client_id);
      assert.equal(
        (
          await req('/admin/clients/' + own.data.client_id, {
            method: 'PUT',
            body: {
              name: 'Nome empresarial',
              phone: '21955556666',
              email: 'local@example.test',
              version: local.data.client.version,
            },
          })
        ).status,
        200,
      );
      assert.deepEqual(await db.get("SELECT * FROM users WHERE id='business-owner'"), account);
      assert.equal(
        (await req('/admin/clients/' + other.data.client_id, { cid: 'business-b' })).data.client
          .name,
        account.name,
      );
    },
  );
  await t.test(
    'services: cents/duration validation, company associations, soft deactivation and immutable reservation prices',
    async () => {
      const created = await req('/admin/services', {
        method: 'POST',
        body: serviceData,
        key: 'service-business-001',
      });
      assert.equal(created.status, 201);
      service = created.data;
      assert.equal(
        (await req('/admin/professionals/business-a-pro')).data.services.includes(service.id),
        true,
      );
      assert.equal(
        (await req('/admin/services', { method: 'POST', body: { ...serviceData, price: 22.99 } }))
          .status,
        400,
      );
      assert.equal(
        (await req('/admin/services', { method: 'POST', body: { ...serviceData, duration: 0 } }))
          .status,
        400,
      );
      assert.equal(
        (
          await req('/admin/services', {
            method: 'POST',
            body: { ...serviceData, professionalIds: ['business-b-pro'] },
          })
        ).status,
        400,
      );
      const change = await req('/admin/services/' + service.id, {
        method: 'PUT',
        body: { ...serviceData, price: 3299, duration: 50, active: false },
      });
      assert.equal(change.status, 200);
      assert.equal(change.data.active, 0);
      assert.ok(
        !(await req('/public/business-a/services', { user: null })).data.some(
          (s) => s.id === service.id,
        ),
      );
      assert.equal(
        (
          await req('/admin/services/' + service.id, {
            method: 'PUT',
            body: { ...serviceData, price: 3299, duration: 50, active: true },
          })
        ).status,
        200,
      );
      const booked = await req('/admin/agenda', {
        method: 'POST',
        body: { ...book('14:50'), services: [service.id], clientId: client.id },
      });
      assert.equal(booked.status, 201, JSON.stringify(booked.data));
      assert.equal(booked.data.total, 3299);
      const saved = await db.all('SELECT * FROM appointment_services WHERE appointment_id=?', [
        booked.data.id,
      ]);
      assert.equal(
        (
          await req('/admin/services/' + service.id, {
            method: 'PUT',
            body: { ...serviceData, price: 5000, duration: 60 },
          })
        ).status,
        200,
      );
      assert.equal((await req('/admin/services/' + service.id, { method: 'DELETE' })).status, 200);
      const current = await db.get('SELECT * FROM services WHERE id=?', [service.id]);
      const associations = await db.all(
        'SELECT * FROM barber_services WHERE company_id=? AND service_id=?',
        ['business-a', service.id],
      );
      const statusPath = '/admin/services/' + service.id + '/status';
      assert.equal(
        (await req(statusPath, { method: 'PATCH', body: { active: true } })).status,
        200,
      );
      assert.deepEqual(
        { ...(await db.get('SELECT * FROM services WHERE id=?', [service.id])) },
        {
          ...current,
          active: 1,
        },
      );
      assert.deepEqual(
        await db.all('SELECT * FROM barber_services WHERE company_id=? AND service_id=?', [
          'business-a',
          service.id,
        ]),
        associations,
      );
      for (const [options, status] of [
        [{ cid: 'business-b' }, 404],
        [{ user: 'professional' }, 403],
        [{ user: 'outsider' }, 403],
        [{ user: null }, 401],
      ])
        assert.equal(
          (await req(statusPath, { ...options, method: 'PATCH', body: { active: false } })).status,
          status,
        );
      assert.equal(
        (await req(statusPath, { method: 'PATCH', body: { active: false, price: 1 } })).status,
        400,
      );
      assert.equal(
        (await req(statusPath, { method: 'PATCH', body: { active: false } })).status,
        200,
      );
      assert.deepEqual(
        await db.all('SELECT * FROM appointment_services WHERE appointment_id=?', [booked.data.id]),
        saved,
      );
      assert.equal(
        (
          await req('/admin/agenda', {
            method: 'POST',
            body: { ...book('16:00'), services: [service.id], clientId: client.id },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/admin/services/' + service.id, {
            cid: 'business-b',
            method: 'PUT',
            body: serviceData,
          })
        ).status,
        404,
      );
    },
  );
  await t.test(
    'professionals: no login required, photo/associations/linked member preserved, schedules reused',
    async () => {
      const data = {
        name: 'Profissional Editável',
        specialty: 'Cortes',
        services: ['business-a-service'],
        photo_url: 'https://example.test/pro.jpg',
      };
      const created = await req('/admin/professionals', { method: 'POST', body: data });
      assert.equal(created.status, 201);
      const pro = created.data;
      assert.equal(pro.user_id, null);
      assert.equal(
        (
          await req('/admin/professionals/' + pro.id, {
            method: 'PUT',
            body: { ...data, userId: 'business-professional' },
          })
        ).status,
        200,
      );
      const edited = await req('/admin/professionals/' + pro.id, {
        method: 'PUT',
        body: { ...data, name: 'Novo nome' },
      });
      assert.equal(edited.status, 200);
      assert.equal(edited.data.user_id, 'business-professional');
      assert.equal(edited.data.photo_url, data.photo_url);
      assert.equal(
        (
          await req('/admin/professionals/' + pro.id, {
            method: 'PUT',
            body: { ...data, photo_url: 'javascript:alert(1)' },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await req('/admin/professionals/' + pro.id, {
            method: 'PUT',
            body: { ...data, services: ['business-b-service'] },
          })
        ).status,
        400,
      );
      const schedule = (await req('/admin/barbers/' + pro.id + '/schedule')).data;
      assert.ok(schedule.days.every((d) => !d.active));
      const body = {
        agenda_mode: 'auto',
        max_days_ahead: 30,
        version: schedule.settings.version,
        days: schedule.days.map((d) => ({
          ...d,
          active: true,
          start_time: '09:00',
          end_time: '18:00',
          breaks: [{ start_time: '12:20', end_time: '14:00' }],
        })),
      };
      assert.equal(
        (await req('/admin/barbers/' + pro.id + '/schedule', { method: 'PUT', body })).status,
        200,
      );
      const slots = (
        await req(
          '/public/business-a/availability?' +
            new URLSearchParams({ barberId: pro.id, date, services: 'business-a-service' }),
          { user: null },
        )
      ).data.slots;
      assert.ok(slots.includes('11:40'));
      assert.ok(!slots.includes('12:00'));
      assert.ok(slots.includes('14:00'));
      assert.equal(
        (
          await req('/admin/professionals/' + pro.id + '/status', {
            method: 'PATCH',
            body: { active: false },
          })
        ).status,
        200,
      );
      assert.ok(
        !(await req('/public/business-a/barbers', { user: null })).data.some(
          (p) => p.id === pro.id,
        ),
      );
      assert.equal(await count('barbers'), 2);
    },
  );
  await t.test(
    'professional deactivation confirms current future reservations under the booking lock and preserves them',
    async () => {
      const path = '/admin/professionals/business-a-pro';
      const before = (await req(path)).data;
      assert.ok(before.upcoming_appointments > 0);
      const newBooking = await req('/admin/agenda', {
        instance: 1,
        method: 'POST',
        body: { ...book(), date: addDays(date, 1), clientId: client.id },
      });
      assert.equal(newBooking.status, 201, JSON.stringify(newBooking.data));
      const stale = await req(path + '/status', {
        method: 'PATCH',
        body: { active: false, expectedUpcoming: before.upcoming_appointments },
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.data.code, 'PROFESSIONAL_APPOINTMENTS_CHANGED');
      const fresh = (await req(path)).data;
      assert.equal(fresh.active, 1);
      assert.equal(fresh.upcoming_appointments, before.upcoming_appointments + 1);
      const reservations = await db.all(
        "SELECT * FROM appointments WHERE company_id='business-a' AND barber_id='business-a-pro' ORDER BY id",
      );
      const other = (await req('/admin/professionals/business-b-pro', { cid: 'business-b' })).data;
      const deactivated = await req(path + '/status', {
        method: 'PATCH',
        body: { active: false, expectedUpcoming: fresh.upcoming_appointments },
      });
      assert.equal(deactivated.status, 200);
      assert.equal(deactivated.data.upcoming_appointments, fresh.upcoming_appointments);
      assert.deepEqual(
        await db.all(
          "SELECT * FROM appointments WHERE company_id='business-a' AND barber_id='business-a-pro' ORDER BY id",
        ),
        reservations,
      );
      assert.deepEqual(
        (await req('/admin/professionals/business-b-pro', { cid: 'business-b' })).data,
        other,
      );
      assert.ok(
        !(await req('/public/business-a/barbers', { user: null })).data.some(
          (p) => p.id === 'business-a-pro',
        ),
      );
      assert.equal(
        (await req(path + '/status', { method: 'PATCH', body: { active: true } })).status,
        200,
      );
    },
  );
  await t.test(
    'Individual concurrent reactivation and legacy endpoints cannot exceed one active professional',
    async () => {
      const create = () =>
        req('/admin/professionals', {
          cid: 'business-one',
          method: 'POST',
          body: {
            name: 'Profissional Individual',
            services: ['business-one-service'],
            active: false,
          },
        });
      const a = await create(),
        b = await create();
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      const pair = await Promise.all([
        req('/admin/professionals/' + a.data.id + '/status', {
          cid: 'business-one',
          method: 'PATCH',
          body: { active: true },
        }),
        req('/admin/professionals/' + b.data.id + '/status', {
          cid: 'business-one',
          instance: 1,
          method: 'PATCH',
          body: { active: true },
        }),
      ]);
      assert.deepEqual(pair.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM barbers WHERE company_id='business-one' AND active=1",
            )
          ).n,
        ),
        1,
      );
      assert.equal(
        (
          await req('/admin/professionals', {
            cid: 'business-one',
            method: 'POST',
            body: { name: 'Acima do limite', services: ['business-one-service'] },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await req('/admin/professionals/' + a.data.id, {
            cid: 'business-one',
            method: 'PUT',
            body: { name: 'Bypass', services: ['business-one-service'], active: true },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'write rollback also rolls back client association and key; expired subscription stays read only through old APIs',
    async () => {
      const before = await count('company_clients');
      failure = 'INSERT INTO company_clients';
      const request = {
        method: 'POST',
        body: { name: 'Cliente Rollback', phone: '21999999999' },
        key: 'client-fail-retry',
        instance: 2,
      };
      assert.equal((await req('/admin/clients', request)).status, 503);
      assert.equal(await count('company_clients'), before);
      assert.equal((await req('/admin/clients', request)).status, 201);
      const reservations = await count('appointments'),
        links = await count('client_appointments'),
        clients = await count('company_clients');
      failure = 'INSERT INTO notifications';
      const bookingRequest = {
        method: 'POST',
        body: {
          ...book('17:00'),
          guest: { name: 'Rollback Book', phone: '21999999999', email: 'rollback@example.test' },
        },
        key: 'client-book-rollback',
        instance: 2,
      };
      assert.equal((await req('/admin/agenda', bookingRequest)).status, 503);
      assert.equal(await count('appointments'), reservations);
      assert.equal(await count('client_appointments'), links);
      assert.equal(await count('company_clients'), clients);
      assert.equal((await req('/admin/agenda', bookingRequest)).status, 201);
      await db.run("UPDATE subscriptions SET ends_at='2000-01-01' WHERE company_id='business-a'");
      assert.equal((await req('/admin/clients')).data.editable, false);
      for (const [path, method, body] of [
        ['/admin/clients', 'POST', clientData],
        ['/admin/services', 'POST', serviceData],
        ['/admin/services/' + service.id, 'PUT', serviceData],
        ['/admin/professionals/business-a-pro/status', 'PATCH', { active: false }],
        ['/admin/barbers/business-a-pro/schedule', 'PUT', {}],
      ]) {
        const result = await req(path, { method, body });
        assert.ok([400, 409].includes(result.status));
      }
      assert.deepEqual(
        (
          await req('/admin/clients', {
            method: 'POST',
            body: clientData,
            key: 'client-create-repeat',
          })
        ).data,
        client,
      );
      assert.equal((await req('/services', { cid: 'igor-barber-club', user: null })).status, 200);
      assert.equal(await count('subscriptions', 'igor-barber-club'), 0);
    },
  );
}
