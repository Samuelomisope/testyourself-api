// Builds the Content-Disposition value for a real download. The file name comes from user-entered titles, so it is
// stripped of anything that could break the header (quotes, slashes, line breaks) before use.
const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf', pdf: 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt', 'video/mp4': 'mp4', 'image/png': 'png', 'image/jpeg': 'jpg',
};

export function safeDownloadName(title: string, fileType: string, key: string): string {
  const fromKey = /\.([a-z0-9]{2,5})$/i.exec(key)?.[1]?.toLowerCase();
  const ext = EXT_BY_MIME[(fileType || '').toLowerCase()] ?? fromKey ?? '';
  const base = String(title || 'material')
    .replace(/[\u0000-\u001f\u007f"\\/<>:*?|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'material';
  const hasExt = ext && base.toLowerCase().endsWith(`.${ext}`);
  return ext && !hasExt ? `${base}.${ext}` : base;
}

export function attachmentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
