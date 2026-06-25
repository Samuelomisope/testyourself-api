import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService, private email: EmailService) {}

  async create(data: { userId?: string; rating: number; category: string; message: string; page?: string }) {
    const feedback = await this.prisma.feedback.create({ data });

    await this.email.sendEmail(
  process.env.GMAIL_USER!,
  `New Feedback: ${data.category}`,
  `<p><b>Rating:</b> ${data.rating}/5</p>
   <p><b>Category:</b> ${data.category}</p>
   <p><b>Message:</b> ${data.message}</p>
   <p><b>Page:</b> ${data.page || 'N/A'}</p>`
);
    return feedback;

  }

  async findAll() {
    return this.prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, email: true } } },
    });
  }
}
