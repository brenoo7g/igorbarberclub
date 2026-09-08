import test from 'node:test';
import assert from 'node:assert/strict';
import { initializationDiagnostic } from '../server/diagnostics.js';

test('initialization diagnostics identify actionable failures without exposing secrets', () => {
  const examples = [
    ['28P01', 'DATABASE_AUTHENTICATION_FAILED'],
    ['ENOTFOUND', 'DATABASE_HOST_NOT_FOUND'],
    ['ENETUNREACH', 'DATABASE_UNREACHABLE'],
    ['42501', 'DATABASE_PERMISSION_DENIED'],
    ['42703', 'DATABASE_SCHEMA_FAILED'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'DATABASE_TLS_FAILED'],
    ['SERVER_NOT_CONFIGURED', 'CONFIGURATION_INVALID'],
  ];
  for (const [code, reason] of examples) {
    const error = new Error(
      'postgresql://private-user:secret-password@private-host/db customer@example.com',
    );
    error.code = code;
    error.initializationStage = 'database-connection';
    const result = initializationDiagnostic(error);
    assert.equal(result.reason, reason);
    assert.equal(result.stage, 'database-connection');
    assert.doesNotMatch(
      JSON.stringify(result),
      /secret-password|private-user|private-host|customer@example.com/,
    );
  }
  const unknown = new TypeError('secret-value');
  unknown.initializationStage = 'secret-value';
  unknown.stack =
    'TypeError: secret-value\n at initialize (file:///var/task/server/database.js:23:5)';
  assert.deepEqual(initializationDiagnostic(unknown), {
    stage: 'initialization',
    reason: 'INITIALIZATION_FAILED',
    type: 'TypeError',
    source: 'database.js:23',
  });
});
