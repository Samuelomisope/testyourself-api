import { escapeHtml, renderEmailHtml, renderEmailText } from './email-layout';
import { adminMessageEmail, feedbackNotificationEmail, reEngagementEmail, updateAnnouncementEmail } from './email-templates';

const EVIL = `<img src=x onerror=alert(1)> "quoted" & <script>x</script>`;

describe('email templates', () => {
  it('escapes HTML characters', () => {
    expect(escapeHtml(EVIL)).not.toMatch(/[<>"]/);
  });

  it.each([
    ['re-engagement', () => reEngagementEmail(EVIL)],
    ['announcement', () => updateAnnouncementEmail({ title: EVIL, description: EVIL })],
    ['admin message', () => adminMessageEmail(EVIL, EVIL, EVIL)],
    ['feedback', () => feedbackNotificationEmail({ rating: 4, category: EVIL, message: EVIL, page: EVIL })],
  ])('%s never lets user text become markup', (_name, make) => {
    const { html } = make();
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror=alert(1)>');
  });

  it('uses the shared UniLib layout, tables only, no style block, no TestYourself wording', () => {
    for (const { html } of [reEngagementEmail('Ada'), updateAnnouncementEmail({ title: 'T', description: 'D' }), adminMessageEmail('S', 'Ada', 'M'), feedbackNotificationEmail({ rating: 5, category: 'Bug', message: 'm' })]) {
      expect(html).toContain('UniLib');
      expect(html).toContain('role="presentation"');
      expect(html).toContain('width="100%"');
      expect(html).not.toMatch(/<style/i);
      expect(html).not.toMatch(/display:\s*(flex|grid)/i);
      expect(html).not.toMatch(/TestYourself/i);
    }
  });

  it('greets by first name and falls back to "there"', () => {
    expect(reEngagementEmail('Ada Lovelace').html).toContain('Welcome back, Ada');
    expect(reEngagementEmail('').html).toContain('Welcome back, there');
    expect(adminMessageEmail('s', null, 'm').html).toContain('Hi there');
  });

  it('keeps blank-line paragraphs and line breaks of admin messages', () => {
    const { html } = adminMessageEmail('s', 'Ada', 'one\ntwo\n\nthree');
    expect(html).toContain('one<br>two');
    expect((html.match(/<p /g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('has a CTA with a link and an Outlook fallback, and a plain-text twin carrying the link', () => {
    const mail = updateAnnouncementEmail({ title: 'T', description: 'D' });
    expect(mail.html).toContain('href="https://unilib.com.ng/study-material"');
    expect(mail.html).toContain('<!--[if mso]>');
    expect(mail.text).toContain('https://unilib.com.ng/study-material');
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });

  it('internal feedback email shows details and no CTA', () => {
    const mail = feedbackNotificationEmail({ rating: 3, category: 'Idea', message: 'hi' });
    expect(mail.html).toContain('3 / 5');
    expect(mail.html).not.toContain('v:roundrect');
    expect(renderEmailText({ preheader: '', heading: 'H', paragraphs: [], details: [{ label: 'A', value: 'B' }] })).toContain('A: B');
  });

  it('quotes in a URL cannot break out of the href', () => {
    const html = renderEmailHtml({ preheader: '', heading: 'h', paragraphs: [], button: { label: 'x', url: 'https://a.b/"onmouseover="x' } });
    expect(html).not.toContain('"onmouseover=');
  });
});
