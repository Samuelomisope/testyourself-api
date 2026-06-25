import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFile,  } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('quiz')
  @UseInterceptors(FileInterceptor('file'))
  async generateQuiz(
    @Body() body: { text: string; count?: number; difficulty?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: AuthUser,
  ) {
    const fileData = file ? file.buffer.toString('base64') : undefined;
    const fileMimeType = file ? file.mimetype : undefined;
    return this.aiService.generateQuiz(body.text, body.count, body.difficulty, fileData, fileMimeType);
  }

  @Post('ask')
  @UseInterceptors(FileInterceptor('file'))
  async askQuestion(
    @Body() body: { question: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: AuthUser,
  ) {
    const fileData = file ? file.buffer.toString('base64') : undefined;
    const fileMimeType = file ? file.mimetype : undefined;
    return this.aiService.askQuestion(body.question, fileData, fileMimeType);
  }

  @Post('summarize')
  @UseInterceptors(FileInterceptor('file'))
  async summarize(
    @Body() body: { text: string; style?: string },
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() _user: AuthUser,
  ) {
    const fileData = file ? file.buffer.toString('base64') : undefined;
    const fileMimeType = file ? file.mimetype : undefined;
    return this.aiService.summarize(body.text, body.style, fileData, fileMimeType);
  }

  @Post('flashcards')
@UseInterceptors(FileInterceptor('file'))
async generateFlashcards(
  @UploadedFile() file: Express.Multer.File,
  @Body() body: { text?: string; count?: string },
) {
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  return this.aiService.generateFlashcards(
    body.text,
    body.count ? parseInt(body.count) : 10,
    fileData,
    fileMimeType,
  );
}
}
