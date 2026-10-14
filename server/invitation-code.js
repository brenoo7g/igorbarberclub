// Pure codec shared by the browser and server. This is a representation of the
// existing 256-bit invitation secret, never a second credential or stored code.
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function invitationCode(token) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid invitation secret');
  let bits = 0,
    buffer = 0,
    result = '';
  for (let i = 0; i < token.length; i += 2) {
    buffer = (buffer << 8) | parseInt(token.slice(i, i + 2), 16);
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
  return result.match(/.{1,4}/g).join('-');
}
export function invitationToken(code) {
  if (typeof code !== 'string' || code.length > 160) return null;
  const normalized = code.toUpperCase().replace(/[\s-]/g, '');
  if (normalized.length !== 52) return null;
  let bits = 0,
    buffer = 0,
    token = '';
  for (const character of normalized) {
    const value = alphabet.indexOf(character);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      token += ((buffer >>> bits) & 255).toString(16).padStart(2, '0');
    }
    buffer &= (1 << bits) - 1;
  }
  // Reject noncanonical padding so each secret has one normalized spelling.
  return token.length === 64 && buffer === 0 ? token : null;
}
