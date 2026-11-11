import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RagService } from './rag.service';

@Controller('search')
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('ask')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  ask(@Body() body: { question?: unknown; courseId?: unknown }, @CurrentUser() user: AuthUser) {
    if (typeof body.question !== 'string' || body.question.trim().length < 3 || body.question.length > 1000) {
      throw new BadRequestException('Question must be between 3 and 1,000 characters.');
    }
    if (body.courseId !== undefined && (typeof body.courseId !== 'string' || body.courseId.length > 100)) {
      throw new BadRequestException('Invalid course filter.');
    }
    return this.ragService.ask(user.sub, body.question.trim(), body.courseId as string | undefined);
  }
}
