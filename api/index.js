import { waitUntil } from '@vercel/functions';
import { getServerlessRuntime } from '../server/serverless.js';

// A Vite build alone does not deploy the standalone Node server. This entry point
// exposes that same API as one Vercel Function without starting a port listener.
export default async function handler(req, res) {
  let runtime;
  try {
    runtime = await getServerlessRuntime();
  } catch (error) {
    const health = req.url?.split('?')[0] === '/api/health';
    console.error('API initialization failed:', error.code || error.name);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '30');
    res.statusCode = 503;
    return res.end(
      JSON.stringify({
        error:
          'O agendamento online está temporariamente indisponível. Tente novamente em instantes.',
        code: error.code === 'SERVER_NOT_CONFIGURED' ? error.code : 'SERVER_UNAVAILABLE',
        ...(health ? { ok: false, missing: error.missing || [] } : {}),
      }),
    );
  }

  // Timers do not keep serverless instances alive. Attach this finite batch to
  // the response lifecycle so a saved booking can trigger its notifications.
  res.once('finish', () => {
    if (res.statusCode < 400) waitUntil(runtime.processNotifications());
  });
  return runtime.app(req, res);
}
