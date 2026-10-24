import { emailConfiguration } from '../server/transactional-email.js';

// Reads only the process environment. Does not load .env, open a database,
// print credentials/recipients, verify DNS remotely or send messages.
const config = emailConfiguration();
console.log(
  JSON.stringify(
    {
      mode: config.mode,
      configured: config.configured,
      activationPresent: Boolean(config.scope),
      recipientCount: config.allowlist.length,
      restricted: config.restricted,
      databasePurposeDeclared: process.env.EMAIL_TEST_DATABASE === 'isolated-fixtures',
      domainVerification: 'must be checked in Resend',
      databaseIsolation: 'must be checked by operator',
      emailSent: false,
    },
    null,
    2,
  ),
);
if (config.mode !== 'disabled' && !config.configured) process.exitCode = 1;
