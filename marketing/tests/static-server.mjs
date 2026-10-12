// Local test fixture only; serves the production output with its Pages security rules.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const definitions = await readFile(path.join(root, '_headers'), 'utf8');
const rules = [];
for (const line of definitions.split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (!line.startsWith(' ')) rules.push({ pattern: line, headers: {} });
  else {
    const index = line.indexOf(':');
    rules.at(-1).headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
}
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};
const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://fixture').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  for (const rule of rules) {
    const pattern = rule.pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:[a-z_]+/g, '[^./]+')
      .replace('*', '.*');
    const candidate = rule.pattern.startsWith('https://')
      ? `https://${request.headers.host}${pathname}`
      : pathname;
    if (new RegExp(`^${pattern}$`).test(candidate)) {
      for (const [key, value] of Object.entries(rule.headers)) response.setHeader(key, value);
    }
  }
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    response.writeHead(200).end(body);
  } catch {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.writeHead(404).end(await readFile(path.join(root, '404.html')));
  }
});
server.listen(4175, '127.0.0.1', () =>
  console.log('Local static marketing fixture ready on port 4175.'),
);
