import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Webhook } from 'svix';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server/app.js';
import { seed } from '../../server/seed.js';
import {
  emailConfigured,
  emailDeliveryScope,
  sendTransactionalEmail,
  deliverTransactionalEmail,
} from '../../server/transactional-email.js';
import { emailTemplate } from '../../server/email-templates.js';
import {
  enqueueNotification,
  createNotificationProcessor,
  appointmentEmail,
} from '../../server/notifications.js';
import { authorizeMockEmail } from './email-fixtures.js';
import { reconstructBeforeEmailDelivery } from './email-migration.js';
import { runMigrations } from '../../server/migrations.js';
import { createPasswordEmailProcessor } from '../../server/password-recovery.js';

export async function assertEmailMigration(t, db) {
  const history = await db.all('SELECT * FROM schema_migrations WHERE version<22 ORDER BY version');
  const appointments = await db.all('SELECT * FROM appointments ORDER BY id');
  await reconstructBeforeEmailDelivery(db);
  await assert.rejects(
    runMigrations({
      transaction: (fn) =>
        db.transaction((tx) =>
          fn({
            ...tx,
            run(sql, args) {
              if (sql.includes('CREATE TABLE email_webhook_events'))
                throw Error('injected 022 failure');
              return tx.run(sql, args);
            },
          }),
        ),
    }),
    /injected 022/,
  );
  assert.equal(await db.get('SELECT version FROM schema_migrations WHERE version=22'), undefined);
  await assert.rejects(db.all('SELECT * FROM email_deliveries'));
  assert.deepEqual(await runMigrations(db), [22]);
  assert.deepEqual(await runMigrations(db), []);
  assert.deepEqual(
    await db.all('SELECT * FROM schema_migrations WHERE version<22 ORDER BY version'),
    history,
  );
  assert.deepEqual(await db.all('SELECT * FROM appointments ORDER BY id'), appointments);
  for (const table of ['notifications', 'password_recovery'])
    assert.ok(
      (await db.all(`SELECT email_delivery_scope FROM ${table}`)).every(
        (r) => r.email_delivery_scope === '',
      ),
    );
  for (const table of ['email_deliveries', 'email_delivery_attempts', 'email_webhook_events']) {
    const cols =
      table === 'email_deliveries'
        ? '(id,source_id,kind,status,created_at,updated_at)'
        : table === 'email_delivery_attempts'
          ? '(id,delivery_id,started_at,status)'
          : '(id,provider_message_id,event_type,occurred_at,received_at)';
    const vals =
      table === 'email_deliveries'
        ? "(NULL,'x','appointment','pending','2026','2026')"
        : table === 'email_delivery_attempts'
          ? "(NULL,'x','2026','processing')"
          : "(NULL,'x','email.sent','2026','2026')";
    await assert.rejects(db.run(`INSERT INTO ${table}${cols} VALUES${vals}`));
  }
  t.diagnostic(
    '022 additive, rollback atomic, repeated execution empty, previous history and reservations preserved',
  );
}

export async function assertEmailDelivery(t, db) {
  await seed(db);
  const cid = 'igor-barber-club';
  const appointment = await db.get('SELECT id FROM appointments LIMIT 1');
  assert.ok(appointment);
  const nativeFetch = globalThis.fetch;
  let calls = [],
    failure;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    calls.push({ ...options, payload: JSON.parse(options.body) });
    if (failure === 'timeout') throw new DOMException('simulated timeout', 'TimeoutError');
    return Response.json(failure ? {} : { id: 'mock-' + options.headers['Idempotency-Key'] }, {
      status: failure ? 503 : 200,
    });
  });
  const previousMode = process.env.EMAIL_DELIVERY_MODE;
  process.env.EMAIL_DELIVERY_MODE = 'disabled';
  t.after(() =>
    previousMode === undefined
      ? delete process.env.EMAIL_DELIVERY_MODE
      : (process.env.EMAIL_DELIVERY_MODE = previousMode),
  );
  await enqueueNotification(db, cid, appointment.id, 'confirmed');
  const historical = await db.get(
    "SELECT * FROM notifications WHERE channel='email' ORDER BY created_at DESC LIMIT 1",
  );
  assert.equal(historical.email_delivery_scope, '');
  await authorizeMockEmail(t, db);
  const scope = emailDeliveryScope();
  const message = {
    from: process.env.EMAIL_FROM,
    to: ['cliente@example.com'],
    ...emailTemplate({
      subject: 'Teste Gradefy',
      title: 'Teste',
      greeting: 'Olá!',
      paragraphs: ['Somente dados fictícios.'],
    }),
  };
  await t.test(
    'disabled and malformed configuration never send; live outside production also requires allowlist',
    async () => {
      for (const [key, value] of [
        ['EMAIL_DELIVERY_MODE', 'disabled'],
        ['EMAIL_DELIVERY_MODE', 'unknown'],
        ['EMAIL_TEST_ALLOWLIST', ''],
        ['EMAIL_TEST_DATABASE', ''],
        ['RESEND_API_KEY', 'invalid'],
        ['EMAIL_FROM', 'bad\nfrom'],
        ['APP_URL', 'http://localhost:5173'],
        ['APP_URL', 'https://user:pass@example.test'],
      ]) {
        const before = process.env[key];
        process.env[key] = value;
        assert.equal(emailConfigured(), false);
        await assert.rejects(async () => sendTransactionalEmail(message, 'never', 100, { scope }), {
          code: 'EMAIL_POLICY_BLOCKED',
        });
        process.env[key] = before;
      }
      assert.equal(calls.length, 0);
      assert.equal(emailConfigured(), true);
    },
  );
  await t.test(
    'exact recipient allowlist, activation scope, invalid recipient and CC/BCC are enforced',
    async () => {
      for (const [payload, context] of [
        [{ ...message, to: ['outsider@example.test'] }, { scope }],
        [message, { scope: 'older-round' }],
        [{ ...message, bcc: ['cliente@example.com'] }, { scope }],
        [{ ...message, to: ['not-email'] }, { scope }],
        [{ ...message, from: 'Other <other@example.test>' }, { scope }],
      ])
        await assert.rejects(async () => sendTransactionalEmail(payload, 'never', 100, context), {
          code: 'EMAIL_POLICY_BLOCKED',
        });
      assert.equal(calls.length, 0);
    },
  );
  await t.test(
    'enabling credentials does not send history; fresh booking events retain immutable retries and acceptance evidence',
    async () => {
      const worker = createNotificationProcessor(db, cid, { batchSize: 100 });
      await worker();
      assert.equal(calls.length, 0);
      assert.equal(
        (await db.get('SELECT status FROM notifications WHERE id=?', [historical.id])).status,
        'review',
      );
      await enqueueNotification(db, cid, appointment.id, 'rescheduled');
      const fresh = await db.get(
        "SELECT * FROM notifications WHERE event='rescheduled' AND channel='email' ORDER BY created_at DESC LIMIT 1",
      );
      failure = 'http';
      await worker();
      assert.equal(
        (await db.get('SELECT status FROM notifications WHERE id=?', [fresh.id])).status,
        'pending',
      );
      await db.run("UPDATE notifications SET next_attempt_at='2000' WHERE id=?", [fresh.id]);
      failure = undefined;
      await worker();
      await worker();
      const sent = calls.filter((c) => c.headers['Idempotency-Key'] === fresh.id);
      assert.equal(sent.length, 2);
      assert.equal(sent[0].body, sent[1].body);
      const delivery = await db.get('SELECT * FROM email_deliveries WHERE source_id=?', [fresh.id]);
      assert.equal(delivery.status, 'accepted');
      assert.equal(delivery.provider_message_id, 'mock-' + fresh.id);
      assert.equal(
        (await db.all('SELECT * FROM email_delivery_attempts WHERE delivery_id=?', [delivery.id]))
          .length,
        2,
      );
      assert.ok(sent[1].payload.html.includes('Gradefy'));
    },
  );
  await t.test(
    'timeout can retry with same idempotency key, blocked recipient is intervention rather than uncontrolled retry',
    async () => {
      const key = 'timeout-' + randomUUID();
      const context = { companyId: cid, sourceId: key, kind: 'appointment', scope };
      failure = 'timeout';
      await assert.rejects(deliverTransactionalEmail(db, context, message, key), {
        name: 'TimeoutError',
      });
      failure = undefined;
      await deliverTransactionalEmail(db, context, message, key);
      const delivered = await db.get('SELECT * FROM email_deliveries WHERE source_id=?', [key]);
      assert.equal(delivered.status, 'accepted');
      const count = calls.length;
      await assert.rejects(
        deliverTransactionalEmail(
          db,
          { ...context, sourceId: 'blocked' },
          { ...message, to: ['third-party@example.test'] },
          'blocked-' + key,
        ),
        { code: 'EMAIL_POLICY_BLOCKED' },
      );
      assert.equal(calls.length, count);
    },
  );
  await t.test(
    'HTML/text use snapshots, escape variables, never expose internal notes, validate destinations and contain no fabricated history',
    async () => {
      const payload = {
        name: '<Cliente>',
        services: 'Corte & barba',
        date: '2030-01-20',
        time: '11:40',
        total: 4321,
        barber: '<Profissional>',
        brand: { name: 'Empresa <teste>', timezone: 'America/Sao_Paulo' },
        blockCancellationReason: '<Manutenção> & ajustes',
        internal_notes: 'INTERNAL_SECRET',
      };
      for (const event of ['confirmed', 'rescheduled', 'cancelled']) {
        const mail = appointmentEmail(
          payload,
          event,
          'https://gradefy.example.test/empresa/agendar',
          cid,
        );
        assert.match(mail.text, /43,21/);
        assert.match(mail.html, /&lt;Cliente&gt;/);
        assert.doesNotMatch(mail.html, /<Cliente>|INTERNAL_SECRET|javascript:/);
        assert.ok(mail.text.includes('<Cliente>'));
        assert.ok(mail.html.includes('table role="presentation"'));
        if (event === 'cancelled') assert.match(mail.subject, /^Aviso importante:/);
        if (event === 'rescheduled') assert.doesNotMatch(mail.text, /Anterior|antes/);
      }
      assert.throws(
        () =>
          emailTemplate({
            subject: 'x',
            title: 'x',
            greeting: 'x',
            action: { label: 'x', url: 'https://attacker.invalid/' },
          }),
        /Destino/,
      );
      assert.throws(
        () =>
          emailTemplate({
            subject: 'x',
            title: 'x',
            greeting: 'x',
            action: { label: 'x', url: 'javascript:alert(1)' },
          }),
        /Destino/,
      );
    },
  );
  await t.test(
    'signed raw webhooks deduplicate, reject corruption/replay, reconcile early events and never change bookings or permissions',
    async () => {
      const webhookSecret =
        'whsec_' + Buffer.from('isolated-webhook-secret-32-bytes!!').toString('base64');
      const old = process.env.RESEND_WEBHOOK_SECRET;
      process.env.RESEND_WEBHOOK_SECRET = webhookSecret;
      t.after(() =>
        old === undefined
          ? delete process.env.RESEND_WEBHOOK_SECRET
          : (process.env.RESEND_WEBHOOK_SECRET = old),
      );
      const secret = 'email-test-session-secret-at-least-32-characters';
      const app = createApp(db, { secret, test: true, serveStatic: false });
      const server = app.listen(0, '127.0.0.1');
      await once(server, 'listening');
      t.after(() => new Promise((r) => server.close(r)));
      const base = 'http://127.0.0.1:' + server.address().port;
      const signer = new Webhook(webhookSecret);
      const existing = await db.get(
        "SELECT * FROM email_deliveries WHERE status='accepted' AND company_id=? LIMIT 1",
        [cid],
      );
      const appointmentSnapshot = await db.all('SELECT id,status FROM appointments ORDER BY id');
      const members = await db.all('SELECT * FROM company_members ORDER BY company_id,user_id');
      async function post(
        type,
        providerId,
        { id = 'msg_' + randomUUID(), tamper = false, stale = false } = {},
      ) {
        const data = JSON.stringify({
          type,
          created_at: new Date().toISOString(),
          data: {
            email_id: providerId,
            to: ['PRIVATE_DO_NOT_STORE'],
            subject: 'PRIVATE_DO_NOT_STORE',
          },
        });
        const timestamp = new Date(Date.now() - (stale ? 600000 : 0));
        return nativeFetch(base + '/api/webhooks/resend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'svix-id': id,
            'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
            'svix-signature': signer.sign(id, timestamp, data),
          },
          body: data + (tamper ? ' ' : ''),
        });
      }
      assert.equal(
        (await post('email.delivered', existing.provider_message_id, { tamper: true })).status,
        400,
      );
      assert.equal(
        (await post('email.delivered', existing.provider_message_id, { stale: true })).status,
        400,
      );
      const id = 'msg_' + randomUUID();
      assert.equal(
        (await post('email.delivered', existing.provider_message_id, { id })).status,
        204,
      );
      assert.equal(
        (await post('email.delivered', existing.provider_message_id, { id })).status,
        204,
      );
      assert.equal(
        Number((await db.get('SELECT COUNT(*) AS n FROM email_webhook_events WHERE id=?', [id])).n),
        1,
      );
      assert.equal(
        (await db.get('SELECT status FROM email_deliveries WHERE id=?', [existing.id])).status,
        'delivered',
      );
      await post('email.sent', existing.provider_message_id);
      assert.equal(
        (await db.get('SELECT status FROM email_deliveries WHERE id=?', [existing.id])).status,
        'delivered',
      );
      for (const [event, status] of [
        ['email.delivery_delayed', 'delivered'],
        ['email.bounced', 'rejected'],
        ['email.suppressed', 'suppressed'],
        ['email.failed', 'suppressed'],
        ['email.complained', 'complained'],
      ]) {
        assert.equal((await post(event, existing.provider_message_id)).status, 204);
        assert.equal(
          (await db.get('SELECT status FROM email_deliveries WHERE id=?', [existing.id])).status,
          status,
        );
      }
      const earlyKey = 'early-' + randomUUID();
      await post('email.delivered', 'mock-' + earlyKey);
      await deliverTransactionalEmail(
        db,
        { companyId: cid, sourceId: earlyKey, kind: 'appointment', scope },
        message,
        earlyKey,
      );
      assert.equal(
        (await db.get('SELECT status FROM email_deliveries WHERE source_id=?', [earlyKey])).status,
        'delivered',
      );
      assert.ok(
        !JSON.stringify(await db.all('SELECT * FROM email_webhook_events')).includes(
          'PRIVATE_DO_NOT_STORE',
        ),
      );
      assert.deepEqual(
        await db.all('SELECT id,status FROM appointments ORDER BY id'),
        appointmentSnapshot,
      );
      assert.deepEqual(
        await db.all('SELECT * FROM company_members ORDER BY company_id,user_id'),
        members,
      );
      // Real company authorization, not a frontend-only filter.
      const user = await db.get(
        "SELECT u.id,u.session_version FROM users u JOIN company_members m ON m.user_id=u.id WHERE m.company_id=? AND m.status='active' AND m.role IN ('owner','manager') LIMIT 1",
        [cid],
      );
      const cookie =
        'session=' +
        jwt.sign({ version: user.session_version }, secret, {
          subject: user.id,
          issuer: 'igor-barber-club',
          audience: 'barber-web',
        });
      assert.equal((await nativeFetch(base + '/api/admin/email-notifications')).status, 401);
      const center = await nativeFetch(base + '/api/admin/email-notifications', {
        headers: { Cookie: cookie },
      });
      assert.equal(center.status, 200);
      const body = await center.json();
      assert.ok(body.counts.complained > 0);
      assert.ok(!JSON.stringify(body).includes('PRIVATE_DO_NOT_STORE'));
      assert.equal(
        (
          await nativeFetch(base + '/api/admin/email-notifications', {
            headers: { Cookie: cookie, 'X-Gradefy-Company-Id': 'foreign-company' },
          })
        ).status,
        403,
      );
      const clientCookie =
        'gradefy-client=' +
        jwt.sign({ version: user.session_version }, secret, {
          subject: user.id,
          issuer: 'igor-barber-club',
          audience: 'gradefy-client',
        });
      assert.equal(
        (
          await nativeFetch(base + '/api/admin/email-notifications', {
            headers: { Cookie: clientCookie },
          })
        ).status,
        401,
      );
      // Direct invitations use the SAME guarded transport and delivery ledger.
      await db.run("UPDATE company_members SET role='owner' WHERE company_id=? AND user_id=?", [
        cid,
        user.id,
      ]);
      const invite = (email) =>
        nativeFetch(base + '/api/admin/team/invitations', {
          method: 'POST',
          headers: { Cookie: cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'manager' }),
        });
      const count = calls.length;
      const blockedInvite = await invite('not-allowed-invite@example.test');
      assert.equal(blockedInvite.status, 201);
      assert.equal((await blockedInvite.json()).invitation.delivery, 'failed');
      assert.equal(calls.length, count);
      process.env.EMAIL_TEST_ALLOWLIST += ',allowed-invite@example.test';
      const allowedInvite = await invite('allowed-invite@example.test');
      assert.equal(allowedInvite.status, 201);
      const invitation = await allowedInvite.json();
      assert.equal(invitation.invitation.delivery, 'sent');
      assert.equal(calls.length, count + 1);
      const mail = calls.at(-1).payload;
      assert.match(mail.subject, /^Você recebeu um convite —/);
      assert.match(mail.html, /Gradefy/);
      assert.ok(mail.text.includes(invitation.code));
      assert.equal(
        (
          await db.get(
            "SELECT status FROM email_deliveries WHERE kind='invitation' AND source_id=?",
            [invitation.invitation.id],
          )
        ).status,
        'accepted',
      );
      // Global password history is not automatically enrolled or disclosed to company managers.
      const recoveryId = 'gradefy-' + randomUUID();
      await db.run(
        "INSERT INTO password_recovery(id,user_id,email,session_version,event,created_at,expires_at,next_attempt_at) VALUES(?,?,?,?,'changed','2000',?,'2000')",
        [
          recoveryId,
          user.id,
          'cliente@example.com',
          user.session_version,
          new Date(Date.now() + 86400000).toISOString(),
        ],
      );
      // Preserve existing recipient revalidation: the historic email must match its user.
      const recoveryUser = await db.get('SELECT email FROM users WHERE id=?', [user.id]);
      await db.run('UPDATE password_recovery SET email=? WHERE id=?', [
        recoveryUser.email,
        recoveryId,
      ]);
      const beforeRecovery = calls.length;
      const originalError = console.error;
      console.error = () => {};
      try {
        await createPasswordEmailProcessor(db, secret)();
      } finally {
        console.error = originalError;
      }
      assert.equal(calls.length, beforeRecovery);
      assert.equal(
        (await db.get('SELECT status FROM password_recovery WHERE id=?', [recoveryId])).status,
        'failed',
      );
      const safeCenter = await (
        await nativeFetch(base + '/api/admin/email-notifications', { headers: { Cookie: cookie } })
      ).json();
      assert.ok(!JSON.stringify(safeCenter).includes(recoveryId));
    },
  );
}
