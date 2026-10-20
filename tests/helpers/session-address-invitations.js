import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import { runMigrations, readMigration, migrations } from '../../server/migrations.js';
import { reconstructBeforeSessionAddress, addressColumns } from './session-address-migration.js';
import { installBusinessBrowserFixture } from './business-browser.js';

export async function assertSessionAddressMigration(t, db) {
  const original = await db.all('SELECT * FROM company_settings ORDER BY company_id');
  const journal = await db.all('SELECT * FROM schema_migrations WHERE version<18 ORDER BY version');
  await reconstructBeforeSessionAddress(db);
  await assert.rejects(
    runMigrations({
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (sql.startsWith('CREATE TABLE company_invitation_professionals'))
                throw Error('injected migration 018 failure');
              return tx.run(sql, args);
            },
          }),
        ),
    }),
    /injected/,
  );
  for (const c of addressColumns)
    await assert.rejects(db.get('SELECT ' + c + ' FROM company_settings'));
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=18'), undefined);
  assert.deepEqual(await runMigrations(db), [18, 19, 20, 21]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(await db.all('SELECT * FROM company_settings ORDER BY company_id'), original);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<18 ORDER BY version'),
    journal,
  );
  assert.equal(
    (await db.get('SELECT checksum FROM schema_migrations WHERE version=18')).checksum,
    readMigration(migrations[17]).checksum,
  );
  for (const code of ['1234567a', '123456789', '123-4567', '１２３４５６７８'])
    await assert.rejects(db.run('UPDATE company_settings SET postal_code=?', [code]));
  await assert.rejects(
    db.run(
      "INSERT INTO company_invitation_professionals(company_id,invitation_id,mode) VALUES(NULL,'missing','new')",
    ),
  );
  await assert.rejects(
    db.run(
      "INSERT INTO company_invitation_professionals(company_id,invitation_id,mode) VALUES('missing','missing','new')",
    ),
  );
  t.diagnostic(
    '018 additive, null defaults, transactional rollback, repeat, SQL integrity and immutable old checksums',
  );
}

export async function assertSessionAddressInvitations(t, db, second = db) {
  await seed(db);
  await installBusinessBrowserFixture(db, 'test-fixture');
  const secret = 'phase-3c1-disposable-secret-at-least-32';
  const owner = 'business-browser-owner',
    team = 'business-browser-team',
    individual = 'business-browser-one';
  for (const id of [
    'new',
    'existing',
    'manager',
    'cancel',
    'expired',
    'renew',
    'rollback',
    'cross',
    'other',
    'individual-a',
    'individual-b',
    'link-race-a',
    'link-race-b',
    'address-owner',
  ])
    await db.run(
      "INSERT INTO users(id,name,email,phone,password_hash,role,created_at) VALUES(?,? ,?,'21999999999','test','client','2026')",
      ['flow-' + id, id === 'new' ? 'Rafael Silva' : 'Pessoa ' + id, id + '@flow.test'],
    );
  const original = {};
  for (const table of [
    'companies',
    'company_settings',
    'barbers',
    'appointments',
    'appointment_services',
    'professional_users',
  ])
    original[table] = await db.all(
      'SELECT * FROM ' +
        table +
        ' WHERE ' +
        (table === 'companies' ? 'id' : 'company_id') +
        "='igor-barber-club' ORDER BY 1,2",
    );
  let brokenWrite = false,
    postalCalls = 0;
  const broken = {
    ...db,
    transaction: (fn, opts) =>
      db.transaction(
        (tx) =>
          fn({
            ...tx,
            run: (sql, args) => {
              if (brokenWrite && sql.startsWith('INSERT INTO professional_activity_events'))
                throw Error('injected acceptance write failure');
              return tx.run(sql, args);
            },
          }),
        opts,
      ),
  };
  const servers = [db, second, broken].map((connection) =>
    createApp(connection, {
      test: true,
      secret,
      serveStatic: false,
      invitationEmail: { configured: () => false },
      postalLookup: async () => {
        postalCalls++;
        return { street: 'Praça da Sé', neighborhood: 'Sé', city: 'São Paulo', region: 'SP' };
      },
    }).listen(0, '127.0.0.1'),
  );
  await Promise.all(servers.map((s) => once(s, 'listening')));
  t.after(() => Promise.all(servers.map((s) => new Promise((done) => s.close(done)))));
  const cookie = (user) =>
    'session=' +
    jwt.sign({ version: 0 }, secret, {
      subject: user,
      issuer: 'igor-barber-club',
      audience: 'barber-web',
    });
  async function req(path, { method = 'GET', body, user = owner, cid = team, instance = 0 } = {}) {
    const response = await fetch(
      `http://127.0.0.1:${servers[instance].address().port}/api${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Gradefy-Company-Id': cid,
          ...(user ? { Cookie: cookie(user) } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: response.status, data: await response.json() };
  }
  const invite = (who, professional = { mode: 'new' }, cid = team, role = 'professional') =>
    req('/admin/team/invitations', {
      method: 'POST',
      cid,
      body: { email: who + '@flow.test', role, ...(professional ? { professional } : {}) },
    });
  const token = (invitation) =>
    new URLSearchParams(new URL(invitation.data.link).hash.slice(1)).get('token');
  const accept = (invitation, who, instance = 0) =>
    req('/team/invitations/accept', {
      method: 'POST',
      body: { token: token(invitation) },
      user: 'flow-' + who,
      instance,
    });
  const count = async (cid) =>
    Number((await db.get('SELECT COUNT(*) AS n FROM barbers WHERE company_id=?', [cid])).n);
  let newInvite, newId;
  await t.test(
    'CEP endpoint is authenticated, validates before lookup and returns only address fields',
    async () => {
      assert.equal((await req('/address/cep/01001000', { user: null })).status, 401);
      assert.equal((await req('/address/cep/123')).status, 400);
      assert.equal(postalCalls, 0);
      const result = await req('/address/cep/01001-000');
      assert.equal(result.status, 200);
      assert.equal(result.data.city, 'São Paulo');
      assert.equal(postalCalls, 1);
    },
  );
  await t.test(
    'structured/manual address persists with normalized CEP, full text, resume and backend validation',
    async () => {
      const body = {
        name: 'Espaço CEP',
        slug: 'espaco-cep',
        phone: '21999999999',
        city: 'São Paulo',
        region: 'SP',
        planCode: 'individual',
        nicheCode: 'barbershop',
        templateCode: 'barber-classic',
        postal_code: '01001-000',
        street: 'Praça da Sé',
        neighborhood: 'Sé',
        address_number: '12',
        address_complement: 'Sala 2',
      };
      for (const patch of [
        { postal_code: '12345abc' },
        { address_number: '' },
        { street: '' },
        { neighborhood: 'x'.repeat(101) },
        { region: 'XX' },
        { company_id: team },
      ])
        assert.equal(
          (
            await req('/onboarding/business', {
              method: 'POST',
              user: 'flow-address-owner',
              body: { ...body, ...patch },
            })
          ).status,
          400,
        );
      const result = await req('/onboarding/business', {
        method: 'POST',
        user: 'flow-address-owner',
        body,
      });
      assert.equal(result.status, 201);
      const id = result.data.company.id,
        settings = (await req('/onboarding/business', { user: 'flow-address-owner' })).data.company
          .settings;
      assert.equal(settings.postal_code, '01001000');
      assert.equal(settings.street, 'Praça da Sé');
      assert.match(settings.address, /12.*Sé.*Sala 2/);
      assert.equal(
        await db.get('SELECT id FROM subscriptions WHERE company_id=?', [id]),
        undefined,
      );
      assert.equal(
        (await db.get('SELECT site_published FROM companies WHERE id=?', [id])).site_published,
        0,
      );
    },
  );
  await t.test(
    'professional invite creates nothing on issue, then atomically creates an inactive closed draft by verified identity',
    async () => {
      const before = await count(team);
      newInvite = await invite('new');
      assert.equal(newInvite.status, 201);
      assert.equal(await count(team), before);
      assert.equal((await accept(newInvite, 'other')).status, 403);
      const result = await accept(newInvite, 'new');
      assert.equal(result.status, 200);
      newId = result.data.professionalId;
      assert.ok(newId);
      const p = await db.get('SELECT * FROM barbers WHERE company_id=? AND id=?', [team, newId]);
      assert.equal(p.active, 0);
      assert.equal(p.name, 'Rafael Silva');
      assert.equal(
        (
          await db.get(
            'SELECT barber_id FROM professional_users WHERE company_id=? AND user_id=?',
            [team, 'flow-new'],
          )
        ).barber_id,
        newId,
      );
      assert.equal(
        (
          await db.all('SELECT * FROM barber_services WHERE company_id=? AND barber_id=?', [
            team,
            newId,
          ])
        ).length,
        0,
      );
      const days = await db.all(
        'SELECT active FROM barber_working_hours WHERE company_id=? AND barber_id=?',
        [team, newId],
      );
      assert.equal(days.length, 7);
      assert.ok(days.every((d) => d.active === 0));
      assert.equal(
        (
          await db.get(
            'SELECT agenda_mode FROM barber_settings WHERE company_id=? AND barber_id=?',
            [team, newId],
          )
        ).agenda_mode,
        'manual',
      );
      const own = await req('/professional/agenda', { user: 'flow-new' });
      assert.equal(own.status, 200);
      assert.equal(own.data.linkState, 'inactive');
      assert.equal((await req('/admin/finance', { user: 'flow-new' })).status, 403);
      assert.equal(
        (await req('/public/' + team + '/barbers')).data.some((p) => p.id === newId),
        false,
      );
      assert.equal(
        (
          await db.get('SELECT name FROM barbers WHERE company_id=? AND id=?', [
            team,
            team + '-pro',
          ])
        ).name,
        'Rafael Silva',
      );
    },
  );
  await t.test(
    'same token and mixed code/link retries return original result without duplicate membership, professional or audit',
    async () => {
      const before = await count(team);
      const results = await Promise.all([
        accept(newInvite, 'new'),
        req('/team/invitations/accept', {
          method: 'POST',
          user: 'flow-new',
          instance: 1,
          body: { code: newInvite.data.code },
        }),
      ]);
      assert.ok(results.every((r) => r.status === 200 && r.data.professionalId === newId));
      assert.equal(await count(team), before);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM company_access_events WHERE invitation_id=? AND action='invite-accepted'",
              [newInvite.data.invitation.id],
            )
          ).n,
        ),
        1,
      );
      const row = await db.get(
        'SELECT accepted_token_hash FROM company_invitation_professionals WHERE company_id=? AND invitation_id=?',
        [team, newInvite.data.invitation.id],
      );
      assert.equal(
        row.accepted_token_hash,
        createHash('sha256').update(token(newInvite)).digest('hex'),
      );
      assert.equal(
        (
          await req('/team/invitations/inspect', {
            method: 'POST',
            user: 'flow-new',
            body: { token: token(newInvite) },
          })
        ).status,
        200,
      );
    },
  );
  await t.test(
    'explicit existing professional retains services, hours, appointments and identity; rejects cross-company or stolen link',
    async () => {
      const snapshot = {};
      for (const table of [
        'barbers',
        'barber_services',
        'barber_working_hours',
        'appointments',
        'appointment_services',
      ])
        snapshot[table] = await db.all(
          'SELECT * FROM ' + table + ' WHERE company_id=? ORDER BY 1,2',
          [team],
        );
      const result = await invite('existing', { mode: 'existing', professionalId: team + '-pro' });
      assert.equal(result.status, 201);
      assert.equal((await accept(result, 'existing')).data.professionalId, team + '-pro');
      for (const [table, rows] of Object.entries(snapshot))
        assert.deepEqual(
          await db.all('SELECT * FROM ' + table + ' WHERE company_id=? ORDER BY 1,2', [team]),
          rows,
        );
      assert.equal(
        (await req('/professional/agenda', { user: 'flow-existing' })).data.linkState,
        'linked',
      );
      assert.equal(
        (await invite('cross', { mode: 'existing', professionalId: individual + '-pro' })).status,
        404,
      );
      assert.equal(
        (await invite('other', { mode: 'existing', professionalId: team + '-pro' })).status,
        409,
      );
      assert.equal(
        (await req('/professional/agenda', { user: 'flow-existing', cid: individual })).status,
        403,
      );
    },
  );
  await t.test(
    'manager and legacy invitations preserve old behavior; role and intent cannot be spoofed',
    async () => {
      const before = await count(team),
        manager = await invite('manager', null, team, 'manager');
      assert.equal(manager.status, 201);
      assert.equal((await accept(manager, 'manager')).status, 200);
      assert.equal(await count(team), before);
      assert.equal(
        await db.get('SELECT barber_id FROM professional_users WHERE company_id=? AND user_id=?', [
          team,
          'flow-manager',
        ]),
        undefined,
      );
      assert.equal((await invite('other', { mode: 'new' }, team, 'manager')).status, 400);
      assert.equal(
        (
          await req('/admin/team/invitations', {
            method: 'POST',
            user: 'flow-existing',
            body: { email: 'x@flow.test', role: 'professional', professional: { mode: 'new' } },
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    'cancelled and expired invitations cannot create drafts; renewal retains the selected action and invalidates old credentials',
    async () => {
      const cancelled = await invite('cancel');
      await req('/admin/team/invitations/' + cancelled.data.invitation.id + '/cancel', {
        method: 'POST',
        body: { confirm: true },
      });
      assert.equal((await accept(cancelled, 'cancel')).status, 410);
      const expired = await invite('expired');
      await db.run(
        "UPDATE company_invitations SET expires_at='2026-01-02',created_at='2026-01-01' WHERE id=?",
        [expired.data.invitation.id],
      );
      assert.equal((await accept(expired, 'expired')).status, 410);
      const renewed = await req(
        '/admin/team/invitations/' + expired.data.invitation.id + '/renew',
        { method: 'POST', body: { confirm: true } },
      );
      assert.equal(renewed.status, 200);
      assert.equal((await accept(expired, 'expired')).status, 410);
      assert.ok((await accept(renewed, 'expired')).data.professionalId);
    },
  );
  await t.test(
    'concurrent first acceptance on separate connections creates exactly one draft and link',
    async () => {
      const invitation = await invite('renew'),
        before = await count(team);
      const results = await Promise.all([
        accept(invitation, 'renew'),
        accept(invitation, 'renew', 1),
      ]);
      assert.deepEqual(
        results.map((r) => r.status),
        [200, 200],
      );
      assert.equal(results[0].data.professionalId, results[1].data.professionalId);
      assert.equal(await count(team), before + 1);
    },
  );
  await t.test(
    'failure after creation rolls back membership, draft, hours, link, credential and audit; retry remains possible',
    async () => {
      const invitation = await invite('rollback'),
        before = await count(team);
      brokenWrite = true;
      assert.equal((await accept(invitation, 'rollback', 2)).status, 500);
      brokenWrite = false;
      assert.equal(await count(team), before);
      assert.equal(
        await db.get('SELECT user_id FROM company_members WHERE company_id=? AND user_id=?', [
          team,
          'flow-rollback',
        ]),
        undefined,
      );
      assert.equal(
        (
          await db.get('SELECT status FROM company_invitations WHERE id=?', [
            invitation.data.invitation.id,
          ])
        ).status,
        'pending',
      );
      assert.equal(
        (
          await db.get(
            'SELECT accepted_token_hash FROM company_invitation_professionals WHERE invitation_id=?',
            [invitation.data.invitation.id],
          )
        ).accepted_token_hash,
        null,
      );
      assert.equal((await accept(invitation, 'rollback')).status, 200);
    },
  );
  await t.test(
    'Individual draft consumes no active seat; activation uses existing atomic capacity checks even under concurrency',
    async () => {
      const a = await invite('individual-a', { mode: 'new' }, individual),
        b = await invite('individual-b', { mode: 'new' }, individual);
      const ar = await accept(a, 'individual-a'),
        br = await accept(b, 'individual-b');
      assert.equal(ar.status, 200);
      assert.equal(br.status, 200);
      const activate = (id, instance = 0) =>
        req('/admin/professionals/' + id + '/status', {
          method: 'PATCH',
          cid: individual,
          instance,
          body: { active: true },
        });
      assert.equal(
        (await activate(ar.data.professionalId)).data.code,
        'PROFESSIONAL_LIMIT_REACHED',
      );
      assert.equal(
        (
          await req('/admin/professionals/' + individual + '-pro/status', {
            method: 'PATCH',
            cid: individual,
            body: { active: false, expectedUpcoming: 0 },
          })
        ).status,
        200,
      );
      const results = await Promise.all([
        activate(ar.data.professionalId),
        activate(br.data.professionalId, 1),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        Number(
          (
            await db.get('SELECT COUNT(*) AS n FROM barbers WHERE company_id=? AND active=1', [
              individual,
            ])
          ).n,
        ),
        1,
      );
    },
  );
  await t.test(
    'two accounts cannot acquire the same existing professional during concurrent acceptance',
    async () => {
      await db.run(
        "INSERT INTO barbers(company_id,id,name,specialty) VALUES(?,'link-race','Mesmo cadastro','')",
        [team],
      );
      const a = await invite('link-race-a', { mode: 'existing', professionalId: 'link-race' }),
        b = await invite('link-race-b', { mode: 'existing', professionalId: 'link-race' });
      const results = await Promise.all([accept(a, 'link-race-a'), accept(b, 'link-race-b', 1)]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      assert.equal(
        Number(
          (
            await db.get(
              "SELECT COUNT(*) AS n FROM professional_users WHERE company_id=? AND barber_id='link-race'",
              [team],
            )
          ).n,
        ),
        1,
      );
    },
  );
  await t.test(
    'expired subscription leaves the invitation pending and cannot create or link a professional',
    async () => {
      const invitation = await invite('other'),
        before = await count(team);
      await db.run(
        "UPDATE subscriptions SET status='trialing',trial_started_at='2026-01-01T00:00:00Z',trial_ends_at='2026-01-08T00:00:00Z' WHERE company_id=?",
        [team],
      );
      assert.equal((await accept(invitation, 'other')).status, 409);
      assert.equal(await count(team), before);
      assert.equal(
        (
          await db.get('SELECT status FROM company_invitations WHERE id=?', [
            invitation.data.invitation.id,
          ])
        ).status,
        'pending',
      );
      await db.run(
        "UPDATE subscriptions SET status='active',trial_started_at=NULL,trial_ends_at=NULL WHERE company_id=?",
        [team],
      );
    },
  );
  await t.test(
    'manual address edits invalidate stale CEP metadata while unrelated edits retain it',
    async () => {
      const restore = () =>
        db.run(
          "UPDATE company_settings SET address='Praça da Sé, 12',postal_code='01001000',street='Praça da Sé',address_number='12' WHERE company_id=?",
          [team],
        );
      await restore();
      const snapshot = (await req('/admin/settings')).data;
      const { editable, timezoneLocked, professionals, ...fields } = snapshot;
      assert.equal(
        (await req('/admin/settings', { method: 'PUT', body: { ...fields, phone: '21988888888' } }))
          .status,
        200,
      );
      assert.equal(
        (await db.get('SELECT postal_code FROM company_settings WHERE company_id=?', [team]))
          .postal_code,
        '01001000',
      );
      const current = (await req('/admin/settings')).data;
      assert.equal(
        (
          await req('/admin/settings', {
            method: 'PUT',
            body: {
              ...fields,
              version: current.version,
              site_version: current.site_version,
              address: 'Outro endereço',
            },
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.get('SELECT postal_code FROM company_settings WHERE company_id=?', [team]))
          .postal_code,
        null,
      );
      await restore();
      const site = (await req('/company-site?company=' + team)).data;
      assert.equal(
        (
          await req('/company-site?company=' + team, {
            method: 'PUT',
            body: {
              ...site.settings,
              name: site.company.name,
              address: 'Endereço editado no site',
            },
          })
        ).status,
        200,
      );
      assert.equal(
        (await db.get('SELECT street FROM company_settings WHERE company_id=?', [team])).street,
        null,
      );
    },
  );
  await t.test(
    'revocation never deletes professional, hours, services or appointments and replay cannot restore access',
    async () => {
      const before = await db.get('SELECT * FROM barbers WHERE company_id=? AND id=?', [
        team,
        newId,
      ]);
      assert.equal(
        (
          await req('/admin/team/members/flow-new/revoke', {
            method: 'POST',
            body: { confirm: true, expectedRole: 'professional', expectedStatus: 'active' },
          })
        ).status,
        200,
      );
      assert.equal((await req('/professional/agenda', { user: 'flow-new' })).status, 403);
      assert.equal((await accept(newInvite, 'new')).status, 409);
      assert.deepEqual(
        await db.get('SELECT * FROM barbers WHERE company_id=? AND id=?', [team, newId]),
        before,
      );
      assert.ok(
        await db.get('SELECT barber_id FROM professional_users WHERE company_id=? AND user_id=?', [
          team,
          'flow-new',
        ]),
      );
      for (const [table, rows] of Object.entries(original))
        assert.deepEqual(
          await db.all(
            'SELECT * FROM ' +
              table +
              ' WHERE ' +
              (table === 'companies' ? 'id' : 'company_id') +
              "='igor-barber-club' ORDER BY 1,2",
          ),
          rows,
        );
    },
  );
}
