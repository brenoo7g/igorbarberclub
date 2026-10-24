import assert from 'node:assert/strict';
// Explicit test-fixture enrollment only. Production never backfills queue activations.
// Existing suites mock fetch themselves. This helper never contacts a provider.
export async function authorizeMockEmail(t, db, { enrollExisting = false, companyId } = {}) {
  const values = {
    EMAIL_DELIVERY_MODE: 'test',
    EMAIL_DELIVERY_SCOPE: 'automated-fixtures-never-real',
    EMAIL_TEST_DATABASE: 'isolated-fixtures',
    RESEND_API_KEY: 're_test_never_sent_0000000000',
    EMAIL_FROM: process.env.EMAIL_FROM || 'Test <test@example.test>',
    APP_URL: process.env.APP_URL?.startsWith('https://')
      ? process.env.APP_URL
      : 'https://gradefy.example.test',
  };
  const emails = await db.all(
    'SELECT email FROM users UNION SELECT guest_email AS email FROM appointments WHERE guest_email IS NOT NULL UNION SELECT email FROM password_recovery',
  );
  const allowed = emails
    .map((r) => r.email)
    .filter((email) => /@(?:[a-z0-9-]+\.)?example\.(?:com|test|org)$/i.test(email || ''));
  allowed.push(
    'contato-atual@example.com',
    'changed-reliability@example.test',
    'cliente@example.com',
    'new@example.com',
    'admin@igorbarberclub.com.br',
  );
  assert.ok(allowed.length > 0);
  values.EMAIL_TEST_ALLOWLIST = [...new Set(allowed)].join(',');
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(before))
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
  if (enrollExisting) {
    await db.run(
      "UPDATE notifications SET email_delivery_scope=? WHERE channel='email'" +
        (companyId ? ' AND company_id=?' : ''),
      [values.EMAIL_DELIVERY_SCOPE, ...(companyId ? [companyId] : [])],
    );
    await db.run('UPDATE password_recovery SET email_delivery_scope=?', [
      values.EMAIL_DELIVERY_SCOPE,
    ]);
  }
}
