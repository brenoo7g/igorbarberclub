import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instagramUrl, render } from '../.prerender/render.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const html = await readFile(path.join(output, 'index.html'), 'utf8');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : path.join(directory, entry.name),
    ),
  );
  return paths.flat();
}

test('social configuration accepts official HTTPS profiles and hides invalid or empty links', () => {
  assert.equal(instagramUrl(undefined), 'https://www.instagram.com/gradefyapp/');
  assert.equal(
    instagramUrl('https://www.instagram.com/gradefyapp/'),
    'https://www.instagram.com/gradefyapp/',
  );
  for (const value of [
    '',
    'javascript:alert(1)',
    'http://instagram.com/gradefyapp/',
    'https://instagram.com.evil.invalid/gradefyapp/',
    'https://user:pass@instagram.com/gradefyapp/',
    'https://instagram.com/',
    'https://instagram.com/gradefyapp/?next=secret',
  ])
    assert.equal(instagramUrl(value), null);
});

test('HTML is prerendered with one H1, all sections and the official launch channel', () => {
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  for (const id of [
    'inicio',
    'recursos',
    'demonstracao',
    'segmentos',
    'como-funciona',
    'lancamento',
  ])
    assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('https://www.instagram.com/gradefyapp/'));
  assert.ok(html.includes('Conhecer o Gradefy'));
  assert.equal((html.match(/Expansão planejada/g) ?? []).length, 3);
  assert.ok(html.includes('Foco inicial · template implementado'));
  assert.equal((html.match(/<form[ >]/g) ?? []).length, 0);
  assert.ok(render().includes('Lançamento em breve'));
});

test('SEO assets use only the canonical official domain', async () => {
  assert.ok(html.includes('lang="pt-BR"'));
  assert.match(html, /name="description"\s+content="[^"]+"/);
  assert.match(html, /rel="canonical" href="https:\/\/gradefyapp\.com\.br\/"/);
  assert.ok(html.includes('name="robots" content="index, follow"'));
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:locale', 'og:url'])
    assert.ok(html.includes(`property="${tag}"`));
  for (const file of ['favicon.png', 'apple-touch-icon.png', 'og-gradefy.png'])
    assert.ok((await readFile(path.join(output, file))).length > 100);
  assert.match(
    await readFile(path.join(output, 'sitemap.xml'), 'utf8'),
    /<loc>https:\/\/gradefyapp\.com\.br\/<\/loc>/,
  );
  assert.match(
    await readFile(path.join(output, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/gradefyapp\.com\.br\/sitemap.xml/,
  );
  const share = await readFile(path.join(output, 'og-gradefy.png'));
  assert.equal(share.readUInt32BE(16), 1200);
  assert.equal(share.readUInt32BE(20), 630);
});

test('public output excludes commercial values, application code and sensitive data', async () => {
  const publicFiles = await files(output);
  const forbidden = [
    /\bR\$\s*\d|22[,.]99|32[,.]99|\b(?:2299|3299)\b|price_cents|trial_days|7 dias gr[aá]tis/i,
    /supabase|DATABASE_URL|POSTGRES_URL|JWT_SECRET|RESEND_API_KEY|ADMIN_PASSWORD/i,
    /localhost|127\.0\.0\.1|\/api\/|\/app\/(?:login|onboarding)|igor_barber_club|brenogoncalves/i,
  ];
  for (const file of publicFiles) {
    assert.ok(!file.endsWith('.map'), 'Do not publish source maps');
    assert.ok(!/[\\/](?:server|api|src|\.prerender)[\\/]/.test(file));
    if (!/\.(html|js|css|xml|txt)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    for (const pattern of forbidden)
      assert.ok(!pattern.test(text), `${path.relative(output, file)} contains ${pattern}`);
  }
});

test('marketing has no server, database, authentication or parent directory dependencies', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['lucide-react', 'react', 'react-dom']);
  for (const file of await files(path.join(root, 'src'))) {
    const text = await readFile(file, 'utf8');
    assert.ok(!/(?:from|import)\s*['"]\.\.\//.test(text));
    assert.ok(
      !/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\s*[.(]/.test(text),
    );
  }
  const config = await readFile(path.join(root, 'vite.config.ts'), 'utf8');
  assert.ok(config.includes("envPrefix: 'VITE_MARKETING_'"));
  assert.ok(config.includes('envDir: root'));
});

test('Pages security and noindex rules do not block the official domain', async () => {
  const headers = await readFile(path.join(output, '_headers'), 'utf8');
  assert.ok(headers.includes("connect-src 'none'"));
  assert.ok(headers.includes("form-action 'none'"));
  assert.ok(headers.includes('https://:project.pages.dev/*'));
  assert.ok(headers.includes('https://:preview.:project.pages.dev/*'));
  assert.ok(!headers.includes('https://gradefyapp.com.br/'));
  assert.ok((await readFile(path.join(output, '404.html'), 'utf8')).includes('noindex, nofollow'));
});
