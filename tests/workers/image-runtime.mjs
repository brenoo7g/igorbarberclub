import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import sharp from 'sharp';

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});
const base = `http://127.0.0.1:${port}/`;
const environment = { ...process.env };
environment.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = 'false';
environment.CLOUDFLARE_INCLUDE_PROCESS_ENV = 'false';
const worker = spawn(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'dev',
    '--config',
    'tests/workers/wrangler.images.jsonc',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { cwd: process.cwd(), env: environment, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '';
worker.stdout.on('data', (chunk) => (output += chunk.toString()));
worker.stderr.on('data', (chunk) => (output += chunk.toString()));
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (worker.exitCode !== null) break;
    try {
      const response = await fetch(base);
      if (response.status === 405) {
        ready = true;
        break;
      }
    } catch {
      // Wrangler has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Images Worker não iniciou. ${output.slice(-1500)}`);

  async function upload(bytes, type) {
    const response = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: bytes,
    });
    return { response, body: Buffer.from(await response.arrayBuffer()) };
  }

  for (const type of ['png', 'jpeg', 'webp']) {
    const bytes = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#ff0000' },
    })
      [type]()
      .toBuffer();
    const result = await upload(bytes, `image/${type}`);
    assert.equal(result.response.status, 200, `${type}: ${result.body.toString()}`);
    assert.equal(result.response.headers.get('content-type'), 'image/webp');
    assert.equal(result.response.headers.get('x-image-width'), '300');
    assert.equal(result.response.headers.get('x-image-height'), '200');
    assert.equal((await sharp(result.body).metadata()).format, 'webp');
  }

  const rotated = await sharp({
    create: { width: 80, height: 40, channels: 3, background: '#ff0000' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const rotatedResult = await upload(rotated, 'image/jpeg');
  assert.equal(rotatedResult.response.status, 200);
  assert.equal(rotatedResult.response.headers.get('x-image-width'), '40');
  assert.equal(rotatedResult.response.headers.get('x-image-height'), '80');
  assert.equal((await sharp(rotatedResult.body).metadata()).exif, undefined);

  const jpg = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#00ff00' } })
    .jpeg()
    .toBuffer();
  assert.equal((await upload(jpg, 'image/png')).response.status, 400);
  assert.equal((await upload(Buffer.from('not an image'), 'image/png')).response.status, 400);
  assert.equal((await upload(Buffer.alloc(3 * 1024 * 1024 + 1), 'image/png')).response.status, 413);

  const oversizedPixels = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: '#000000' },
  })
    .png()
    .toBuffer();
  assert.equal((await upload(oversizedPixels, 'image/png')).response.status, 400);

  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#0000ff' } })
    .png()
    .toBuffer();
  const apngChunk = Buffer.alloc(20);
  apngChunk.writeUInt32BE(8, 0);
  apngChunk.write('acTL', 4);
  const apng = Buffer.concat([png.subarray(0, 33), apngChunk, png.subarray(33)]);
  assert.equal((await upload(apng, 'image/png')).response.status, 400);

  const webp = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#0000ff' },
  })
    .webp()
    .toBuffer();
  const animationChunk = Buffer.alloc(8);
  animationChunk.write('ANIM', 0);
  const animatedWebp = Buffer.concat([webp, animationChunk]);
  animatedWebp.writeUInt32LE(animatedWebp.length - 8, 4);
  assert.equal((await upload(animatedWebp, 'image/webp')).response.status, 400);

  console.log(
    'Images Binding local: formatos, orientação, EXIF, tamanho, pixels e animações rejeitadas.',
  );
} finally {
  worker.kill();
}
