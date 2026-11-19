import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { reEngagementEmail, updateAnnouncementEmail } from './email-templates';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend = new Resend(process.env.RESEND_API_KEY);
  private readonly from = 'UNILIB <noreply@unilib.com.ng>';

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });
      this.logger.log(`Email sent (${result.data?.id ?? 'provider id unavailable'})`);
      return result;
    } catch (error) {
      this.logger.error(`Email delivery failed (${error instanceof Error ? error.name : 'unknown error'})`);
      throw error;
    }
  }

  async sendReEngagementEmail(to: string, displayName: string) {
    const mail = reEngagementEmail(displayName);
    return this.sendEmail(to, mail.subject, mail.html, mail.text);
  }

  async sendUpdateAnnouncement(to: string, update: { title: string; description: string }) {
    const mail = updateAnnouncementEmail(update);
    return this.sendEmail(to, mail.subject, mail.html, mail.text);
  }
}
