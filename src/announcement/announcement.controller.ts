import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin')
export class AnnouncementController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  @Post('broadcast')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async broadcast(@Body() body: { title: string; description: string }) {
    const users = await this.prisma.user.findMany({ select: { email: true } });

    for (const user of users) {
      await this.emailService.sendUpdateAnnouncement(user.email, body);
      await new Promise(r => setTimeout(r, 200));
    }

    return { sent: users.length };
  }

  @Post('broadcast/single')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async broadcastSingle(@Body() body: { email: string; title: string; description: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new Error(`No user found with email ${body.email}`);

    await this.emailService.sendUpdateAnnouncement(body.email, body);
    return { message: 'Email sent', email: body.email };
  }
}
