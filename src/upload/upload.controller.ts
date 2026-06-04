import {
  Controller, Post, UseInterceptors,
  UploadedFile, UploadedFiles, UseGuards, Query
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

@Controller('upload')
@UseGuards(FirebaseAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // Single file upload
  @Post('single')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async uploadSingle(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string = 'general',
  ) {
    const url = await this.uploadService.uploadFile(file, folder);
    return { url };
  }

  // Multiple files upload
  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 5, { storage: memoryStorage() }))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder: string = 'general',
  ) {
    const urls = await Promise.all(
      files.map(file => this.uploadService.uploadFile(file, folder))
    );
    return { urls };
  }
}