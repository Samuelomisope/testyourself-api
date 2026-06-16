import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend = new Resend(process.env.RESEND_API_KEY);
  private readonly from = 'TestYourself <onboarding@resend.dev>'; // update with your domain

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    try {
      const result = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });
      this.logger.log(`Email sent to ${to}: ${result.data?.id}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  async sendReEngagementEmail(to: string, displayName: string) {
    return this.sendEmail(
      to,
      'We miss you on TestYourself! 👋',
      `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto;">
        <h2 style="color: #7c3aed;">Hey ${displayName}! 👋</h2>
        <p>We noticed you haven't been active on <b>TestYourself</b> lately.</p>
        <p>Come back and explore new study materials, connect with your university community, and keep your streak alive!</p>
        <a href="https://testyourself-nu.vercel.app" style="display:inline-block; margin-top:16px; padding: 12px 24px; background:#7c3aed; color:white; border-radius:8px; text-decoration:none; font-weight:bold;">
          Go Back to TestYourself
        </a>
        <p style="margin-top:24px; color:#999; font-size:12px;">If this email landed in spam, please mark it as "Not Spam" to keep receiving updates from TestYourself.</p>
      </div>
      `
    );
  }

  async sendUpdateAnnouncement(to: string, update: { title: string; description: string }) {
    return this.sendEmail(
      to,
      `📢 ${update.title}`,
      `
      <div style="font-family: sans-serif; max-width: 500px; margin: auto;">
        <h2 style="color: #7c3aed;">TestYourself Update 🚀</h2>
        <p>${update.description}</p>
        <a href="https://testyourself-nu.vercel.app/study" style="display:inline-block; margin-top:16px; padding: 12px 24px; background:#7c3aed; color:white; border-radius:8px; text-decoration:none; font-weight:bold;">
          Check it out
        </a>
        <p style="margin-top:24px; color:#999; font-size:12px;">You're receiving this because you're registered on TestYourself.</p>
      </div>
      `
    );
  }
}