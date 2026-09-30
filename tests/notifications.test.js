import { getLegacyCompanyId } from '../server/company-context.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/database.js';
import { seed } from '../server/seed.js';
import {
  appointmentEmail,
  enqueueNotification,
  startNotifications,
} from '../server/notifications.js';

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
    await enqueueNotification(db, getLegacyCompanyId(), appointment.id, 'confirmed');
  }
  await db.run("DELETE FROM notifications WHERE channel='email'");
  await enqueueNotification(db, getLegacyCompanyId(), appointment.id, 'confirmed');
  const email = await db.get("SELECT * FROM notifications WHERE channel='email'");
  const snapshot = JSON.parse(email.payload);
  assert.equal(snapshot.barber, 'Igor Borges');
  assert.ok(Number.isInteger(snapshot.total));
  assert.ok(Number.isInteger(snapshot.duration));
  assert.equal(snapshot.reference, appointment.id);
  // Queued confirmations must retain their price and professional after later edits.
  await db.run('UPDATE appointments SET total=1 WHERE id=?', [appointment.id]);
  await db.run("UPDATE barbers SET name='Outro Nome' WHERE id='igor'");
  await db.run(
    'UPDATE users SET name=?,email=?,phone=? WHERE id=(SELECT user_id FROM appointments WHERE id=?)',
    ['Contato Atualizado', 'contato-atual@example.com', '21988887777', appointment.id],
  );
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
  stop = startNotifications(db, getLegacyCompanyId());
  await waitFor(
    async () =>
      (await db.get('SELECT status FROM notifications WHERE id=?', [email.id])).status === 'sent',
  );
  stop();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers['Idempotency-Key'], email.id);
  const payload = JSON.parse(calls[0].options.body);
  assert.deepEqual(payload.to, ['contato-atual@example.com']);
  assert.match(payload.text, /Olá, Contato Atualizado!/);
  assert.match(payload.text, /minha-conta/);
  assert.match(payload.text, /realizado com sucesso/);
  assert.match(payload.text, /Profissional: Igor Borges/);
  assert.ok(payload.text.includes(`Serviço(s): ${snapshot.services}`));
  assert.ok(payload.text.includes(`Data: ${snapshot.date.split('-').reverse().join('/')}`));
  assert.ok(payload.text.includes(`Horário: ${snapshot.time}`));
  assert.ok(
    payload.text.includes(
      `Valor total: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(snapshot.total / 100)}`,
    ),
  );
  assert.equal(payload.from, process.env.EMAIL_FROM);
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
  await enqueueNotification(db, getLegacyCompanyId(), appointment.id, 'rescheduled');
  const retry = await db.get(
    "SELECT * FROM notifications WHERE channel='email' AND event='rescheduled'",
  );
  stop = startNotifications(db, getLegacyCompanyId());
  await waitFor(async () => {
    const row = await db.get('SELECT * FROM notifications WHERE id=?', [retry.id]);
    return row.attempts === 1 && row.status === 'pending';
  });
  const row = await db.get('SELECT * FROM notifications WHERE id=?', [retry.id]);
  assert.ok(row.next_attempt_at > new Date().toISOString());
  assert.match(row.error, /503/);
  assert.equal(calls.length, 2);
});

test('email templates distinguish events, format free services and support old queued payloads', () => {
  const payload = {
    name: 'Cliente Teste',
    services: 'Corte + Barba',
    date: '2026-10-01',
    time: '14:30',
    barber: 'Igor Borges',
    total: 0,
    duration: 70,
    reference: 'test-booking',
  };
  const confirmed = appointmentEmail(
    payload,
    'confirmed',
    'https://igorbarberclub.vercel.app/minha-conta',
  );
  assert.match(confirmed.text, /R\$\s0,00/);
  assert.match(confirmed.text, /01\/10\/2026/);
  assert.match(confirmed.text, /70 minutos/);
  const cancelled = appointmentEmail(payload, 'cancelled', 'https://example.com/minha-conta');
  assert.match(cancelled.subject, /cancelado/);
  assert.doesNotMatch(cancelled.text, /realizado com sucesso|Pagamento na barbearia/);
  assert.match(
    appointmentEmail(payload, 'rescheduled', 'https://example.com/minha-conta').text,
    /remarcado com sucesso/,
  );
  const legacy = appointmentEmail(
    { name: 'Cliente', services: 'Corte', date: '2026-10-01', time: '10:00' },
    'confirmed',
    'https://example.com/minha-conta',
  );
  assert.doesNotMatch(legacy.text, /undefined|NaN|Profissional:|Valor total:/);
});
