import { createCloudflareImageProcessor } from '../../worker/image-processor.js';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    try {
      const image = await createCloudflareImageProcessor(env.IMAGES).normalize(
        Buffer.from(await request.arrayBuffer()),
        request.headers.get('content-type'),
        {
          maxBytes: 3 * 1024 * 1024,
          maxWidth: 2000,
          maxHeight: 2000,
          maxPixels: 16000000,
          fit: 'inside',
          quality: 82,
        },
      );
      return new Response(image.buffer, {
        headers: {
          'Content-Type': 'image/webp',
          'X-Image-Width': String(image.width),
          'X-Image-Height': String(image.height),
        },
      });
    } catch (error) {
      return Response.json({ code: error.code || 'IMAGE_ERROR' }, { status: error.status || 500 });
    }
  },
};
