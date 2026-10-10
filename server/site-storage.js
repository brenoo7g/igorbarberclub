import { createHash } from 'node:crypto';
import { domainError } from './entitlements.js';

export const MAX_SITE_IMAGE_BYTES = 3 * 1024 * 1024;
export const assetPrefix = (companyId) =>
  `companies/${createHash('sha256').update(companyId).digest('hex')}/`;
export function assertAssetKey(companyId, key) {
  if (
    !key.startsWith(assetPrefix(companyId)) ||
    !/^companies\/[a-f0-9]{64}\/[a-f0-9-]{36}\.webp$/.test(key)
  )
    domainError(500, 'INVALID_ASSET_KEY', 'Referência de imagem inválida.');
}

// No local filesystem fallback. Credentials stay exclusively on the backend.
export function createSiteStorage(env = process.env, request = fetch) {
  if (
    env.SITE_STORAGE_PROVIDER !== 'supabase' ||
    !env.SITE_STORAGE_URL ||
    !env.SITE_STORAGE_SERVICE_KEY ||
    !env.SITE_STORAGE_BUCKET
  )
    return null;
  const url = new URL(env.SITE_STORAGE_URL);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !/^[a-zA-Z0-9_-]+$/.test(env.SITE_STORAGE_BUCKET)
  )
    throw new Error('Configuração do armazenamento de imagens inválida.');
  const base = `${url.origin}/storage/v1`,
    bucket = env.SITE_STORAGE_BUCKET;
  const headers = {
    apikey: env.SITE_STORAGE_SERVICE_KEY,
    Authorization: `Bearer ${env.SITE_STORAGE_SERVICE_KEY}`,
  };
  async function call(path, options = {}) {
    try {
      const response = await request(base + path, {
        ...options,
        headers: { ...headers, ...options.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('storage response');
      return response;
    } catch {
      domainError(
        503,
        'STORAGE_UNAVAILABLE',
        'O armazenamento de imagens está indisponível. Tente novamente.',
      );
    }
  }
  async function privateBucket() {
    if ((await (await call(`/bucket/${bucket}`)).json()).public !== false)
      domainError(
        503,
        'PRIVATE_STORAGE_REQUIRED',
        'Configure um bucket privado para as imagens do site.',
      );
  }
  const path = (key) => `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  return {
    async put(key, buffer) {
      await privateBucket();
      await call(`/object/${path(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/webp', 'x-upsert': 'false' },
        body: buffer,
      });
    },
    async read(key) {
      await privateBucket();
      const r = await call(`/object/authenticated/${path(key)}`);
      if (Number(r.headers.get('content-length')) > MAX_SITE_IMAGE_BYTES)
        domainError(503, 'STORAGE_UNAVAILABLE', 'Imagem indisponível.');
      const reader = r.body?.getReader(),
        chunks = [];
      let bytes = 0;
      if (!reader) domainError(503, 'STORAGE_UNAVAILABLE', 'Imagem indisponível.');
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_SITE_IMAGE_BYTES) {
          await reader.cancel();
          domainError(503, 'STORAGE_UNAVAILABLE', 'Imagem indisponível.');
        }
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks, bytes);
    },
    async remove(key) {
      await privateBucket();
      await call(`/object/${bucket}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [key] }),
      });
    },
  };
}

export async function normalizeSiteImage(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length)
    domainError(400, 'INVALID_IMAGE', 'Escolha uma imagem JPG, PNG ou WebP.');
  if (buffer.length > MAX_SITE_IMAGE_BYTES)
    domainError(413, 'IMAGE_TOO_LARGE', 'A imagem deve ter no máximo 3 MB.');
  const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!formats[contentType])
    domainError(400, 'INVALID_IMAGE', 'Escolha uma imagem JPG, PNG ou WebP. SVG não é permitido.');
  const magic =
    contentType === 'image/jpeg'
      ? buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : contentType === 'image/png'
        ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : buffer.subarray(0, 4).toString() === 'RIFF' &&
          buffer.subarray(8, 12).toString() === 'WEBP';
  if (!magic)
    domainError(
      400,
      'INVALID_IMAGE',
      'Não foi possível ler a imagem. Use uma foto estática válida.',
    );
  try {
    const { default: sharp } = await import('sharp');
    const source = sharp(buffer, { limitInputPixels: 16000000, failOn: 'warning' });
    const metadata = await source.metadata();
    if (metadata.format !== formats[contentType] || (metadata.pages || 1) !== 1)
      throw new Error('invalid image');
    const { data, info } = await source
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    if (data.length > MAX_SITE_IMAGE_BYTES)
      domainError(413, 'IMAGE_TOO_LARGE', 'A imagem deve ter no máximo 3 MB.');
    return { buffer: data, width: info.width, height: info.height, bytes: data.length };
  } catch (error) {
    if (error.code === 'IMAGE_TOO_LARGE') throw error;
    domainError(
      400,
      'INVALID_IMAGE',
      'Não foi possível ler a imagem. Use uma foto estática válida.',
    );
  }
}
