export async function prepareProfileImage(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Escolha uma foto JPG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('A foto deve ter no máximo 5 MB.');
  try {
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error('Não foi possível abrir essa foto. Tente outro arquivo.'));
      reader.onabort = () =>
        reject(new Error('A leitura da foto foi interrompida. Tente novamente.'));
      reader.readAsDataURL(file);
    });
    const image = new Image();
    // Data URLs work with the site's img-src policy, including the production CSP.
    image.src = source;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    )
      throw new Error('Escolha uma foto com resolução de até 40 megapixels.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a foto. Tente novamente.');
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      256,
      256,
    );
    return canvas.toDataURL('image/webp', 0.85);
  } catch (error) {
    if (error instanceof DOMException)
      throw new Error('Não foi possível ler essa foto. Escolha outro arquivo.');
    throw error;
  }
}
