import { api } from '../lib';

// Same endpoints, cookie and JWT. Only the session read/logout skip visitor/company lookup.
export const gradefyApi: typeof api = (path, options = {}) =>
  api(
    path === '/auth/me' || path === '/auth/logout' ? `${path}?scope=gradefy` : path,
    options,
    '/api',
    'gradefy',
  );
