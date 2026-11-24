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

/** Sent once, when a brand-new account signs in for the first time. */
export function welcomeEmail(displayName?: string | null): RenderedEmail {
  return build(`Welcome to ${BRAND.name}, ${first(displayName)}!`, {
    preheader: 'Your study materials, AI tutor and flashcards are ready.',
    heading: `Welcome to ${BRAND.name}, ${first(displayName)}`,
    paragraphs: [
      `You are in. ${BRAND.name} is where students find course materials and study together.`,
      'Here is where to start:\n- Study Materials: notes and past questions for your courses\n- UniLib AI: ask questions about your own notes\n- Flashcards: short daily reviews that stick\n- Classroom: learn a topic step by step with an AI tutor',
      'Start with the materials for the courses you are taking this semester.',
    ],
    button: { label: 'Find my course materials', url: `${BRAND.url}/study-material` },
    note: `If the button does not work, copy this link into your browser: ${BRAND.url}/study-material`,
    reason: `You are receiving this because you just created a ${BRAND.name} account.`,
  });
}

export type PremiumReceiptInput = {
  displayName?: string | null;
  /** Amount in the currency's main unit, for example 2000 for NGN 2,000. */
  amount: number;
  currency: string;
  reference: string;
  paidAt: Date;
  premiumUntil: Date;
};

const receiptDate = (date: Date) => date.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
const receiptAmount = (amount: number, currency: string) => `${currency === 'NGN' ? 'NGN' : currency} ${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Sent once per verified payment. The reference is the same one shown on the Premium page. */
export function premiumReceiptEmail(input: PremiumReceiptInput): RenderedEmail {
  return build(`Your ${BRAND.name} Premium receipt`, {
    preheader: `Payment received. Premium is active until ${receiptDate(input.premiumUntil)}.`,
    heading: 'Payment received',
    paragraphs: [
      `Thank you, ${first(input.displayName)}. Your payment went through and ${BRAND.name} Premium is now active on your account.`,
    ],
    details: [
      { label: 'Amount', value: receiptAmount(input.amount, input.currency) },
      { label: 'Paid on', value: receiptDate(input.paidAt) },
      { label: 'Premium until', value: receiptDate(input.premiumUntil) },
      { label: 'Reference', value: input.reference },
    ],
    button: { label: 'See my Premium plan', url: `${BRAND.url}/premium` },
    note: `If the button does not work, copy this link into your browser: ${BRAND.url}/premium`,
    reason: `You are receiving this because you paid for ${BRAND.name} Premium. Keep this email as your receipt.`,
  });
}

export type StudyReminderInput = {
  displayName?: string | null;
  /** Unfinished tasks in today's study plan, if the student has one. */
  plan?: { subject: string; remaining: number } | null;
  /** Flashcards due for review today. */
  dueCards?: number;
  unsubscribeUrl: string;
};

/** A short daily nudge, only sent when the student really has something to do. */
export function studyReminderEmail(input: StudyReminderInput): RenderedEmail {
  const lines: string[] = [];
  let url = BRAND.url + '/home';
  if (input.plan && input.plan.remaining > 0) {
    lines.push(`${input.plan.remaining} task${input.plan.remaining === 1 ? '' : 's'} left in today's ${input.plan.subject} study plan.`);
    url = `${BRAND.url}/study-plan`;
  }
  if (input.dueCards && input.dueCards > 0) {
    lines.push(`${input.dueCards} flashcard${input.dueCards === 1 ? '' : 's'} due for review.`);
    if (!input.plan?.remaining) url = `${BRAND.url}/flashcards`;
  }
  return build('Your study plan for today', {
    preheader: lines[0] ?? 'A few minutes today keeps your streak going.',
    heading: `Hi ${first(input.displayName)}, a quick study reminder`,
    paragraphs: [...lines, 'A few focused minutes now is easier than cramming later.'],
    button: { label: 'Continue studying', url },
    note: `If the button does not work, copy this link into your browser: ${url}`,
    reason: `You get this because you have a study plan or flashcards on ${BRAND.name}. At most one a day, and only when there is something to do.`,
    footerLink: { label: 'Unsubscribe from study reminders', url: input.unsubscribeUrl },
  });
}
