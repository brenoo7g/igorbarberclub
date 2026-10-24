const plain = (value) =>
  String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export const escapeEmail = (value) =>
  plain(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const emailSubject = (value) =>
  plain(value)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 240);

export function emailTemplate({
  subject,
  title,
  greeting,
  paragraphs = [],
  details = [],
  action,
  footer = 'Se precisar de ajuda, entre em contato com o estabelecimento.',
}) {
  const origin = new URL(process.env.APP_URL || action?.url || 'http://localhost:5173');
  if (action) {
    const destination = new URL(action.url);
    if (
      destination.origin !== origin.origin ||
      destination.username ||
      destination.password ||
      !['https:', 'http:'].includes(destination.protocol)
    )
      throw new Error('Destino de e-mail inválido.');
  }
  const text = [
    greeting,
    '',
    ...paragraphs,
    '',
    ...details.map(([key, value]) => `${key}: ${plain(value)}`),
    '',
    ...(action ? [action.label + ':', action.url, ''] : []),
    footer,
    '',
    'Enviado pelo Gradefy.',
  ].join('\n');
  const e = escapeEmail;
  const logo = new URL('/gradefy/logo-mark.png', origin).href;
  return {
    subject: emailSubject(subject),
    text,
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title></head><body style="margin:0;background:#090D18;color:#F8FAFC;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#090D18"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#121827;border:1px solid #303553;border-radius:20px"><tr><td style="padding:28px 24px;border-bottom:2px solid #6C5CE7"><img src="${e(logo)}" width="36" height="36" alt="" style="vertical-align:middle;margin-right:10px"><strong style="font-size:25px;color:#F8FAFC">Gradefy</strong></td></tr><tr><td style="padding:28px 24px"><h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;color:#F8FAFC">${e(title)}</h1><p style="color:#F8FAFC;line-height:1.6">${e(greeting)}</p>${paragraphs.map((p) => `<p style="color:#CBD5E1;line-height:1.6">${e(p)}</p>`).join('')}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#090D18;border-radius:12px">${details.map(([key, value]) => `<tr><td style="padding:12px 14px;color:#94A3B8;font-size:14px;vertical-align:top">${e(key)}</td><td style="padding:12px 14px;color:#F8FAFC;font-size:14px;overflow-wrap:anywhere">${e(value)}</td></tr>`).join('')}</table>${action ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-top:26px"><a href="${e(action.url)}" style="display:block;background:#6C5CE7;border:1px solid #00D4FF;border-radius:12px;padding:17px 18px;color:#FFFFFF;font-size:16px;font-weight:bold;text-decoration:none">${e(action.label)}</a></td></tr></table>` : ''}<p style="margin-top:28px;color:#94A3B8;font-size:13px;line-height:1.6">${e(footer)}</p></td></tr><tr><td style="padding:20px 24px;border-top:1px solid #303553;color:#94A3B8;font-size:12px;text-align:center">Gradefy · Sua agenda, seu ritmo.</td></tr></table></td></tr></table></body></html>`,
  };
}
