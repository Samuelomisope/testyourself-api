import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(FirebaseAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('quiz')
  async generateQuiz(
    @Body() body: { text: string; count?: number; difficulty?: string },
    @CurrentUser() _user: FirebaseUser,
  ) {
    return this.aiService.generateQuiz(body.text, body.count, body.difficulty);
  }

  @Post('ask')
  async askQuestion(
    @Body() body: { question: string },
    @CurrentUser() _user: FirebaseUser,
  ) {
    return this.aiService.askQuestion(body.question);
  }

  @Post('summarize')
  async summarize(
    @Body() body: { text: string; style?: string },
    @CurrentUser() _user: FirebaseUser,
  ) {
    return this.aiService.summarize(body.text, body.style);
  }
}
