import { authorizeMockEmail } from './helpers/email-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { installMinisiteBrowser } from './helpers/minisite-browser.js';
import { testSiteStorage } from './helpers/site-storage.js';

test('Mini Site explicit customer session, real booking, administrative isolation and recovery', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const hash = (await db.get("SELECT password_hash FROM users WHERE email='cliente@example.com'"))
    .password_hash;
  await installMinisiteBrowser(db, hash);
  await db.run(
    "INSERT INTO companies(id,name,slug,niche_id,template_id,created_at,updated_at) VALUES('other-mini-auth','Outro Estabelecimento','other-mini-auth','barbershop','gradefy-minisite',?,?)",
    [new Date().toISOString(), new Date().toISOString()],
  );
  await db.run("INSERT INTO company_settings(company_id,updated_at) VALUES('other-mini-auth',?)", [
    new Date().toISOString(),
  ]);
  const secret = 'minisite-customer-test-secret-not-production';
  const app = createApp(db, {
    secret,
    test: true,
    serveStatic: false,
    siteStorage: testSiteStorage(),
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const root = '/public/minisite-browser';
  const password = 'ClienteDemo2026!';
  async function req(path, { cookie, body, method = body ? 'POST' : 'GET', headers = {} } = {}) {
    const r = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookies: r.headers.getSetCookie(),
      cookie: r.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; '),
    };
  }
  const owner = await req('/auth/login', {
    body: { email: 'minisite-owner@example.com', password },
  });
  assert.equal(owner.status, 200);
  let customer, other, booking;
  await t.test(
    'panel cookie is not customer login; public catalogue remains public and anonymous writes are refused',
    async () => {
      const identity = await req(root + '/auth/me', { cookie: owner.cookie });
      assert.equal(identity.data.user, null);
      assert.equal(identity.data.visitor, null);
      assert.equal(identity.cookie, '');
      assert.equal((await req(root + '/services')).status, 200);
      assert.equal((await req(root + '/site')).data.hours.days.length, 7);
      for (const path of ['/appointments', '/appointments/guest'])
        assert.equal((await req(root + path, { cookie: owner.cookie, body: {} })).status, 401);
      assert.equal((await req(root + '/appointments', { cookie: owner.cookie })).status, 401);
      assert.equal(
        (await req('/auth/me?scope=gradefy', { cookie: owner.cookie })).data.user.id,
        'minisite-owner',
      );
    },
  );
  await t.test(
    'registration validates contact, password confirmation, duplicate email and forbidden roles; issues no administrative cookie',
    async () => {
      const input = {
        name: 'Cliente Mini Site',
        email: 'customer-alpha@example.test',
        phone: '21999997777',
        password,
        confirmPassword: password,
      };
      assert.equal(
        (await req(root + '/auth/register', { body: { ...input, confirmPassword: 'different' } }))
          .status,
        400,
      );
      assert.equal(
        (await req(root + '/auth/register', { body: { ...input, role: 'admin' } })).status,
        400,
      );
      customer = await req(root + '/auth/register', { body: input });
      assert.equal(customer.status, 201);
      assert.equal(customer.data.user.role, 'client');
      assert.match(customer.cookie, /^gradefy-client=/);
      assert.doesNotMatch(customer.cookie, /(?:^|; )session=/);
      assert.ok(
        customer.cookies.every((c) => c.includes('HttpOnly') && c.includes('SameSite=Lax')),
      );
      assert.equal((await req(root + '/auth/register', { body: input })).status, 409);
      assert.equal((await req('/companies', { cookie: customer.cookie })).status, 401);
      assert.equal(
        (
          await req('/admin/appointments', {
            cookie: customer.cookie,
            headers: { 'X-Gradefy-Company-Id': 'minisite-browser' },
          })
        ).status,
        401,
      );
      assert.equal(
        Number(
          (
            await db.get('SELECT COUNT(*) AS n FROM company_members WHERE user_id=?', [
              customer.data.user.id,
            ])
          ).n,
        ),
        0,
      );
      other = await req(root + '/auth/register', {
        body: { ...input, name: 'Outra Pessoa', email: 'other-alpha@example.test' },
      });
      assert.equal(other.status, 201);
    },
  );
  await t.test(
    'same owner explicitly logs in as client without changing panel cookie; client logout preserves panel',
    async () => {
      const clientOwner = await req(root + '/auth/login', {
        cookie: owner.cookie,
        body: { email: 'minisite-owner@example.com', password },
      });
      assert.equal(clientOwner.status, 200);
      assert.equal(clientOwner.data.user.role, 'client');
      assert.equal((await req('/companies', { cookie: clientOwner.cookie })).status, 401);
      const combined = owner.cookie + '; ' + clientOwner.cookie;
      assert.equal(
        (await req(root + '/auth/me', { cookie: combined })).data.user.id,
        'minisite-owner',
      );
      assert.equal(
        (await req('/auth/me?scope=gradefy', { cookie: combined })).data.user.id,
        'minisite-owner',
      );
      const exit = await req(root + '/auth/logout', { cookie: combined, body: {} });
      assert.equal(exit.status, 200);
      assert.doesNotMatch(exit.cookie, /(?:^|; )session=/);
      assert.equal(
        (await req('/auth/me?scope=gradefy', { cookie: owner.cookie })).data.user.id,
        'minisite-owner',
      );
    },
  );
  await t.test(
    'audience substitution, expiry, invalid versions and public administrative/professional paths never grant access',
    async () => {
      assert.equal(
        (
          await req(root + '/auth/me', {
            cookie: owner.cookie.replace(/^session=/, 'gradefy-client='),
          })
        ).data.user,
        null,
      );
      assert.equal(
        (
          await req('/auth/me?scope=gradefy', {
            cookie: customer.cookie.replace(/^gradefy-client=/, 'session='),
          })
        ).data.user,
        null,
      );
      for (const payload of [{ version: 99 }, { version: 0, exp: 1 }]) {
        const token = jwt.sign(payload, secret, {
          subject: customer.data.user.id,
          issuer: 'igor-barber-club',
          audience: 'gradefy-client',
        });
        assert.equal(
          (await req(root + '/auth/me', { cookie: 'gradefy-client=' + token })).data.user,
          null,
        );
      }
      for (const path of ['/admin/appointments', '/professional/agenda', '/auth/test-access'])
        assert.equal((await req(root + path, { cookie: customer.cookie })).status, 404);
      assert.equal(
        (
          await req(root + '/auth/login', {
            body: { email: 'customer-alpha@example.test', password: 'wrong' },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await req(root + '/auth/logout', {
            cookie: customer.cookie,
            body: {},
            headers: { Origin: 'https://untrusted.invalid' },
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    'real reservation preserves price, duration, professional and tenant; only its customer may read, reschedule or cancel',
    async () => {
      const schedule = await req(root + '/barbers/minisite-person/schedule');
      const date = schedule.data.dates.find(
        (d) => d > new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      );
      const available = await req(
        root + `/availability?date=${date}&barberId=minisite-person&services=minisite-service`,
      );
      const body = {
        barberId: 'minisite-person',
        services: ['minisite-service'],
        date,
        time: available.data.slots[0],
        expectedTotal: 3500,
        expectedDuration: 40,
      };
      assert.equal(
        (
          await req(root + '/appointments', {
            cookie: customer.cookie,
            body: { ...body, expectedTotal: 1 },
          })
        ).status,
        412,
      );
      const saved = await req(root + '/appointments', {
        cookie: customer.cookie,
        body,
        headers: { 'Idempotency-Key': 'client-repeated-booking-key' },
      });
      assert.equal(saved.status, 201, JSON.stringify(saved.data));
      booking = saved.data;
      assert.equal(booking.user_id, customer.data.user.id);
      assert.equal(booking.company_id, 'minisite-browser');
      assert.equal(booking.total, 3500);
      assert.equal(booking.end_minute - booking.start_minute, 40);
      assert.equal(
        (
          await req(root + '/appointments', {
            cookie: customer.cookie,
            body,
            headers: { 'Idempotency-Key': 'client-repeated-booking-key' },
          })
        ).data.id,
        booking.id,
      );
      assert.equal((await req(root + '/appointments', { cookie: other.cookie, body })).status, 409);
      assert.deepEqual((await req(root + '/appointments', { cookie: other.cookie })).data, []);
      assert.equal(
        (
          await req(root + '/appointments/' + booking.id + '/cancel', {
            cookie: other.cookie,
            method: 'PATCH',
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req(root + '/appointments/' + booking.id + '/reschedule', {
            cookie: other.cookie,
            method: 'PATCH',
            body: { ...body, time: available.data.slots[1] },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await req(root + '/appointments/' + booking.id + '/reschedule', {
            cookie: customer.cookie,
            method: 'PATCH',
            body: { ...body, time: available.data.slots[1] },
          })
        ).status,
        200,
      );
      assert.equal((await req('/appointments', { cookie: customer.cookie })).status, 401);
      assert.equal(
        (
          await req(root + '/appointments/' + booking.id + '/cancel', {
            cookie: customer.cookie,
            method: 'PATCH',
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    'recovery retains trusted company/destination, rejects other contexts and never clears the unrelated panel session',
    async () => {
      const keys = ['RESEND_API_KEY', 'EMAIL_FROM', 'APP_URL'];
      const before = keys.map((k) => process.env[k]);
      const originalFetch = globalThis.fetch;
      const sent = [];
      try {
        process.env.RESEND_API_KEY = 'test-only';
        process.env.EMAIL_FROM = 'Test <test@example.test>';
        process.env.APP_URL = 'http://127.0.0.1:5173';
        await authorizeMockEmail(t, db);
        globalThis.fetch = async (url, options) =>
          String(url) === 'https://api.resend.com/emails'
            ? (sent.push(JSON.parse(options.body)), new Response('{}', { status: 200 }))
            : originalFetch(url, options);
        assert.equal(
          (
            await req(root + '/auth/forgot-password', {
              body: {
                email: 'customer-alpha@example.test',
                destination: 'https://untrusted.invalid',
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await req(root + '/auth/forgot-password', {
              body: { email: 'customer-alpha@example.test', destination: 'reservas' },
            })
          ).status,
          202,
        );
        await app.locals.processPasswordEmails();
        assert.equal(sent.length, 1);
        assert.match(sent[0].subject, /Gradefy/);
        assert.match(sent[0].text, /Barbearia Horizonte/);
        assert.doesNotMatch(sent[0].text, /Igor Barber Club/);
        const job = await db.get(
          "SELECT * FROM password_recovery WHERE user_id=? AND event='reset'",
          [customer.data.user.id],
        );
        const token = createHmac('sha256', secret)
          .update('password-recovery:' + job.id)
          .digest('hex');
        const url = new URL(sent[0].text.match(/http[^\s]+/)[0]);
        assert.equal(url.pathname, '/minisite-browser/redefinir-senha');
        assert.equal(url.searchParams.get('destino'), 'reservas');
        assert.equal(new URLSearchParams(url.hash.slice(1)).get('token'), token);
        const body = {
          token,
          password: 'NovaSenhaCliente2026!',
          confirmPassword: 'NovaSenhaCliente2026!',
        };
        assert.equal((await req('/auth/reset-password', { body })).status, 400);
        assert.equal(
          (await req('/public/other-mini-auth/auth/reset-password', { body })).status,
          400,
        );
        const changed = await req(root + '/auth/reset-password', {
          cookie: owner.cookie + '; ' + customer.cookie,
          body,
        });
        assert.equal(changed.status, 200);
        assert.doesNotMatch(changed.cookie, /(?:^|; )session=/);
        assert.equal((await req(root + '/auth/reset-password', { body })).status, 400);
        assert.equal((await req(root + '/auth/me', { cookie: customer.cookie })).data.user, null);
        assert.equal(
          (await req('/auth/me?scope=gradefy', { cookie: owner.cookie })).data.user.id,
          'minisite-owner',
        );
        assert.equal(
          (
            await req(root + '/auth/login', {
              body: { email: 'customer-alpha@example.test', password: body.password },
            })
          ).status,
          200,
        );
      } finally {
        globalThis.fetch = originalFetch;
        keys.forEach((k, i) =>
          before[i] === undefined ? delete process.env[k] : (process.env[k] = before[i]),
        );
      }
    },
  );
});
