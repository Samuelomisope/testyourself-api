import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { AIAssistantService } from './ai-assistant.service';
import { AskUniLibDto } from './dto/ask-unilib.dto';
import { AskUniLibResponseDto } from './dto/ask-unilib-response.dto';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIAssistantController {
  constructor(private readonly aiAssistantService: AIAssistantService) {}

@Post('ask-image')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  async ask(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AskUniLibDto,
    @CurrentUser() user: AuthUser,
  ): Promise<AskUniLibResponseDto> {
    if (!file) {
      throw new BadRequestException('An image file is required');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimetype}`);
    }

    return this.aiAssistantService.askUniLib(user.sub, file, dto.question);
  }
}