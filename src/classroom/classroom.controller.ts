import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { validateUploadedFile } from '../common/file-signature';
import { ClassroomService } from './classroom.service';
import {
  CreateClassroomSessionDto, CreateClassroomTurnDto, LinkClassroomMaterialDto,
  ListClassroomTurnsQueryDto, UpdateClassroomSessionDto,
} from './classroom.dto';

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MIME_TYPES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png', 'image/webp']);

@Controller('classroom')
@UseGuards(JwtAuthGuard)
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  @Post('sessions')
  createSession(@CurrentUser() user: AuthUser, @Body() dto: CreateClassroomSessionDto) { return this.classroom.createSession(user.sub, dto); }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    const parsed = limit === undefined ? 30 : Number(limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new BadRequestException('Limit must be between 1 and 100.');
    return this.classroom.listSessions(user.sub, parsed);
  }

  @Get('sessions/:sessionId')
  getSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string) { return this.classroom.getSession(user.sub, id); }

  @Patch('sessions/:sessionId')
  updateSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string, @Body() dto: UpdateClassroomSessionDto) { return this.classroom.updateSession(user.sub, id, dto); }

  @Delete('sessions/:sessionId')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  deleteSession(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) id: string) { return this.classroom.deleteSession(user.sub, id); }

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

  @Post('sessions/:sessionId/turns')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  createTurn(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Body() dto: CreateClassroomTurnDto) { return this.classroom.createTurn(user.sub, sid, dto); }

  @Get('sessions/:sessionId/turns')
  listTurns(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Query() query: ListClassroomTurnsQueryDto) { return this.classroom.listTurns(user.sub, sid, query.limit, query.beforeSequence); }

  @Get('sessions/:sessionId/turn-requests/:requestId')
  getTurnRequest(@CurrentUser() user: AuthUser, @Param('sessionId', ParseUUIDPipe) sid: string, @Param('requestId', ParseUUIDPipe) rid: string) { return this.classroom.getTurnRequest(user.sub, sid, rid); }
}
