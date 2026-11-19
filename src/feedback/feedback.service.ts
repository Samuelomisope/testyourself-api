import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { feedbackNotificationEmail } from '../email/email-templates';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  async create(data: { userId?: string; rating: number; category: string; message: string; page?: string }) {
    const feedback = await this.prisma.feedback.create({ data });

    const mail = feedbackNotificationEmail(data);
    await this.email.sendEmail(process.env.GMAIL_USER!, mail.subject, mail.html, mail.text);
    return feedback;

  }

  async findAll() {
    return this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, email: true } } },
    });
  }
}
