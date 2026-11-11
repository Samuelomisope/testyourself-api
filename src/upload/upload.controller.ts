import {
  BadRequestException, Controller, Post, UseInterceptors,
  UploadedFile, UploadedFiles, UseGuards, Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { validateUploadedFile } from '../common/file-signature';

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const uploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    const allowed = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm',
      'audio/webm', 'audio/ogg', 'audio/mp4',
    ]);
    if (!allowed.has(file.mimetype)) return cb(new BadRequestException('Unsupported upload type.'), false);
    cb(null, true);
  },
};

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder = 'general',
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('A file is required.');
    this.validateFolder(folder);
    validateUploadedFile(file);
    const url = await this.uploadService.uploadFile(file, folder, user.sub);
    return { url };
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 5, uploadOptions))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder = 'general',
    @CurrentUser() user: AuthUser,
  ) {
    if (!files?.length) throw new BadRequestException('At least one file is required.');
    this.validateFolder(folder);
    files.forEach(validateUploadedFile);
    const urls = await Promise.all(files.map((file) => this.uploadService.uploadFile(file, folder, user.sub)));
    return { urls };
  }

  private validateFolder(folder: string) {
    if (typeof folder !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(folder)) {
      throw new BadRequestException('Invalid upload folder.');
    }
  }
}
