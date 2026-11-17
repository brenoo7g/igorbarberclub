const formats = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const invalid = (status = 400, code = 'INVALID_IMAGE') =>
  Object.assign(new Error('Não foi possível ler uma imagem estática válida.'), { status, code });

function assertStaticHeader(buffer, contentType) {
  const expected = formats[contentType];
  if (!expected || !Buffer.isBuffer(buffer) || !buffer.length) throw invalid();
  if (expected === 'jpeg') {
    if (buffer.length < 4 || !buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
      throw invalid();
    return expected;
  }
  if (expected === 'png') {
    if (
      buffer.length < 33 ||
      !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw invalid();
    let offset = 8;
    let ended = false;
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > buffer.length) throw invalid();
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'acTL') throw invalid(); // APNG: do not silently keep its first frame.
      offset = end;
      if (type === 'IEND') {
        ended = true;
        break;
      }
    }
    if (!ended || offset !== buffer.length) throw invalid();
    return expected;
  }
  if (
    buffer.length < 20 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP' ||
    buffer.readUInt32LE(4) + 8 !== buffer.length
  )
    throw invalid();
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + length + (length & 1);
    if (end > buffer.length) throw invalid();
    if (type === 'ANIM' || type === 'ANMF') throw invalid();
    if (type === 'VP8X' && length >= 1 && buffer[offset + 8] & 0x02) throw invalid();
    offset = end;
  }
  if (offset !== buffer.length) throw invalid();
  return expected;
}

function stream(buffer) {
  return new Blob([new Uint8Array(buffer)]).stream();
}

export function createCloudflareImageProcessor(images) {
  if (!images?.input || !images?.info)
    throw new Error('Cloudflare Images Binding não configurado.');
  return {
    async normalize(buffer, contentType, policy) {
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw invalid();
      if (buffer.length > policy.maxBytes) throw invalid(413, 'IMAGE_TOO_LARGE');
      const expected = assertStaticHeader(buffer, contentType);
      try {
        const info = await images.info(stream(buffer));
        const actual = String(info.format || '')
          .toLowerCase()
          .replace(/^image\//, '')
          .replace('jpg', 'jpeg');
        if (
          actual !== expected ||
          !Number.isSafeInteger(info.width) ||
          !Number.isSafeInteger(info.height) ||
          info.width < 1 ||
          info.height < 1 ||
          info.width * info.height > policy.maxPixels
        )
          throw invalid();
        const result = await images
          .input(stream(buffer))
          .transform({
            width: policy.maxWidth,
            height: policy.maxHeight,
            fit: policy.fit === 'cover' ? 'cover' : 'scale-down',
          })
          .output({ format: 'image/webp', quality: policy.quality, anim: false });
        const response = await result.response();
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/webp')
          throw invalid();
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > policy.maxBytes) throw invalid(413, 'IMAGE_TOO_LARGE');
        if (
          bytes.length < 12 ||
          bytes.toString('ascii', 0, 4) !== 'RIFF' ||
          bytes.toString('ascii', 8, 12) !== 'WEBP'
        )
          throw invalid();
        const output = await images.info(stream(bytes));
        if (
          output.width < 1 ||
          output.height < 1 ||
          output.width > policy.maxWidth ||
          output.height > policy.maxHeight
        )
          throw invalid();
        return { buffer: bytes, width: output.width, height: output.height, bytes: bytes.length };
      } catch (error) {
        if (error.code === 'IMAGE_TOO_LARGE' || error.code === 'INVALID_IMAGE') throw error;
        throw invalid();
      }
    },
  };
}
