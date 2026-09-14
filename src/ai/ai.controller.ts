import { BadRequestException, Controller, Post, Get, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

const MAX_AI_FILE_SIZE = 15 * 1024 * 1024;
const ALLOWED_AI_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const aiFileInterceptorOptions = {
  limits: { fileSize: MAX_AI_FILE_SIZE },
  fileFilter: (_request: unknown, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
    if (!ALLOWED_AI_MIME_TYPES.has(file.mimetype)) {
      callback(new BadRequestException('Only PDF, JPEG, PNG, and WebP files are supported.'), false);
      return;
    }
    callback(null, true);
  },
};

function validateSessionId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException('Invalid session ID.');
  }
  return value;
}

function validateCount(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > maximum) {
    throw new BadRequestException(`Count must be a whole number between 1 and ${maximum}.`);
  }
  return count;
}

function validateText(value: unknown, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > 30_000) {
    throw new BadRequestException(`${field} must be text of 30,000 characters or fewer.`);
  }
  return value;
}

function validateDifficulty(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Medium';
  if (!['Easy', 'Medium', 'Hard'].includes(String(value))) {
    throw new BadRequestException('Difficulty must be Easy, Medium, or Hard.');
  }
  return String(value);
}

function validateMaterialId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException('Invalid material ID.');
  }
  return value;
}

@Controller('ai')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 15, ttl: 60_000 } })
export class AiController {
constructor(private readonly aiService: AiService) {}

@Post('quiz')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async generateQuiz(
  @Body() body: { text: string; count?: number; difficulty?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const text = validateText(body.text, 'Text');
  if (!text && !file) throw new BadRequestException('Provide text or a supported file.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  return this.aiService.generateQuiz(user.sub, text, validateCount(body.count, 5, 20), validateDifficulty(body.difficulty), fileData, fileMimeType);
}

  // Generate quiz from an existing library material
 @Post('quiz/from-material')
async generateQuizFromMaterial(
  @Body() body: { materialId: string; count?: number; difficulty?: string },
  @CurrentUser() user: AuthUser,
) {
  if (typeof body.materialId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.materialId)) {
    throw new BadRequestException('A valid material ID is required.');
  }
  return this.aiService.generateQuizFromMaterial(
    user.sub,
    body.materialId,
    validateCount(body.count, 5, 20),
    validateDifficulty(body.difficulty),
  );
}

 @Post('ask')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async askQuestion(
  @Body() body: { question: string; history?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() _user: AuthUser,
) {
  const question = validateText(body.question, 'Question');
  const history = validateText(body.history, 'History');
  if (!question && !file) throw new BadRequestException('Provide a question or a supported file.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  return this.aiService.askQuestion(question, fileData, fileMimeType, history);
}

@Post('summarize')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async summarize(
  @Body() body: { text: string; style?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const text = validateText(body.text, 'Text');
  if (!text && !file) throw new BadRequestException('Provide text or a supported file.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  const style = ['Bullet points', 'Short paragraph', 'Key terms only'].includes(body.style ?? '') ? body.style : 'Bullet points';
  return this.aiService.summarize(user.sub, text, style, fileData, fileMimeType);
}

 @Post('explain/from-material')
async explainFromMaterial(@Body() body: { materialId: string; level?: string }, @CurrentUser() user: AuthUser) {
  const materialId = validateMaterialId(body.materialId);
  if (!materialId) throw new BadRequestException('A valid material ID is required.');
  const level = ['Simple', 'Detailed', "Like I'm 5"].includes(body.level ?? '') ? body.level : 'Detailed';
  return this.aiService.explainFromMaterial(user.sub, materialId, level);
}

@Post('revision')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async generateRevisionMaterial(
  @Body() body: { text?: string; materialId?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const text = validateText(body.text, 'Text');
  const materialId = validateMaterialId(body.materialId);
  if (!text && !file && !materialId) throw new BadRequestException('Provide text, a file, or a material ID.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  return this.aiService.generateRevisionMaterial(user.sub, text, fileData, fileMimeType, materialId);
}

@Post('practice')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async generatePracticeProblems(
  @Body() body: { text?: string; count?: number; difficulty?: string; materialId?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const text = validateText(body.text, 'Text');
  const materialId = validateMaterialId(body.materialId);
  if (!text && !file && !materialId) throw new BadRequestException('Provide text, a file, or a material ID.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  return this.aiService.generatePracticeProblems(
    user.sub,
    text,
    validateCount(body.count, 5, 20),
    validateDifficulty(body.difficulty),
    fileData,
    fileMimeType,
    materialId,
  );
}
  @Post('chat')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async chat(
  @Body() body: { sessionId?: string; question: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const question = validateText(body.question, 'Question');
  const sessionId = validateSessionId(body.sessionId);
  if (!question && !file) throw new BadRequestException('Provide a question or a supported file.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  return this.aiService.chat(user.sub, sessionId, question, fileData, fileMimeType);
}

@Get('chat')
async listChatSessions(@CurrentUser() user: AuthUser) {
  return this.aiService.listChatSessions(user.sub);
}

@Get('chat/:id')
async getChatSession(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  return this.aiService.getChatSession(user.sub, validateSessionId(id)!);
}

@Post('explain')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async explain(
  @Body() body: { text: string; level?: string; continueFrom?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const text = validateText(body.text, 'Text');
  const continueFrom = validateText(body.continueFrom, 'Continuation');
  if (!text && !file && !continueFrom) throw new BadRequestException('Provide text or a supported file.');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;
  const level = ['Simple', 'Detailed', "Like I'm 5"].includes(body.level ?? '') ? body.level : 'Detailed';
  return this.aiService.explain(user.sub, text, level, fileData, fileMimeType, continueFrom || undefined);
}
@Post('study-plan')
@UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
async generateStudyPlan(
  @Body() body: { subject: string; examDate?: string; daysAvailable?: number; hoursPerDay?: number; text?: string },
  @UploadedFile() file: Express.Multer.File,
  @CurrentUser() user: AuthUser,
) {
  const subject = validateText(body.subject, 'Subject');
  if (!subject) throw new BadRequestException('Provide a subject or course to study.');
  const text = validateText(body.text, 'Text');
  const fileData = file ? file.buffer.toString('base64') : undefined;
  const fileMimeType = file ? file.mimetype : undefined;

  const daysAvailable = validateCount(body.daysAvailable, 7, 90);
  const hoursPerDay = body.hoursPerDay !== undefined ? Number(body.hoursPerDay) : 2;
  if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 12) {
    throw new BadRequestException('Hours per day must be a number between 1 and 12.');
  }

  return this.aiService.generateStudyPlan(user.sub, subject, daysAvailable, hoursPerDay, body.examDate, text, fileData, fileMimeType);
}

@Get('study-plan/current')
async getCurrentStudyPlan(@CurrentUser() user: AuthUser) {
  return this.aiService.getCurrentStudyPlan(user.sub);
}

@Get('study-plan')
async listStudyPlans(@CurrentUser() user: AuthUser) {
  return this.aiService.listStudyPlans(user.sub);
}

  @Post('flashcards')
  @UseInterceptors(FileInterceptor('file', aiFileInterceptorOptions))
  async generateFlashcards(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { text?: string; count?: string },
  ) {
    const text = validateText(body.text, 'Text');
    if (!text && !file) throw new BadRequestException('Provide text or a supported file.');
    const fileData = file ? file.buffer.toString('base64') : undefined;
    const fileMimeType = file ? file.mimetype : undefined;
    return this.aiService.generateFlashcards(
      text,
      validateCount(body.count, 10, 30),
      fileData,
      fileMimeType,
    );
  }

  @Get('generations')
async listGenerations(@Query('tool') tool: string, @CurrentUser() user: AuthUser) {
  if (!['quiz', 'explain', 'revision', 'practice', 'summarize'].includes(tool)) {
    throw new BadRequestException('Invalid tool type.');
  }
  return this.aiService.listGenerations(user.sub, tool);
}

@Get('generations/:id')
async getGeneration(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  return this.aiService.getGeneration(user.sub, id);
}
}
