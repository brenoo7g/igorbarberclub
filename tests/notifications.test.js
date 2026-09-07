import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database.js';
import { seed } from '../server/seed.js';
import { enqueueNotification, startNotifications } from '../server/notifications.js';

test('notification worker: disabled channels cannot starve email; provider contract and retries', async (t) => {
  const db = await createDatabase('', ':memory:');
  await seed(db);
  const previous = {
    key: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM,
    sid: process.env.TWILIO_CONTENT_SID,
  };
  process.env.RESEND_API_KEY = 'test-placeholder-never-sent';
  process.env.EMAIL_FROM = 'Test <test@example.com>';
  delete process.env.TWILIO_CONTENT_SID;
  let stop = () => {};
  t.after(async () => {
    stop();
    for (const [key, value] of Object.entries({
      RESEND_API_KEY: previous.key,
      EMAIL_FROM: previous.from,
      TWILIO_CONTENT_SID: previous.sid,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await db.close();
  });
  const appointment = await db.get('SELECT id FROM appointments LIMIT 1');
  // Older unconfigured-channel events used to fill the batch before eligible emails.
  for (let i = 0; i < 25; i++) {
    await enqueueNotification(db, appointment.id, 'confirmed');
  }
  await db.run("DELETE FROM notifications WHERE channel='email'");
  await enqueueNotification(db, appointment.id, 'confirmed');
  const email = await db.get("SELECT * FROM notifications WHERE channel='email'");
  const calls = [];
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return new Response('{}', { status: fail ? 503 : 202 });
  });
  const waitFor = async (fn) => {
    for (let i = 0; i < 100; i++) {
      if (await fn()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('Worker did not reach expected state');
  };
  stop = startNotifications(db);
  await waitFor(
    async () =>
      (await db.get('SELECT status FROM notifications WHERE id=?', [email.id])).status === 'sent',
  );
  stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers['Idempotency-Key'], email.id);
  const payload = JSON.parse(calls[0].options.body);
  assert.match(payload.text, /minha-conta/);
  assert.match(payload.subject, /confirmado/);
  assert.equal(
    (
      await db.get(
        "SELECT COUNT(*) AS count FROM notifications WHERE channel='whatsapp' AND status='pending'",
      )
    ).count,
    26,
  );

  fail = true;
  await enqueueNotification(db, appointment.id, 'rescheduled');
  const retry = await db.get(
    "SELECT * FROM notifications WHERE channel='email' AND event='rescheduled'",
  );
  stop = startNotifications(db);
  await waitFor(async () => {
    const row = await db.get('SELECT * FROM notifications WHERE id=?', [retry.id]);
    return row.attempts === 1 && row.status === 'pending';
  });
  const row = await db.get('SELECT * FROM notifications WHERE id=?', [retry.id]);
  assert.ok(row.next_attempt_at > new Date().toISOString());
  assert.match(row.error, /503/);
  assert.equal(calls.length, 2);
});
