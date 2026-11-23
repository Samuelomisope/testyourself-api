import { BadRequestException, Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { verifyUnsubscribeToken } from './unsubscribe-token';

@Controller('email')
export class EmailController {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  /** Public: the link in every reminder email. The signed token is the only credential. */
  @Post('unsubscribe')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async unsubscribe(@Body() body: { token?: string }) {
    const userId = typeof body?.token === 'string' && body.token.length < 2000 ? verifyUnsubscribeToken(this.jwt, body.token) : null;
    if (!userId) throw new BadRequestException('This unsubscribe link is invalid or has expired.');
    await this.prisma.user.updateMany({ where: { id: userId }, data: { emailReminders: false } });
  }
}
