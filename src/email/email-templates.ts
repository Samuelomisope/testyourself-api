import { BRAND, EmailContent, paragraphsFromText, renderEmailHtml, renderEmailText } from './email-layout';

export type RenderedEmail = { subject: string; html: string; text: string };

const build = (subject: string, content: EmailContent): RenderedEmail => ({ subject, html: renderEmailHtml(content), text: renderEmailText(content) });
const first = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'there';

/** Sent to people who have not been active for a while. */
export function reEngagementEmail(displayName?: string | null): RenderedEmail {
  return build('We miss you on UNILIB! 👋', {
    preheader: 'New study materials and your university community are waiting.',
    heading: `Welcome back, ${first(displayName)}`,
    paragraphs: [
      `We noticed you have not been on ${BRAND.name} lately.`,
      'Come back to find new study materials, keep up with your university community and pick up your studies where you left off.',
    ],
    button: { label: `Go back to ${BRAND.name}`, url: BRAND.url },
    note: `If the button does not work, copy this link into your browser: ${BRAND.url}`,
  });
}

/** A product update sent by an admin. The description is plain text. */
export function updateAnnouncementEmail(update: { title: string; description: string }): RenderedEmail {
  return build(`📢 ${update.title}`, {
    preheader: update.description.slice(0, 110),
    heading: update.title,
    paragraphs: paragraphsFromText(update.description),
    button: { label: 'Check it out', url: `${BRAND.url}/study-material` },
    note: `If the button does not work, copy this link into your browser: ${BRAND.url}/study-material`,
  });
}

/** A message from the UniLib team to one student, or a broadcast to everyone. The message is plain text. */
export function adminMessageEmail(subject: string, displayName: string | null | undefined, message: string): RenderedEmail {
  return build(subject, {
    preheader: message.slice(0, 110),
    heading: `Hi ${first(displayName)}`,
    paragraphs: paragraphsFromText(message),
    button: { label: `Open ${BRAND.name}`, url: BRAND.url },
  });
}

/** Sent to the team when a student submits feedback. */
export function feedbackNotificationEmail(data: { rating: number; category: string; message: string; page?: string | null }): RenderedEmail {
  return build(`New Feedback: ${data.category}`, {
    preheader: `${data.rating}/5 · ${data.message.slice(0, 90)}`,
    heading: 'New feedback received',
    paragraphs: [],
    details: [
      { label: 'Rating', value: `${data.rating} / 5` },
      { label: 'Category', value: data.category },
      { label: 'Page', value: data.page || 'Not given' },
      { label: 'Message', value: data.message },
    ],
    reason: `This is an internal notice from ${BRAND.name}.`,
  });
}
