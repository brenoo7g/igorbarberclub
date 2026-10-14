import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { invitationToken } from '../../server/invitation-code.js';
import { IGOR_COMPANY_ID } from '../../server/company-bootstrap.js';

export async function assertTeamCodes(t, db, second = db) {
  await seed(db);
  const stamp = new Date().toISOString(),
    secret = 'code-disposable-fixture';
  for (const id of ['owner', 'guest', 'other'])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','fixture','client',?)",
      ['code-' + id, id, id + '-code@example.test', stamp],
    );
  for (const cid of ['code-a', 'code-b']) {
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',?,?)",
      [cid, cid, cid, stamp, stamp],
    );
    await db.run(
      "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,'code-owner','owner',?)",
      [cid, stamp],
    );
  }
  await db.run(
    "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('code-b','code-guest','manager',?)",
    [stamp],
  );
  const original = {};
  for (const table of ['plans', 'subscriptions', 'barbers', 'appointments', 'company_settings'])
    original[table] = await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2');
  const sent = [];
  const email = {
    configured: () => true,
    send: async (payload) => {
      sent.push(payload);
      return { ok: true };
    },
  };
  let fail = false;
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (fail && sql.startsWith('INSERT INTO company_access_events')) {
                fail = false;
                throw Object.assign(new Error('injected code acceptance failure'), { status: 503 });
              }
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((connection, i) =>
    createApp(connection, {
      secret,
      test: true,
      serveStatic: false,
      siteStorage: null,
      invitationEmail: i === 1 ? { configured: () => false } : email,
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const server of servers) await new Promise((done) => server.close(done));
  });
  const cookie = (id) =>
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: 'code-' + id,
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  async function req(
    path,
    { method = 'POST', body, user = 'owner', cid = 'code-a', instance = 0, session } = {},
  ) {
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Gradefy-Company-Id': cid,
          ...(session || user ? { Cookie: session || cookie(user) } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return {
      status: response.status,
      data: await response.json(),
      session: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const create = (address, opts = {}) =>
    req('/admin/team/invitations', { body: { email: address, role: 'professional' }, ...opts });
  const token = (invite) =>
    new URLSearchParams(new URL(invite.data.link).hash.slice(1)).get('token');
  const inspect = (invite, opts = {}) =>
    req('/team/invitations/inspect', { body: { code: invite.data.code }, user: null, ...opts });
  const accept = (invite, opts = {}) =>
    req('/team/invitations/accept', { body: { code: invite.data.code }, user: 'guest', ...opts });

  await t.test(
    'same 256-bit secret, hash-only persistence, seven days, normalized code and provider/manual sharing',
    async () => {
      const invite = await create('representation-code@example.test');
      assert.equal(invite.status, 201);
      assert.match(invite.data.code, /^(?:[0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/);
      assert.equal(invitationToken(invite.data.code), token(invite));
      assert.equal(invite.data.companyName, 'code-a');
      const row = await db.get('SELECT * FROM company_invitations WHERE id=?', [
        invite.data.invitation.id,
      ]);
      assert.equal(new Date(row.expires_at) - new Date(row.created_at), 7 * 86400000);
      assert.equal(JSON.stringify(row).includes(invite.data.code), false);
      assert.equal(JSON.stringify(row).includes(token(invite)), false);
      assert.ok(sent.at(-1).text.includes(invite.data.code));
      assert.ok(sent.at(-1).text.includes(invite.data.link));
      const normalized = await inspect(invite, {
        body: { code: invite.data.code.toLowerCase().replaceAll('-', ' \n') },
      });
      assert.equal(normalized.status, 200);
      assert.equal(normalized.data.companyName, 'code-a');
      assert.equal(normalized.data.role, 'professional');
      const listed = await req('/admin/team', { method: 'GET' });
      assert.equal(JSON.stringify(listed.data).includes(invite.data.code), false);
      assert.equal(JSON.stringify(listed.data).includes(token(invite)), false);
      const manual = await create('manual-code@example.test', { instance: 1 });
      assert.equal(manual.data.invitation.delivery, 'manual');
      assert.ok(manual.data.code && manual.data.link);
    },
  );
  await t.test(
    'invalid, expired, cancelled and unknown codes share unavailable response',
    async () => {
      const expired = await create('expired-code@example.test');
      await db.run('UPDATE company_invitations SET created_at=?,expires_at=? WHERE id=?', [
        '2000-01-01T00:00:00.000Z',
        '2000-01-08T00:00:00.000Z',
        expired.data.invitation.id,
      ]);
      const cancelled = await create('cancelled-code@example.test');
      assert.equal(
        (
          await req(`/admin/team/invitations/${cancelled.data.invitation.id}/cancel`, {
            body: { confirm: true },
          })
        ).status,
        200,
      );
      const answers = await Promise.all([
        inspect(expired),
        inspect(cancelled),
        req('/team/invitations/inspect', { user: null, body: { code: 'invalid' } }),
        req('/team/invitations/inspect', { user: null, body: { code: '0'.repeat(52) } }),
      ]);
      for (const answer of answers) {
        assert.equal(answer.status, 410);
        assert.deepEqual(answer.data, answers[0].data);
      }
    },
  );
  await t.test(
    'renewal invalidates code and link together, without changing invitation identity',
    async () => {
      const old = await create('renew-code@example.test');
      const fresh = await req(`/admin/team/invitations/${old.data.invitation.id}/renew`, {
        body: { confirm: true },
      });
      assert.equal(fresh.status, 200);
      assert.equal(fresh.data.invitation.id, old.data.invitation.id);
      assert.notEqual(fresh.data.code, old.data.code);
      assert.equal((await inspect(old)).status, 410);
      assert.equal((await inspect(old, { body: { token: token(old) } })).status, 410);
      assert.equal((await inspect(fresh)).status, 200);
    },
  );
  await t.test(
    'email identity and strict payload defeat frontend company, role and email spoofing',
    async () => {
      const invite = await create('guest-code@example.test');
      assert.equal((await accept(invite, { user: null })).status, 401);
      assert.equal((await accept(invite, { user: 'other' })).status, 403);
      assert.equal(
        (
          await accept(invite, {
            body: {
              code: invite.data.code,
              role: 'owner',
              companyId: 'code-b',
              email: 'other-code@example.test',
            },
          })
        ).status,
        400,
      );
      assert.equal(
        await db.get(
          "SELECT * FROM company_members WHERE company_id='code-a' AND user_id='code-guest'",
        ),
        undefined,
      );
      assert.equal((await inspect(invite)).status, 200);
    },
  );
  await t.test(
    'failed acceptance rolls back membership, audit and credential; successful code consumes old link',
    async () => {
      const invite = await req('/admin/team', { method: 'GET' });
      const row = invite.data.invitations.find((i) => i.email === 'guest-code@example.test');
      const fresh = await req(`/admin/team/invitations/${row.id}/renew`, {
        body: { confirm: true },
      });
      fail = true;
      assert.equal((await accept(fresh, { instance: 2 })).status, 503);
      assert.equal((await inspect(fresh)).status, 200);
      assert.equal(
        await db.get(
          "SELECT * FROM company_members WHERE company_id='code-a' AND user_id='code-guest'",
        ),
        undefined,
      );
      assert.equal((await accept(fresh)).status, 200);
      assert.equal((await inspect(fresh, { body: { token: token(fresh) } })).status, 410);
      assert.equal((await accept(fresh)).status, 410);
      const memberships = await db.all(
        "SELECT company_id,role,status FROM company_members WHERE user_id='code-guest' ORDER BY company_id",
      );
      assert.deepEqual(
        memberships.map((m) => ({ ...m })),
        [
          { company_id: 'code-a', role: 'professional', status: 'active' },
          { company_id: 'code-b', role: 'manager', status: 'active' },
        ],
      );
      assert.equal((await req('/admin/finance', { method: 'GET', user: 'guest' })).status, 403);
      assert.equal((await req('/admin/reports', { method: 'GET', user: 'guest' })).status, 403);
      assert.equal(
        (await req('/admin/team', { method: 'GET', user: 'guest', cid: IGOR_COMPANY_ID })).status,
        403,
      );
      assert.equal(
        (
          await req('/admin/team/members/code-guest/revoke', {
            body: { expectedRole: 'professional', expectedStatus: 'active', confirm: true },
          })
        ).status,
        200,
      );
      assert.equal((await req('/companies', { method: 'GET', user: 'guest' })).data.length, 1);
    },
  );
  await t.test(
    'new global registration grants no company/plan/trial; legacy link consumes code',
    async () => {
      const invite = await create('new-code@example.test');
      const account = await req('/auth/register', {
        user: null,
        body: {
          scope: 'gradefy',
          name: 'New Colleague',
          email: 'new-code@example.test',
          password: 'ClienteTeste2026!',
          confirmPassword: 'ClienteTeste2026!',
        },
      });
      assert.equal(account.status, 201);
      assert.deepEqual(
        (await req('/companies', { method: 'GET', user: null, session: account.session })).data,
        [],
      );
      assert.equal(
        (
          await accept(invite, {
            user: null,
            session: account.session,
            body: { token: token(invite) },
          })
        ).status,
        200,
      );
      assert.equal((await inspect(invite)).status, 410);
    },
  );
  await t.test(
    'concurrent link/code accept across connections creates exactly one membership and audit',
    async () => {
      const invite = await create('other-code@example.test');
      const results = await Promise.all([
        accept(invite, { user: 'other' }),
        accept(invite, { user: 'other', instance: 1, body: { token: token(invite) } }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 410]);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_members WHERE user_id='code-other' AND company_id='code-a'",
            )
          ).n,
        ),
        1,
      );
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_access_events WHERE invitation_id=? AND action='invite-accepted'",
              [invite.data.invitation.id],
            )
          ).n,
        ),
        1,
      );
    },
  );
  await t.test('plan catalog, Igor, agenda and subscriptions remain untouched', async () => {
    for (const [table, rows] of Object.entries(original))
      assert.deepEqual(await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2'), rows);
    assert.ok(await db.get('SELECT id FROM companies WHERE id=?', [IGOR_COMPANY_ID]));
    assert.equal(
      (await req('/services', { user: null, method: 'GET', cid: IGOR_COMPANY_ID })).status,
      200,
    );
  });
  await t.test(
    'guessing codes consumes the existing persistent budget across application instances',
    async () => {
      await db.run('DELETE FROM company_invitation_limits');
      for (let i = 0; i < 60; i++)
        assert.equal(
          (
            await req('/team/invitations/inspect', {
              user: null,
              body: { code: '0'.repeat(52) },
              instance: i % 2,
            })
          ).status,
          410,
        );
      const blocked = await req('/team/invitations/inspect', {
        user: null,
        body: { code: '0'.repeat(52) },
        instance: 1,
      });
      assert.equal(blocked.status, 429);
    },
  );
}
