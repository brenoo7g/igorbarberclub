export const officialOrigin = 'https://gradefyapp.com.br';
const officialInstagram = 'https://www.instagram.com/gradefyapp/';

export function instagramUrl(value: string | undefined): string | null {
  if (value === undefined) return officialInstagram;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== 'https:' ||
      !['instagram.com', 'www.instagram.com'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/^\/[a-zA-Z0-9._]+\/?$/.test(url.pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

export const launchChannel = instagramUrl(import.meta.env.VITE_MARKETING_INSTAGRAM_URL);
