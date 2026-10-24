import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { migrations, readMigration, runMigrations } from '../../server/migrations.js';
import { reconstructBeforeTeam, teamTables } from './team-migration.js';

export async function assertTeamMigration(t, db) {
  await seed(db);
  const snapshot = {};
  for (const table of [
    'companies',
    'company_members',
    'users',
    'subscriptions',
    'plans',
    'barbers',
    'appointments',
    'appointment_services',
    'financial_payments',
    'financial_expenses',
  ])
    snapshot[table] = await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2');
  await reconstructBeforeTeam(db);
  const journal = await db.all('SELECT * FROM schema_migrations ORDER BY version');
  const broken = {
    transaction: (fn) =>
      db.transaction((tx) =>
        fn({
          ...tx,
          run: (sql, args) => {
            if (sql.startsWith('CREATE TABLE company_invitation_limits'))
              throw new Error('injected team migration failure');
            return tx.run(sql, args);
          },
        }),
      ),
  };
  await assert.rejects(runMigrations(broken), /injected team migration failure/);
  for (const table of teamTables) await assert.rejects(db.all('SELECT * FROM ' + table));
  assert.deepEqual(await db.all('SELECT * FROM schema_migrations ORDER BY version'), journal);
  assert.deepEqual(await runMigrations(db), [15, 16, 17, 18, 19, 20, 21, 22]);
  assert.deepEqual(await runMigrations(db), []);
  for (const [table, records] of Object.entries(snapshot))
    assert.deepEqual(await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2'), records);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<15 ORDER BY version'),
    journal,
  );
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=15', ['0'.repeat(64)]);
  await assert.rejects(runMigrations(db), /Hist/);
  await db.run('UPDATE schema_migrations SET checksum=? WHERE version=15', [
    readMigration(migrations[14]).checksum,
  ]);
  await assert.rejects(
    db.run(
      "INSERT INTO company_invitation_limits(bucket_key,window_start,attempts) VALUES(NULL,'2026',1)",
    ),
  );
  await assert.rejects(
    db.run(
      "INSERT INTO company_invitation_limits(bucket_key,window_start,attempts) VALUES(?,'2026',?)",
      ['0'.repeat(64), 1.5],
    ),
  );
  t.diagnostic(
    '015: additive, repeated, atomic rollback, immutable old checksums and legacy data preservation',
  );
}
export async function assertTeam(t, db, second = db) {
  const stamp = new Date().toISOString(),
    secret = 'team-disposable-test-secret';
  for (const id of ['owner', 'manager', 'existing', 'outsider', 'linked', 'co-owner'])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,?,?,'','fixture','client',?)",
      ['team-' + id, id, id + '-team@example.test', stamp],
    );
  for (const [cid, plan] of [
    ['team-a', 'individual'],
    ['team-b', 'team'],
  ]) {
    await db.run(
      "INSERT INTO companies(id,slug,name,niche_id,template_id,created_at,updated_at) VALUES(?,?,?,'barbershop','barber-classic',?,?)",
      [cid, cid, cid, stamp, stamp],
    );
    await db.run('INSERT INTO company_settings(company_id,updated_at) VALUES(?,?)', [cid, stamp]);
    await db.run(
      "INSERT INTO subscriptions(id,company_id,plan_id,status,source,created_at,updated_at) VALUES(?,?,?,'active','manual',?,?)",
      [cid + '-sub', cid, plan, stamp, stamp],
    );
  }
  for (const [cid, id, role] of [
    ['team-a', 'owner', 'owner'],
    ['team-a', 'manager', 'manager'],
    ['team-b', 'manager', 'owner'],
    ['team-a', 'linked', 'manager'],
  ])
    await db.run(
      'INSERT INTO company_members(company_id,user_id,role,created_at) VALUES(?,?,?,?)',
      [cid, 'team-' + id, role, stamp],
    );
  await db.run(
    "INSERT INTO barbers(company_id,id,name,specialty) VALUES('team-a','linked-pro','Linked','Tests'),('team-a','no-login','No login','Tests')",
  );
  await db.run(
    "INSERT INTO professional_users(company_id,barber_id,user_id,created_at) VALUES('team-a','linked-pro','team-linked',?)",
    [stamp],
  );
  const preserved = {};
  for (const table of [
    'subscriptions',
    'plans',
    'barbers',
    'professional_users',
    'appointments',
    'financial_payments',
    'financial_expenses',
  ])
    preserved[table] = await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2');
  let fail = '',
    delivered = [],
    deliveryFails = false;
  const email = {
    configured: () => true,
    send: async (payload) => {
      delivered.push(payload);
      return { ok: !deliveryFails };
    },
  };
  const broken = {
    ...db,
    transaction: (fn, options) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (fail && sql.startsWith(fail)) {
                fail = '';
                throw Object.assign(new Error('injected team rollback'), { status: 503 });
              }
              return tx.run(sql, args);
            },
          }),
        options,
      ),
  };
  const servers = [db, second, broken].map((connection) =>
    createApp(connection, {
      secret,
      test: true,
      serveStatic: false,
      siteStorage: null,
      invitationEmail: email,
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(async () => {
    for (const s of servers) await new Promise((done) => s.close(done));
  });
  const cookie = (id) =>
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: 'team-' + id,
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  async function req(
    path,
    { cid = 'team-a', user = 'owner', method = 'GET', body, instance = 0, session } = {},
  ) {
    const r = await fetch('http://127.0.0.1:' + servers[instance].address().port + '/api' + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cid ? { 'X-Gradefy-Company-Id': cid } : {}),
        ...(session || user ? { Cookie: session || cookie(user) } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      data: await r.json(),
      session: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const root = '/admin/team';
  const token = (result) =>
    new URLSearchParams(new URL(result.data.link).hash.slice(1)).get('token');
  const create = (email, options = {}) =>
    req(root + '/invitations', { method: 'POST', body: { email, role: 'manager' }, ...options });
  const accept = (invitation, options = {}) =>
    req('/team/invitations/accept', {
      method: 'POST',
      body: { token: token(invitation) },
      ...options,
    });
  const inspect = (invitation, options = {}) =>
    req('/team/invitations/inspect', {
      user: null,
      cid: null,
      method: 'POST',
      body: { token: token(invitation) },
      ...options,
    });
  const mutate = (id, action, options = {}) =>
    req(root + '/members/team-' + id + '/' + action, {
      method: action === 'role' ? 'PATCH' : 'POST',
      body: {
        expectedRole: 'manager',
        expectedStatus: 'active',
        confirm: true,
        ...(action === 'role' ? { role: 'professional' } : {}),
      },
      ...options,
    });
  await t.test(
    'owner sees only its own company; managers, outsiders and anonymous users cannot manage team',
    async () => {
      const list = await req(root);
      assert.equal(list.status, 200);
      assert.equal(list.data.members.length, 3);
      assert.equal((await req(root, { user: 'manager' })).status, 403);
      assert.equal((await req(root, { user: 'outsider' })).status, 403);
      assert.equal((await req(root, { user: null })).status, 401);
      assert.equal((await req(root, { cid: 'team-b' })).status, 403);
      assert.equal((await create('unauthorized@example.test', { user: 'manager' })).status, 403);
      assert.equal((await create('unauthorized@example.test', { user: null })).status, 401);
      assert.equal((await req('/public/team-a/admin/team', { user: null })).status, 404);
    },
  );
  await t.test(
    'secure invitation hashes, recipient normalization and no automatic professional or subscription',
    async () => {
      const result = await create(' EXISTING-team@example.test ');
      assert.equal(result.status, 201);
      assert.equal(result.data.invitation.email, 'existing-team@example.test');
      assert.equal(result.data.invitation.delivery, 'sent');
      assert.equal(new URL(result.data.link).search, '');
      assert.match(token(result), /^[a-f0-9]{64}$/);
      const row = await db.get('SELECT * FROM company_invitations WHERE id=?', [
        result.data.invitation.id,
      ]);
      assert.equal(row.token_hash, createHash('sha256').update(token(result)).digest('hex'));
      assert.equal(Date.parse(row.expires_at) - Date.parse(row.created_at), 7 * 86400000);
      assert.ok(delivered.at(-1).text.includes(result.data.link));
      assert.equal(JSON.stringify((await req(root)).data).includes(token(result)), false);
      assert.equal((await inspect(result)).status, 200);
      assert.equal((await inspect(result)).data.email, undefined);
      assert.equal(
        (await accept(result, { user: 'outsider' })).data.code,
        'INVITATION_EMAIL_MISMATCH',
      );
      assert.equal((await accept(result, { user: null })).status, 401);
      const accepted = await accept(result, { user: 'existing' });
      assert.equal(accepted.status, 200);
      assert.equal(accepted.data.companyId, 'team-a');
      assert.equal((await accept(result, { user: 'existing' })).status, 410);
      assert.equal((await inspect(result)).status, 410);
      assert.equal((await req('/admin/reports', { user: 'existing' })).status, 200);
      assert.equal((await req(root, { user: 'existing' })).status, 403);
      assert.equal(
        (await db.get('SELECT token_hash FROM company_invitations WHERE id=?', [row.id]))
          .token_hash,
        null,
      );
    },
  );
  await t.test(
    'existing member, duplicate email and attempted owner invitation are rejected',
    async () => {
      assert.equal((await create('manager-team@example.test')).data.code, 'MEMBER_ALREADY_EXISTS');
      const first = await create('duplicate@example.test');
      assert.equal(first.status, 201);
      assert.equal(
        (await create('DUPLICATE@example.test')).data.code,
        'INVITATION_ALREADY_PENDING',
      );
      assert.equal(
        (
          await create('owner-invite@example.test', {
            body: { email: 'owner-invite@example.test', role: 'owner' },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'cancelled, expired, invalid tokens and renewal invalidate the old link',
    async () => {
      const first = await create('cancel@example.test');
      assert.equal(
        (
          await req(root + '/invitations/' + first.data.invitation.id + '/cancel', {
            method: 'POST',
            body: { confirm: true },
          })
        ).status,
        200,
      );
      assert.equal((await inspect(first)).status, 410);
      assert.equal(
        (
          await req(root + '/invitations/' + first.data.invitation.id + '/renew', {
            method: 'POST',
            body: { confirm: true },
          })
        ).status,
        409,
      );
      const expired = await create('expire@example.test');
      await db.run('UPDATE company_invitations SET created_at=?,expires_at=? WHERE id=?', [
        '2020-01-01T00:00:00.000Z',
        '2020-01-08T00:00:00.000Z',
        expired.data.invitation.id,
      ]);
      assert.equal((await inspect(expired)).status, 410);
      assert.equal((await accept(expired, { user: 'existing' })).status, 410);
      assert.equal(
        (await req(root)).data.invitations.find((i) => i.id === expired.data.invitation.id).status,
        'expired',
      );
      const renewed = await req(root + '/invitations/' + expired.data.invitation.id + '/renew', {
        method: 'POST',
        body: { confirm: true },
      });
      assert.equal(renewed.status, 200);
      assert.notEqual(token(renewed), token(expired));
      assert.equal((await inspect(expired)).status, 410);
      assert.equal((await inspect(renewed)).status, 200);
      assert.equal(
        (
          await req('/team/invitations/inspect', {
            method: 'POST',
            user: null,
            body: { token: 'f'.repeat(64) },
          })
        ).status,
        410,
      );
      assert.equal(
        (
          await req('/team/invitations/inspect', {
            method: 'POST',
            user: null,
            body: { token: 'bad' },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    'new account uses existing registration/login and receives only the invited membership',
    async () => {
      const first = await create('new-team@example.test');
      const registered = await req('/auth/register', {
        user: null,
        method: 'POST',
        body: {
          scope: 'gradefy',
          name: 'Novo Convidado',
          email: 'new-team@example.test',
          password: 'ClienteTeste2026!',
          confirmPassword: 'ClienteTeste2026!',
        },
      });
      assert.equal(registered.status, 201);
      assert.ok(registered.session);
      assert.deepEqual(
        (await req('/companies', { user: null, session: registered.session })).data,
        [],
      );
      assert.equal((await accept(first, { user: null, session: registered.session })).status, 200);
      const companies = (await req('/companies', { user: null, session: registered.session })).data;
      assert.deepEqual(
        companies.map((c) => c.id),
        ['team-a'],
      );
      assert.equal(
        (
          await req('/auth/login', {
            user: null,
            method: 'POST',
            body: { email: 'new-team@example.test', password: 'ClienteTeste2026!' },
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    'expired invitation replaced by a new one cannot be renewed into a duplicate pending invite',
    async () => {
      await db.run('DELETE FROM company_invitation_limits');
      const old = await create('replaced-team@example.test');
      await db.run('UPDATE company_invitations SET created_at=?,expires_at=? WHERE id=?', [
        '2020-01-01T00:00:00.000Z',
        '2020-01-08T00:00:00.000Z',
        old.data.invitation.id,
      ]);
      const replacement = await create('replaced-team@example.test');
      assert.equal(replacement.status, 201);
      const renewed = await req(root + '/invitations/' + old.data.invitation.id + '/renew', {
        method: 'POST',
        body: { confirm: true },
      });
      assert.equal(renewed.status, 409);
      assert.equal(renewed.data.code, 'INVITATION_ALREADY_PENDING');
      assert.equal((await inspect(replacement)).status, 200);
      assert.equal((await inspect(old)).status, 410);
    },
  );
  await t.test(
    'concurrent duplicate invitations create exactly one; concurrent accepts consume only once',
    async () => {
      const pair = await Promise.all([
        create('race-team@example.test'),
        create('race-team@example.test', { instance: 1 }),
      ]);
      assert.deepEqual(pair.map((p) => p.status).sort(), [201, 409]);
      const result = pair.find((p) => p.status === 201);
      await db.run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('team-race','Race','race-team@example.test','','fixture','client',?)",
        [stamp],
      );
      const accepted = await Promise.all([
        accept(result, { user: 'race' }),
        accept(result, { user: 'race', instance: 1 }),
      ]);
      assert.deepEqual(accepted.map((p) => p.status).sort(), [200, 410]);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_members WHERE company_id='team-a' AND user_id='team-race'",
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
              [result.data.invitation.id],
            )
          ).n,
        ),
        1,
      );
    },
  );
  await t.test(
    'invitation IDs cannot cross companies and the same person can have independent memberships',
    async () => {
      const first = await create('outsider-team@example.test');
      assert.equal(
        (
          await req(root + '/invitations/' + first.data.invitation.id + '/cancel', {
            cid: 'team-b',
            user: 'manager',
            method: 'POST',
            body: { confirm: true },
          })
        ).status,
        404,
      );
      const another = await create('outsider-team@example.test', {
        cid: 'team-b',
        user: 'manager',
      });
      assert.equal(another.status, 201);
      assert.equal(
        (await accept(first, { user: 'outsider', cid: 'team-b' })).data.companyId,
        'team-a',
      );
      assert.equal(
        (await accept(another, { user: 'outsider', cid: 'team-a' })).data.companyId,
        'team-b',
      );
      assert.deepEqual(
        (await req('/companies', { user: 'outsider' })).data.map((c) => c.id),
        ['team-a', 'team-b'],
      );
      assert.equal((await req(root, { cid: 'team-b', user: 'manager' })).status, 200);
      assert.equal((await req(root, { cid: 'team-a', user: 'manager' })).status, 403);
      assert.equal((await mutate('outsider', 'revoke')).status, 200);
      assert.equal((await req('/admin/reports', { user: 'outsider' })).status, 403);
      assert.equal((await req('/admin/reports', { cid: 'team-b', user: 'outsider' })).status, 200);
    },
  );
  await t.test(
    'role changes immediately affect old sessions; optimistic state and explicit confirmation required',
    async () => {
      assert.equal(
        (
          await mutate('existing', 'role', {
            body: {
              role: 'owner',
              expectedRole: 'manager',
              expectedStatus: 'active',
              confirm: true,
            },
          })
        ).status,
        400,
      );
      assert.equal((await mutate('existing', 'revoke', { user: 'manager' })).status, 403);
      assert.equal(
        (
          await mutate('existing', 'revoke', {
            body: { expectedRole: 'manager', expectedStatus: 'active' },
          })
        ).status,
        400,
      );
      assert.equal((await mutate('existing', 'role')).status, 200);
      assert.equal((await req('/admin/finance', { user: 'existing' })).status, 403);
      assert.equal((await req('/admin/reports', { user: 'existing' })).status, 403);
      assert.equal((await mutate('existing', 'revoke')).data.code, 'MEMBER_CHANGED');
      assert.equal(
        (
          await mutate('existing', 'role', {
            body: {
              role: 'manager',
              expectedRole: 'professional',
              expectedStatus: 'active',
              confirm: true,
            },
          })
        ).status,
        200,
      );
      assert.equal((await req('/admin/finance', { user: 'existing' })).status, 200);
    },
  );
  await t.test(
    'last and additional owners are immutable; owner self-revocation and foreign membership mutation denied',
    async () => {
      const own = await mutate('owner', 'revoke');
      assert.equal(own.data.code, 'OWNER_PROTECTED');
      await db.run(
        "INSERT INTO company_members(company_id,user_id,role,created_at) VALUES('team-a','team-co-owner','owner',?)",
        [stamp],
      );
      assert.equal((await mutate('co-owner', 'role')).data.code, 'OWNER_PROTECTED');
      assert.equal((await mutate('owner', 'revoke', { user: 'manager' })).status, 403);
      assert.equal(
        (await mutate('linked', 'revoke', { cid: 'team-b', user: 'manager' })).status,
        404,
      );
    },
  );
  await t.test(
    'revocation preserves account, professional, financial history and other memberships; reinvite is explicit',
    async () => {
      assert.equal((await mutate('linked', 'revoke')).status, 200);
      for (const path of [
        '/admin/agenda',
        '/admin/services',
        '/admin/finance',
        '/admin/reports',
        '/admin/team',
      ])
        assert.equal((await req(path, { user: 'linked' })).status, 403);
      assert.ok(await db.get("SELECT id FROM users WHERE id='team-linked'"));
      assert.ok(
        await db.get(
          "SELECT user_id FROM professional_users WHERE company_id='team-a' AND barber_id='linked-pro'",
        ),
      );
      const again = await create('linked-team@example.test');
      assert.equal((await accept(again, { user: 'linked' })).status, 200);
      assert.equal((await req('/admin/reports', { user: 'linked' })).status, 200);
    },
  );
  await t.test(
    'failed creation, acceptance and revocation rollback audit, token and membership together',
    async () => {
      const sentCount = delivered.length;
      fail = 'INSERT INTO company_access_events';
      assert.equal((await create('rollback-team@example.test', { instance: 2 })).status, 503);
      assert.equal(delivered.length, sentCount);
      assert.equal(
        await db.get("SELECT id FROM company_invitations WHERE email='rollback-team@example.test'"),
        undefined,
      );
      const first = await create('rollback-team@example.test');
      await db.run(
        "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES('team-rollback','Rollback','rollback-team@example.test','','fixture','client',?)",
        [stamp],
      );
      fail = 'INSERT INTO company_access_events';
      assert.equal((await accept(first, { user: 'rollback', instance: 2 })).status, 503);
      assert.equal(
        await db.get(
          "SELECT user_id FROM company_members WHERE company_id='team-a' AND user_id='team-rollback'",
        ),
        undefined,
      );
      assert.equal((await inspect(first)).status, 200);
      assert.equal((await accept(first, { user: 'rollback' })).status, 200);
      fail = 'INSERT INTO company_access_events';
      assert.equal((await mutate('rollback', 'revoke', { instance: 2 })).status, 503);
      assert.equal((await req('/admin/reports', { user: 'rollback' })).status, 200);
    },
  );
  await t.test(
    'email failures provide a working manual link, never claim sent; required identifiers/FKs protected',
    async () => {
      deliveryFails = true;
      const result = await create('delivery-team@example.test');
      assert.equal(result.data.invitation.delivery, 'failed');
      assert.equal((await inspect(result)).status, 200);
      deliveryFails = false;
      const row = await db.get('SELECT * FROM company_invitations WHERE id=?', [
        result.data.invitation.id,
      ]);
      const fields = Object.keys(row),
        values = Object.values(row),
        idIndex = fields.indexOf('id'),
        companyIndex = fields.indexOf('company_id');
      values[fields.indexOf('token_hash')] = createHash('sha256')
        .update('null-id-invitation')
        .digest('hex');
      values[fields.indexOf('email')] = 'integrity-only@example.test';
      values[idIndex] = null;
      await assert.rejects(
        db.run(
          `INSERT INTO company_invitations(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`,
          values,
        ),
        /not.null/i,
      );
      values[idIndex] = 'invalid-company-invite';
      values[companyIndex] = 'missing-company';
      values[fields.indexOf('token_hash')] = 'd'.repeat(64);
      await assert.rejects(
        db.run(
          `INSERT INTO company_invitations(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`,
          values,
        ),
      );
      await assert.rejects(
        db.run(
          'INSERT INTO company_access_events(id,company_id,actor_user_id,action,created_at) VALUES(NULL,?,?,?,?)',
          ['team-a', 'team-owner', 'access-revoked', stamp],
        ),
      );
      await assert.rejects(
        db.run(
          'INSERT INTO company_access_events(id,company_id,actor_user_id,invitation_id,action,created_at) VALUES(?,?,?,?,?,?)',
          ['cross-company-audit', 'team-b', 'team-owner', row.id, 'invite-created', stamp],
        ),
      );
    },
  );
  await t.test(
    'Individual has no invented administrative seat limit; prices, trial, subscriptions and legacy data unchanged',
    async () => {
      for (const [table, rows] of Object.entries(preserved))
        assert.deepEqual(await db.all('SELECT * FROM ' + table + ' ORDER BY 1,2'), rows);
      const prices = await db.all(
        "SELECT id,price_cents,trial_days,max_professionals FROM plans WHERE id IN ('individual','team') ORDER BY id",
      );
      assert.deepEqual(
        prices.map((p) => ({ ...p })),
        [
          { id: 'individual', price_cents: 2299, trial_days: 7, max_professionals: 1 },
          { id: 'team', price_cents: 3299, trial_days: 7, max_professionals: null },
        ],
      );
      assert.ok(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_members WHERE company_id='team-a' AND status='active'",
            )
          ).n,
        ) > 1,
      );
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM subscriptions WHERE company_id='igor-barber-club'",
            )
          ).n,
        ),
        0,
      );
      assert.equal((await req('/site', { user: null })).status, 200);
      const events = await db.all('SELECT * FROM company_access_events');
      assert.ok(events.every((e) => e.actor_user_id && Number.isFinite(Date.parse(e.created_at))));
      for (const action of [
        'invite-created',
        'invite-renewed',
        'invite-cancelled',
        'invite-accepted',
        'role-changed',
        'access-revoked',
      ])
        assert.ok(events.some((e) => e.action === action));
      assert.equal(JSON.stringify(events).includes('token'), false);
      await db.run("UPDATE companies SET status='suspended' WHERE id='team-a'");
      assert.equal((await req(root)).status, 403);
      await db.run("UPDATE companies SET status='active' WHERE id='team-a'");
    },
  );
  await t.test(
    'persistent token rate limits apply across server instances and count invalid attempts',
    async () => {
      await db.run('DELETE FROM company_invitation_limits');
      for (let i = 0; i < 60; i++)
        assert.equal(
          (
            await req('/team/invitations/inspect', {
              user: null,
              method: 'POST',
              body: { token: 'e'.repeat(64) },
              instance: i % 2,
            })
          ).status,
          410,
        );
      // Use a fresh app so the in-memory limiter cannot produce this result.
      const extra = createApp(second, { secret, test: true, serveStatic: false }).listen(
        0,
        '127.0.0.1',
      );
      await once(extra, 'listening');
      try {
        const r = await fetch(
          `http://127.0.0.1:${extra.address().port}/api/team/invitations/inspect`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: 'e'.repeat(64) }),
          },
        );
        assert.equal(r.status, 429);
        assert.equal((await r.json()).code, 'INVITATION_RATE_LIMIT');
      } finally {
        await new Promise((done) => extra.close(done));
      }
    },
  );
  await t.test(
    'persistent owner invitation rate limit cannot be reset by a second backend instance',
    async () => {
      await db.run('DELETE FROM company_invitation_limits');
      for (let i = 0; i < 20; i++)
        assert.equal((await create(`rate-${i}@example.test`, { instance: i % 2 })).status, 201);
      const blocked = await create('rate-overflow@example.test', { instance: 1 });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.data.code, 'INVITATION_RATE_LIMIT');
      assert.equal(
        await db.get("SELECT id FROM company_invitations WHERE email='rate-overflow@example.test'"),
        undefined,
      );
    },
  );
}
