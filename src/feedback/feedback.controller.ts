import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: { rating: number; category: string; message: string; page?: string },
  ) {
    const dbUser = await this.feedbackService['prisma'].user.findUnique({
      where: { id: user.sub },
    });
    return this.feedbackService.create({ ...body, userId: dbUser?.id });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll() {
    return this.feedbackService.findAll();
  }
}
