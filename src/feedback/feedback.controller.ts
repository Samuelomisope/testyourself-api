import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(FirebaseAuthGuard)
  async create(
    @CurrentUser() user: FirebaseUser,
    @Body() body: { rating: number; category: string; message: string; page?: string },
  ) {
    const dbUser = await this.feedbackService['prisma'].user.findUnique({
      where: { firebaseUid: user.uid },
    });
    return this.feedbackService.create({ ...body, userId: dbUser?.id });
  }

  @Get()
  @UseGuards(FirebaseAuthGuard)
  async findAll() {
    return this.feedbackService.findAll();
  }
}