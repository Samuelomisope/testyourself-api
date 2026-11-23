// One shared layout for every UniLib email. Built the way email clients need: nested tables, inline styles, no <style>
// block, no flex/grid, no web fonts and no images beyond the logo, so it renders in Gmail, Outlook and phone clients.

export const BRAND = { name: 'UniLib', url: 'https://unilib.com.ng', logo: 'https://unilib.com.ng/favicon.png', color: '#7c3aed', dark: '#4c1d95', tagline: 'Study smarter, learn together' };

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Plain text to paragraphs: escaped, blank lines split paragraphs, single line breaks stay. */
export function paragraphsFromText(text: string): string[] {
  return String(text ?? '').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
}

export type EmailContent = {
  /** The grey preview line shown beside the subject in an inbox. Plain text. */
  preheader: string;
  heading: string;
  /** Plain text paragraphs. They are escaped here, so never pass HTML. */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** A small line under the button, such as what to do if the button does not work. Plain text. */
  note?: string;
  /** Why the person is getting this email. Plain text. */
  reason?: string;
  /** A link in the footer, such as unsubscribe. Shown as text with the URL in the plain-text version. */
  footerLink?: { label: string; url: string };
  /** Rows of label and value for internal emails, such as a feedback notice. Plain text. */
  details?: Array<{ label: string; value: string }>;
};

const p = (text: string) => `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:26px;color:#374151;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

function button(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 8px 0;"><tr><td align="center" bgcolor="${BRAND.color}" style="border-radius:10px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="20%" stroke="f" fillcolor="${BRAND.color}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(label)}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;background-color:${BRAND.color};">${escapeHtml(label)}</a><!--<![endif]-->
</td></tr></table>`;
}

function detailsTable(rows: Array<{ label: string; value: string }>): string {
  const cells = rows.map((row) => `<tr><td valign="top" style="padding:8px 12px 8px 0;font-family:${FONT};font-size:14px;line-height:20px;color:#6b7280;white-space:nowrap;">${escapeHtml(row.label)}</td><td valign="top" style="padding:8px 0;font-family:${FONT};font-size:14px;line-height:20px;color:#111827;">${escapeHtml(row.value).replace(/\n/g, '<br>')}</td></tr>`).join('');
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;border-top:1px solid #e5e7eb;">${cells}</table>`;
}

export function renderEmailHtml(content: EmailContent): string {
  const body = content.paragraphs.map(p).join('');
  const reason = content.reason ?? `You are receiving this because you have a ${BRAND.name} account.`;
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.heading)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f4f6;font-size:1px;line-height:1px;">${escapeHtml(content.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f3f4f6" style="background-color:#f3f4f6;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600"><tr><td><![endif]-->
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
<tr><td bgcolor="${BRAND.color}" style="background-color:${BRAND.color};border-radius:16px 16px 0 0;padding:20px 28px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:12px;"><img src="${BRAND.logo}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;"></td>
<td valign="middle" style="font-family:${FONT};font-size:22px;line-height:28px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">${BRAND.name}</td>
</tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:32px 28px 24px 28px;">
<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:26px;line-height:34px;font-weight:800;color:#111827;">${escapeHtml(content.heading)}</h1>
${body}${content.details?.length ? detailsTable(content.details) : ''}${content.button ? button(content.button.label, content.button.url) : ''}${content.note ? `<p style="margin:16px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:#6b7280;">${escapeHtml(content.note)}</p>` : ''}
</td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;padding:0 28px;"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:0 0 16px 16px;padding:16px 28px 28px 28px;">
<p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:20px;color:#6b7280;">${escapeHtml(reason)}</p>${content.footerLink ? `<p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:20px;color:#6b7280;"><a href="${escapeHtml(content.footerLink.url)}" style="color:#6b7280;text-decoration:underline;">${escapeHtml(content.footerLink.label)}</a></p>` : ''}
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:#6b7280;"><a href="${BRAND.url}" style="color:${BRAND.color};text-decoration:none;font-weight:600;">${BRAND.name}</a> &middot; ${escapeHtml(BRAND.tagline)} &middot; <a href="${BRAND.url}/privacy" style="color:#6b7280;text-decoration:underline;">Privacy</a> &middot; <a href="${BRAND.url}/terms" style="color:#6b7280;text-decoration:underline;">Terms</a></p>
<p style="margin:12px 0 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:#9ca3af;">If this email landed in spam, mark it as "Not spam" so you keep getting updates from ${BRAND.name}.</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`;
}

/** The plain-text twin of the same email, for clients and filters that prefer it. */
export function renderEmailText(content: EmailContent): string {
  const lines = [content.heading, '', ...content.paragraphs.flatMap((part) => [part, ''])];
  if (content.details?.length) lines.push(...content.details.map((row) => `${row.label}: ${row.value}`), '');
  if (content.button) lines.push(`${content.button.label}: ${content.button.url}`, '');
  if (content.note) lines.push(content.note, '');
  lines.push('--', content.reason ?? `You are receiving this because you have a ${BRAND.name} account.`, ...(content.footerLink ? [`${content.footerLink.label}: ${content.footerLink.url}`] : []), `${BRAND.name} - ${BRAND.tagline} - ${BRAND.url}`);
  return lines.join('\n');
}
