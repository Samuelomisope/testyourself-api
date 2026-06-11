import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    return this.transporter.sendMail({
      from: `"TestYourself" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });
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
        <a href="https://your-app-url.com" style="display:inline-block; margin-top:16px; padding: 12px 24px; background:#7c3aed; color:white; border-radius:8px; text-decoration:none; font-weight:bold;">
          Go Back to TestYourself
        </a>
        <p style="margin-top:24px; color:#999; font-size:12px;">If this email landed in spam, please mark it as "Not Spam" to keep receiving updates from TestYourself.</p>
      </div>
      `
    );
  }
}