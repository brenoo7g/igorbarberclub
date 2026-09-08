// Only fixed labels leave the server. Provider messages may contain credentials,
// connection URLs or customer data and must never appear in the health response.
export function initializationDiagnostic(error) {
  const stages = [
    'configuration',
    'database',
    'database-connection',
    'database-schema-file',
    'database-schema',
    'initial-data',
    'application',
  ];
  const stage = stages.includes(error.initializationStage)
    ? error.initializationStage
    : 'initialization';
  const code = typeof error.code === 'string' ? error.code : '';
  let reason = 'INITIALIZATION_FAILED';
  if (code === 'SERVER_NOT_CONFIGURED') reason = 'CONFIGURATION_INVALID';
  else if (['28P01', '28000'].includes(code)) reason = 'DATABASE_AUTHENTICATION_FAILED';
  else if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) reason = 'DATABASE_HOST_NOT_FOUND';
  else if (['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code))
    reason = 'DATABASE_UNREACHABLE';
  else if (
    ['ETIMEDOUT', 'ECONNRESET', '57P03', '53300'].includes(code) ||
    /timeout|timed out|connection terminated/i.test(error.message || '')
  )
    reason = 'DATABASE_CONNECTION_FAILED';
  else if (
    [
      'SELF_SIGNED_CERT_IN_CHAIN',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ].includes(code)
  )
    reason = 'DATABASE_TLS_FAILED';
  else if (code === '3D000') reason = 'DATABASE_NOT_FOUND';
  else if (code === '42501') reason = 'DATABASE_PERMISSION_DENIED';
  else if (['42P01', '42703', '42P07', '42710', '42804', '42601'].includes(code))
    reason = 'DATABASE_SCHEMA_FAILED';
  else if (code === 'ENOENT' && stage === 'database-schema-file')
    reason = 'DATABASE_SCHEMA_FILE_MISSING';
  else if (['ERR_INVALID_URL', 'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE'].includes(code))
    reason = 'INVALID_CONFIGURATION_VALUE';
  else if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND')
    reason = 'SERVER_MODULE_MISSING';
  const type = ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AggregateError'].includes(
    error.name,
  )
    ? error.name
    : 'Error';
  const frame = (error.stack || '').match(/(?:server|api)[\\/]([a-z-]+\.js):(\d+):\d+/);
  return { stage, reason, type, ...(frame ? { source: `${frame[1]}:${frame[2]}` } : {}) };
}
