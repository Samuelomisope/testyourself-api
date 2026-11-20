import { attachmentDisposition, safeDownloadName } from './content-disposition';

describe('download file names', () => {
  it('adds the right extension once', () => {
    expect(safeDownloadName('Thermo notes', 'application/pdf', 'a/b.pdf')).toBe('Thermo notes.pdf');
    expect(safeDownloadName('Thermo notes.pdf', 'application/pdf', 'x')).toBe('Thermo notes.pdf');
    expect(safeDownloadName('Slides', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'k')).toBe('Slides.pptx');
  });
  it('falls back to the stored key extension, or none', () => {
    expect(safeDownloadName('X', 'weird/type', 'folder/file.DOCX')).toBe('X.docx');
    expect(safeDownloadName('X', 'weird/type', 'folder/file')).toBe('X');
  });
  it('removes characters that could break the header or the path', () => {
    const name = safeDownloadName('a"b\r\nSet-Cookie: x/../y', 'application/pdf', 'k');
    expect(name).not.toMatch(/["\r\n/\\]/);
    expect(safeDownloadName('   ', 'application/pdf', 'k')).toBe('material.pdf');
    expect(safeDownloadName('x'.repeat(500), 'application/pdf', 'k').length).toBeLessThanOrEqual(104);
  });
  it('produces a header that is plain ASCII with a UTF-8 twin', () => {
    const h = attachmentDisposition('Résumé (final).pdf');
    expect(h).toContain('attachment; filename="R_sum_ (final).pdf"');
    expect(h).toContain("filename*=UTF-8''R%C3%A9sum%C3%A9%20%28final%29.pdf");
    expect(h).not.toMatch(/[\r\n]/);
  });
});
