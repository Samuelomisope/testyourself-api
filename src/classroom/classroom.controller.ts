import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe,
  Patch, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { validateUploadedFile } from '../common/file-signature';
import type { Response } from 'express';
import { ClassroomService } from './classroom.service';
import { ClassroomVideosService } from './classroom-videos.service';
import { ClassroomSpeechService } from './speech/classroom-speech.service';
import {
  CreateClassroomSessionDto, CreateClassroomTurnDto, LinkClassroomMaterialDto,
  ListClassroomTurnsQueryDto, ResumePositionDto, SpeechRequestDto, SubmitAssessmentAttemptDto, UpdateClassroomSessionDto,
} from './classroom.dto';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MIME_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png', 'image/webp']);

@Controller('classroom')
@UseGuards(JwtAuthGuard)
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService, private readonly speech: ClassroomSpeechService, private readonly videos: ClassroomVideosService) {}

  @Post('sessions')
  createSession(@CurrentUser() user: AuthUser, @Body() dto: CreateClassroomSessionDto) { return this.classroom.createSession(user.sub, dto); }

  @Get('usage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  usage(@CurrentUser() user: AuthUser) { return this.classroom.usage(user.sub); }

  @Get('progress')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  listProgress(@CurrentUser() user: AuthUser, @Query('limit') limit?: string, @Query('before') before?: string) {
    const parsed = limit === undefined ? 30 : Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new BadRequestException('Limit must be between 1 and 100.');
    return this.classroom.listProgress(user.sub, parsed, before);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const parsed = limit === undefined ? 30 : Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new BadRequestException('Limit must be between 1 and 100.');
    return this.classroom.listSessions(user.sub, parsed);
  }

  @Get('sessions/:sessionId')
  getSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string) { return this.classroom.getSession(user.sub, id); }

  @Put('sessions/:sessionId/resume')
  @HttpCode(204)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async saveResume(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Body() dto: ResumePositionDto) { await this.classroom.saveResume(user.sub, id, dto); }

  @Post('sessions/:sessionId/steps/:stepIndex/assessment')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  getAssessment(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Param('stepIndex', ParseIntPipe) stepIndex: number) { return this.classroom.getAssessment(user.sub, id, stepIndex); }

  @Post('sessions/:sessionId/assessments/:assessmentId/attempts')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submitAttempt(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Param('assessmentId', ParseUUIDPipe) assessmentId: string, @Body() dto: SubmitAssessmentAttemptDto) { return this.classroom.submitAssessmentAttempt(user.sub, id, assessmentId, dto); }

  @Get('sessions/:sessionId/assessments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  listAssessments(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string) { return this.classroom.listAssessments(user.sub, id); }

  @Patch('sessions/:sessionId')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  updateSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Body() dto: UpdateClassroomSessionDto) { return this.classroom.updateSession(user.sub, id, dto); }

  @Delete('sessions/:sessionId')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  deleteSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string) { return this.classroom.deleteSession(user.sub, id); }

  @Get('sessions/:sessionId/videos')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  videoSuggestions(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Query('step') step?: string) {
    return this.videos.suggest(user.sub, id, this.parseStep(step));
  }

  @Post('sessions/:sessionId/videos/:videoId/report')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  reportVideo(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Param('videoId') videoId: string, @Query('step') step?: string) {
    return this.videos.report(user.sub, id, videoId, this.parseStep(step));
  }

  private parseStep(step?: string) {
    if (step === undefined) return undefined;
    const parsed = Number(step);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 50) throw new BadRequestException('Step must be a whole number between 0 and 50.');
    return parsed;
  }

  @Get('sessions/:sessionId/documents')
  listDocuments(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string) { return this.classroom.listDocuments(user.sub, id); }

  @Post('sessions/:sessionId/documents')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: MAX_FILE_BYTES },
    fileFilter: (_req, file, cb) => MIME_TYPES.has(file.mimetype) ? cb(null, true) : cb(new BadRequestException('Unsupported classroom document type.'), false),
  }))
  uploadDocument(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('A document is required.');
    validateUploadedFile(file);
    return this.classroom.uploadDocument(user.sub, id, file);
  }

  @Post('sessions/:sessionId/documents/:documentId/retry')
  retryDocument(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Param('documentId', ParseUUIDPipe) did: string) { return this.classroom.retryDocument(user.sub, sid, did); }

  @Delete('sessions/:sessionId/documents/:documentId')
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  deleteDocument(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Param('documentId', ParseUUIDPipe) did: string) { return this.classroom.deleteDocument(user.sub, sid, did); }

  @Post('sessions/:sessionId/materials')
  linkMaterial(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Body() dto: LinkClassroomMaterialDto) { return this.classroom.linkMaterial(user.sub, sid, dto); }

  @Post('sessions/:sessionId/plan')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  generatePlan(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string) { return this.classroom.generatePlan(user.sub, sid); }

  @Post('sessions/:sessionId/turns')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  createTurn(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Body() dto: CreateClassroomTurnDto) { return this.classroom.createTurn(user.sub, sid, dto); }

  @Get('sessions/:sessionId/turns')
  listTurns(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Query() query: ListClassroomTurnsQueryDto) { return this.classroom.listTurns(user.sub, sid, query.limit, query.beforeSequence); }

  @Get('sessions/:sessionId/turn-requests/:requestId')
  getTurnRequest(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Param('requestId', ParseUUIDPipe) rid: string) { return this.classroom.getTurnRequest(user.sub, sid, rid); }

  @Post('sessions/:sessionId/speech')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  async speak(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Body() dto: SpeechRequestDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.speech.synthesize(user.sub, sid, dto.text, dto.voice);
    res.set({ 'Content-Type': result.contentType, 'Cache-Control': 'no-store' });
    return new StreamableFile(result.audio);
  }
}
