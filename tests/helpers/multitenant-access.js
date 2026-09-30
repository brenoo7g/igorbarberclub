import assert from 'node:assert/strict';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { bootstrapIgorCompany } from '../../server/company-bootstrap.js';
import { seed } from '../../server/seed.js';
import { getLegacyCompanyId } from '../../server/company-context.js';
import { otherCompany } from './application-context.js';
import { createCompanyNotificationDispatcher } from '../../server/notifications.js';
import { addDays, dateInBrazil, weekday } from '../../server/domain.js';

// Run after the shared data-context contract, using its A/B operational fixtures.
export async function assertMultitenantAccess(t, db) {
  const A = getLegacyCompanyId(),
    B = otherCompany;
  const secret = 'multitenant-identity-test-secret-32-characters';
  const password = 'TestingAccess123!';
  const hash = await bcrypt.hash(password, 4);
  const cookies = {};
  for (const [id, role] of [
    ['rogue', 'admin'],
    ['manager-b', 'client'],
    ['multi', 'client'],
    ['professional', 'client'],
    ['owner-b', 'client'],
    ['customer', 'client'],
  ]) {
    await db.run(
      'INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?,?)',
      [id, 'Teste Isolamento', `${id}@example.test`, '21999999999', hash, role, '2026'],
    );
    cookies[id] =
      `session=${jwt.sign({ version: 0, companyId: B, companyRole: 'owner', isOwner: true }, secret, { subject: id, issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  }
  cookies['manager-a'] =
    `session=${jwt.sign({ version: 0 }, secret, { subject: 'context-admin', issuer: 'igor-barber-club', audience: 'barber-web' })}`;
  for (const [company, id, role] of [
    [B, 'manager-b', 'manager'],
    [A, 'multi', 'manager'],
    [B, 'multi', 'owner'],
    [A, 'professional', 'professional'],
    [B, 'owner-b', 'owner'],
  ])
    await db.run(
      'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
      [company, id, role, '2026'],
    );
  const server = createApp(db, { secret, test: true, serveStatic: false }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(
    path,
    { user = 'manager-a', selector, method = 'GET', body, cookie } = {},
  ) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie ?? cookies[user] ?? '',
        ...(selector !== undefined ? { 'X-Gradefy-Company-Id': selector } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const value = response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : await response.text();
    return {
      status: response.status,
      body: value,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  await t.test(
    'identity is not permission: global admin denied, client manager allowed, professional denied, owner allowed',
    async () => {
      for (const selector of [undefined, A, B])
        assert.equal((await request('/admin/metrics', { user: 'rogue', selector })).status, 403);
      assert.equal(
        (await request('/admin/metrics', { user: 'customer', selector: A })).status,
        403,
      );
      assert.equal((await request('/admin/metrics', { user: '', selector: A })).status, 401);
      assert.equal((await request('/admin/metrics', { user: 'manager-b' })).status, 200);
      assert.equal((await request('/admin/metrics', { user: 'owner-b' })).status, 200);
      assert.equal((await request('/admin/metrics', { user: 'professional' })).status, 403);
      assert.equal((await request('/admin/metrics', { selector: B })).status, 403);
      assert.equal((await request('/admin/metrics', { selector: 'does-not-exist' })).status, 403);
    },
  );
  await t.test(
    'company list is private and minimal; 0/1/multiple memberships and explicit selector',
    async () => {
      assert.equal((await request('/companies', { user: '' })).status, 401);
      assert.deepEqual((await request('/companies', { user: 'rogue' })).body, []);
      const list = (await request('/companies', { user: 'multi' })).body;
      assert.deepEqual(list.map((c) => c.id).sort(), [A, B].sort());
      assert.deepEqual(
        Object.keys(list[0]).sort(),
        ['id', 'name', 'slug', 'status', 'niche', 'template', 'role'].sort(),
      );
      const missing = await request('/admin/metrics', { user: 'multi' });
      assert.equal(missing.status, 409);
      assert.equal(missing.body.code, 'COMPANY_CONTEXT_REQUIRED');
      const a = await request('/admin/metrics', { user: 'multi', selector: A });
      const b = await request('/admin/metrics', { user: 'multi', selector: B });
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(a.body.daily, 7000);
      assert.equal(b.body.daily, 999999);
      assert.equal(
        (await request('/admin/metrics', { user: 'multi', selector: A })).body.daily,
        7000,
      );
      assert.equal(
        (await request('/admin/metrics', { user: 'multi', selector: `${A},${B}` })).status,
        400,
      );
    },
  );
  await t.test(
    'membership removal, role downgrade and suspension take effect with the SAME login JWT; seed never restores access',
    async () => {
      const login = await request('/auth/login', {
        user: '',
        method: 'POST',
        body: { email: 'manager-b@example.test', password },
      });
      assert.equal(login.status, 200);
      const options = { cookie: login.cookie, selector: B };
      assert.equal((await request('/admin/metrics', options)).status, 200);
      await db.run(
        "UPDATE company_members SET status='inactive' WHERE company_id=? AND user_id='manager-b'",
        [B],
      );
      assert.equal((await request('/admin/metrics', options)).status, 403);
      await db.run(
        "UPDATE company_members SET status='active',role='professional' WHERE company_id=? AND user_id='manager-b'",
        [B],
      );
      assert.equal((await request('/admin/metrics', options)).status, 403);
      await db.run(
        "UPDATE company_members SET role='manager' WHERE company_id=? AND user_id='manager-b'",
        [B],
      );
      await db.run("UPDATE companies SET status='suspended' WHERE id=?", [B]);
      assert.equal((await request('/admin/metrics', options)).status, 403);
      assert.equal((await request(`/public/${B}/services`, { user: '' })).status, 404);
      assert.ok(!(await request('/companies', { user: 'multi' })).body.some((c) => c.id === B));
      await db.run("UPDATE companies SET status='active' WHERE id=?", [B]);
      await db.run("DELETE FROM company_members WHERE company_id=? AND user_id='context-admin'", [
        A,
      ]);
      await bootstrapIgorCompany(db);
      await seed(db);
      assert.equal((await request('/admin/metrics')).status, 403);
      assert.equal(
        await db.get("SELECT user_id FROM company_members WHERE company_id=? AND user_id='rogue'", [
          A,
        ]),
        undefined,
      );
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'context-admin','manager','2026')",
        [A],
      );
    },
  );
  await t.test(
    'public slug aliases share handlers and never authorize administration; unknown and suspended companies fail closed',
    async () => {
      assert.deepEqual(
        (await request('/services')).body,
        (await request(`/public/${A}/services`)).body,
      );
      const list = (await request(`/public/${B}/services`, { user: '', selector: A })).body;
      assert.deepEqual(
        list.map((s) => s.id),
        ['foreign-service'],
      );
      const photos = (await request(`/public/${B}/portfolio`, { user: '' })).body;
      assert.equal(
        (await request(photos[0].image.replace(/^\/api/, ''), { user: '' })).status,
        200,
      );
      // A cached router must not retain the old slug or authorize suspended data.
      await db.run("UPDATE companies SET slug='renamed-b' WHERE id=?", [B]);
      assert.equal((await request(`/public/${B}/services`, { user: '' })).status, 404);
      const renamed = (await request('/public/renamed-b/portfolio', { user: '' })).body;
      assert.match(renamed[0].image, /\/public\/renamed-b\//);
      assert.equal(
        (await request(renamed[0].image.replace(/^\/api/, ''), { user: '' })).status,
        200,
      );
      await db.run('UPDATE companies SET slug=? WHERE id=?', [B, B]);
      assert.equal((await request('/public/unknown/services', { user: '' })).status, 404);
      assert.equal(
        (await request(`/public/${B}/admin/metrics`, { user: 'multi', selector: B })).status,
        404,
      );
      assert.equal((await request(`/public/${B}/portfolio/igor-corte-1/image`)).status, 404);
      assert.equal((await request(`/public/${A}/portfolio/foreign-photo/image`)).status, 404);
      await db.run("UPDATE companies SET status='suspended' WHERE id=?", [A]);
      assert.equal((await request('/services')).status, 404);
      assert.equal(
        (
          await request('/auth/login', {
            user: '',
            method: 'POST',
            body: { email: 'manager-b@example.test', password },
          })
        ).status,
        200,
      );
      await db.run("UPDATE companies SET status='active' WHERE id=?", [A]);
    },
  );
  await t.test(
    'A/B managers cannot mutate opposite services, appointments, portfolio, blocks or schedules',
    async () => {
      const service = {
        name: 'Ataque Teste',
        description: '',
        duration: 40,
        price: 10,
        category: 'Cabelo',
      };
      let date = addDays(dateInBrazil(), 20);
      while (weekday(date) === 0) date = addDays(date, 1);
      const bBefore = await db.get("SELECT * FROM appointments WHERE id='foreign-booking'");
      for (const [user, serviceId, barber, photo, appointment] of [
        ['manager-a', 'foreign-service', 'foreign-barber', 'foreign-photo', 'foreign-booking'],
        ['manager-b', 'corte', 'igor', 'igor-corte-1', 'metric-a1'],
      ]) {
        assert.equal(
          (await request(`/admin/services/${serviceId}`, { user, method: 'PUT', body: service }))
            .status,
          404,
        );
        assert.equal(
          (await request(`/admin/services/${serviceId}`, { user, method: 'DELETE' })).status,
          404,
        );
        assert.equal(
          (
            await request(`/admin/appointments/${appointment}/status`, {
              user,
              method: 'PATCH',
              body: { status: 'cancelled' },
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request(`/admin/portfolio/${photo}`, {
              user,
              method: 'PUT',
              body: { title: 'Ataque', category: 'Teste', version: 1 },
            })
          ).status,
          404,
        );
        await request(`/admin/portfolio/${photo}`, { user, method: 'DELETE' });
        assert.ok(await db.get('SELECT id FROM portfolio WHERE id=?', [photo]));
        assert.equal((await request(`/admin/barbers/${barber}/schedule`, { user })).status, 404);
        assert.equal(
          (
            await request('/admin/blocks', {
              user,
              method: 'POST',
              body: { barberId: barber, date, start: '10:00', end: '10:40', reason: 'Ataque' },
            })
          ).status,
          404,
        );
      }
      assert.deepEqual(
        await db.get("SELECT * FROM appointments WHERE id='foreign-booking'"),
        bBefore,
      );
      await request('/admin/blocks/foreign-block', { method: 'DELETE' });
      assert.ok(await db.get("SELECT id FROM blocks WHERE id='foreign-block'"));
    },
  );
  await t.test(
    'customer and visitor histories require company AND identity; booking never creates memberships',
    async () => {
      const before = Number((await db.get('SELECT COUNT(*) AS n FROM company_members')).n);
      // A/B use their own availability API. Free fixtures do not collide with historical bookings.
      await db.run(
        "UPDATE barber_settings SET agenda_mode='auto',max_days_ahead=90 WHERE company_id IN (?,?)",
        [A, B],
      );
      let date = addDays(dateInBrazil(), 25);
      while (weekday(date) === 0) date = addDays(date, 1);
      await db.run('DELETE FROM barber_working_breaks WHERE company_id=?', [B]);
      await db.run('DELETE FROM barber_working_hours WHERE company_id=?', [B]);
      for (let day = 0; day < 7; day++)
        await db.run(
          "INSERT INTO barber_working_hours(company_id,barber_id,weekday,active,start_time,end_time) VALUES(?,'foreign-barber',?,1,'09:00','19:00')",
          [B, day],
        );
      const bookings = {};
      const guests = {};
      const contact = {
        name: 'Cliente Público',
        email: 'customer-public@example.test',
        phone: '21999999999',
      };
      for (const [company, barber, service] of [
        [A, 'igor', 'corte'],
        [B, 'foreign-barber', 'foreign-service'],
      ]) {
        const prefix = `/public/${company}`;
        const payload = { barberId: barber, services: [service], date, time: '09:00' };
        assert.equal(
          (
            await request(`${prefix}/appointments`, {
              user: 'customer',
              method: 'POST',
              body: { ...payload, services: [company === A ? 'foreign-service' : 'corte'] },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request(`${prefix}/appointments`, {
              user: 'customer',
              method: 'POST',
              body: { ...payload, barberId: company === A ? 'foreign-barber' : 'igor' },
            })
          ).status,
          404,
        );
        const created = await request(`${prefix}/appointments`, {
          user: 'customer',
          method: 'POST',
          body: payload,
        });
        assert.equal(created.status, 201, JSON.stringify(created.body));
        // Existing reservation path must use the transaction adapter for membership
        // lookup (using the outer SQLite queue here would deadlock).
        const available = await request(
          `${prefix}/availability?barberId=${barber}&services=${service}&date=${date}&except=${created.body.id}`,
          { user: 'customer' },
        );
        assert.equal(available.status, 200);
        assert.ok(available.body.slots.includes('09:00'));
        bookings[company] = created.body.id;
        const guest = await request(`${prefix}/appointments/guest`, {
          user: '',
          method: 'POST',
          body: { ...payload, time: '09:40', guest: contact },
        });
        assert.equal(guest.status, 201);
        guests[company] = guest;
      }
      assert.notEqual(guests[A].cookie.split('=')[0], guests[B].cookie.split('=')[0]);
      for (const company of [A, B]) {
        const other = company === A ? B : A;
        const prefix = `/public/${company}`;
        assert.deepEqual(
          (await request(`${prefix}/appointments`, { user: 'customer' })).body.map((a) => a.id),
          [bookings[company]],
        );
        assert.equal(
          (
            await request(`${prefix}/appointments/${bookings[other]}/cancel`, {
              user: 'customer',
              method: 'PATCH',
              body: {},
            })
          ).status,
          404,
        );
        assert.deepEqual(
          (await request(`${prefix}/appointments`, { cookie: guests[company].cookie })).body.map(
            (a) => a.id,
          ),
          [guests[company].body.id],
        );
        assert.equal(
          (
            await request(`${prefix}/appointments/${guests[other].body.id}/cancel`, {
              cookie: guests[company].cookie,
              method: 'PATCH',
              body: {},
            })
          ).status,
          404,
        );
        const stolenCookie =
          guests[company].cookie.split('=')[0] + '=' + guests[other].cookie.split('=')[1];
        assert.equal(
          (await request(`${prefix}/appointments`, { cookie: stolenCookie })).status,
          401,
        );
      }
      assert.equal(Number((await db.get('SELECT COUNT(*) AS n FROM company_members')).n), before);
      const created = await db.get('SELECT * FROM notifications WHERE company_id=?', [A]);
      await assert.rejects(
        db.run('UPDATE notifications SET appointment_id=? WHERE id=?', [bookings[B], created.id]),
      );
    },
  );
  await t.test(
    'background dispatch uses event company, no user context; suspended company events stay pending',
    async (t) => {
      const previous = {
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        EMAIL_FROM: process.env.EMAIL_FROM,
        TWILIO_CONTENT_SID: process.env.TWILIO_CONTENT_SID,
      };
      process.env.RESEND_API_KEY = 'test';
      process.env.EMAIL_FROM = 'test@example.test';
      delete process.env.TWILIO_CONTENT_SID;
      t.after(() => {
        for (const [key, value] of Object.entries(previous))
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
      });
      const ids = [];
      t.mock.method(globalThis, 'fetch', async (_url, options) => {
        ids.push(options.headers['Idempotency-Key']);
        return new Response('{}', { status: 202 });
      });
      await db.run("UPDATE companies SET status='suspended' WHERE id=?", [B]);
      await createCompanyNotificationDispatcher(db, { batchSize: 100 })();
      for (const id of ids)
        assert.equal(
          (await db.get('SELECT company_id FROM notifications WHERE id=?', [id])).company_id,
          A,
        );
      assert.ok(
        (
          await db.all(
            "SELECT id FROM notifications WHERE company_id=? AND status='pending' AND channel='email'",
            [B],
          )
        ).length,
      );
      await db.run("UPDATE companies SET status='active' WHERE id=?", [B]);
      ids.length = 0;
      await createCompanyNotificationDispatcher(db, { batchSize: 100 })();
      assert.ok(ids.length);
      for (const id of ids)
        assert.equal(
          (await db.get('SELECT company_id FROM notifications WHERE id=?', [id])).company_id,
          B,
        );
    },
  );
}
