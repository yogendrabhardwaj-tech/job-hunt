/**
 * Branded transactional emails. Table-based layout with inline styles, because email clients (Gmail, Outlook,
 * Apple Mail) ignore stylesheets and most modern CSS. The logo is drawn with HTML, not an image: Gmail strips
 * SVG, and images from a local or private server never load for the recipient.
 */

export const BRAND = {
  name: 'Job Hunt Agency',
  color: '#4f46e5', // brand-600
  colorDark: '#4338ca',
  tint: '#eef2ff', // brand-50
  ink: '#0f172a',
  body: '#334155',
  muted: '#64748b',
  line: '#e2e8f0',
  page: '#f1f5f9',
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The page frame every email shares: logo header, white card, footer. */
function layout({ preheader, body, footer }: { preheader: string; body: string; footer: string }) {
  const b = BRAND;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(b.name)}</title>
</head>
<body style="margin:0;padding:0;background:${b.page};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${b.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

      <!-- logo -->
      <tr><td style="padding:0 4px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="36" height="36" align="center" valign="middle" bgcolor="${b.color}"
              style="width:36px;height:36px;border-radius:9px;background:${b.color};background-image:linear-gradient(135deg,#6366f1,${b.colorDark});font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">JH</td>
          <td style="padding-left:10px;font-family:${FONT};font-size:16px;font-weight:600;color:${b.ink};letter-spacing:-0.01em;">${esc(b.name)}</td>
        </tr></table>
      </td></tr>

      <!-- card -->
      <tr><td style="background:#ffffff;border:1px solid ${b.line};border-radius:14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:${b.color};background-image:linear-gradient(90deg,#6366f1,${b.colorDark});border-radius:14px 14px 0 0;">&nbsp;</td></tr>
          <tr><td style="padding:32px 32px 28px;font-family:${FONT};">${body}</td></tr>
        </table>
      </td></tr>

      <!-- footer -->
      <tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${b.muted};text-align:center;">${footer}</td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** The 6-digit sign-in / sign-up code email. */
export function codeEmail({ code, purpose, to, appUrl }: { code: string; purpose: 'login' | 'signup'; to: string; appUrl?: string }) {
  const b = BRAND;
  const signup = purpose === 'signup';
  const heading = signup ? 'Confirm your email' : 'Your sign-in code';
  const intro = signup
    ? `Welcome to ${b.name}. Enter this code to finish creating your account.`
    : `Enter this code to sign in to ${b.name}.`;
  const host = appUrl ? appUrl.replace(/^https?:\/\//, '') : '';
  const subject = signup ? `${code} is your ${b.name} confirmation code` : `${code} is your ${b.name} sign-in code`;
  const spaced = `${code.slice(0, 3)}&nbsp;${code.slice(3)}`;

  const body = `
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:600;color:${b.ink};letter-spacing:-0.01em;">${heading}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:${b.body};">${esc(intro)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr><td align="center" style="background:${b.tint};border:1px solid #e0e7ff;border-radius:12px;padding:22px 12px;">
    <div style="font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:34px;line-height:1;font-weight:700;letter-spacing:0.18em;color:${b.ink};">${spaced}</div>
    <div style="margin-top:10px;font-size:12px;line-height:1.4;color:${b.muted};">Expires in 10&nbsp;minutes</div>
  </td></tr>
</table>

${
  appUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;"><tr>
  <td bgcolor="${b.ink}" style="border-radius:8px;background:${b.ink};">
    <a href="${esc(appUrl)}/${signup ? 'signup' : 'login'}" style="display:inline-block;padding:11px 18px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Open ${esc(b.name)} &rarr;</a>
  </td></tr></table>`
    : ''
}

<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid ${b.line};font-size:13px;line-height:1.55;color:${b.muted};">
  Didn’t ask for this? You can safely ignore this email. Nobody can ${signup ? 'create an account' : 'sign in'} without the code, and we’ll never ask you to share it.
</p>`;

  const footer = `Sent to ${esc(to)} by ${esc(b.name)}${host ? ` &middot; <a href="${esc(appUrl!)}" style="color:${b.muted};text-decoration:underline;">${esc(host)}</a>` : ''}<br>
Your AI career agent: match scores, tailored resumes and interview prep.`;

  const text = [
    `${heading}`,
    '',
    intro,
    '',
    `    ${code}`,
    '',
    'This code expires in 10 minutes.',
    appUrl ? `Open ${b.name}: ${appUrl}/${signup ? 'signup' : 'login'}` : '',
    '',
    `Didn't ask for this? You can safely ignore this email. Nobody can ${signup ? 'create an account' : 'sign in'} without the code.`,
    '',
    `— ${b.name}`,
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');

  return { subject, html: layout({ preheader: `${code} — ${signup ? 'confirm your email' : 'your sign-in code'}. Expires in 10 minutes.`, body, footer }), text };
}
