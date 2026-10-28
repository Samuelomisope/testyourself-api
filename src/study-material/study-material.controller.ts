import {
  Controller, Get, Post, Patch, Delete, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Body,
  BadRequestException, NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudyMaterialService } from './study-material.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { validateUploadedFile } from '../common/file-signature';

const MAX_MATERIAL_UPLOAD_SIZE = 100 * 1024 * 1024;
const materialFileOptions = {
  limits: { fileSize: MAX_MATERIAL_UPLOAD_SIZE },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
    const types = new Set([
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'video/x-matroska', 'video/webm', 'application/octet-stream',
    ]);
    if (!types.has(file.mimetype)) return callback(new BadRequestException('Unsupported file type.'), false);
    callback(null, true);
  },
};

@Controller('study-material')
@UseGuards(JwtAuthGuard)
export class StudyMaterialController {
  constructor(
    private readonly studyMaterialService: StudyMaterialService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('needs-review')
  @UseGuards(AdminGuard)
  async findNeedsReview() {
    return this.studyMaterialService.findNeedsReview();
  }

@Post('upload')
@UseInterceptors(FileInterceptor('file', materialFileOptions))
async upload(
  @UploadedFile() file: Express.Multer.File,
  @Body() body: {
    title: string;
    description?: string;
    faculty?: string;
    department?: string;
    level?: string;
    semester?: string;
    course?: string;
    courseId?: string;   // ← new
    isPublic?: string;
    university?: string;
  },
  @CurrentUser() currentUser: AuthUser,
) {
  const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
  if (!user) throw new NotFoundException('User not found');
  if (!file) throw new BadRequestException('No file provided');
  if (file.size > 100 * 1024 * 1024) throw new BadRequestException('File too large. Maximum size is 100MB.');
  validateUploadedFile(file);

  let universityId = user.universityId;
  if (body.university) {
    const uniName = Array.isArray(body.university) ? body.university[0] : body.university;
    const uni = await this.prisma.university.findFirst({
      where: {
        OR: [
          { name: { equals: uniName, mode: 'insensitive' } },
          { shortName: { equals: uniName, mode: 'insensitive' } },
        ],
      },
    });
    if (uni) universityId = uni.id;
  }

  if (!universityId) throw new BadRequestException('University not found. Please set your university in your profile.');

  return this.studyMaterialService.create({
    title: body.title,
    description: body.description,
    fileBuffer: file.buffer,
    originalName: file.originalname,
    fileType: file.mimetype,
    fileSize: file.size,
    userId: user.id,
    universityId,
    faculty: body.faculty,
    department: body.department,
    level: body.level,
    semester: body.semester,
    course: body.course,
    courseId: body.courseId,   // ← new
    isPublic: body.isPublic !== 'false',
  });
}

  @Get()
  async findAll(
    @CurrentUser() currentUser: AuthUser,
    @Query('faculty') faculty?: string,
    @Query('department') department?: string,
    @Query('level') level?: string,
    @Query('semester') semester?: string,
    @Query('course') course?: string,
    @Query('search') search?: string,
    @Query('university') universitySlug?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user) return [];

    const materials = await this.prisma.studyMaterial.findMany({
      where: {
        ...(faculty && { faculty }),
        ...(department && { department }),
        ...(level && { level }),
        ...(semester && { semester }),
        ...(course && { course }),
        ...(universitySlug && { university: { slug: universitySlug } }),
      
        AND: [
          ...(search
            ? [{
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { description: { contains: search, mode: 'insensitive' as const } },
                  { faculty: { contains: search, mode: 'insensitive' as const } },
                  { department: { contains: search, mode: 'insensitive' as const } },
                  { course: { contains: search, mode: 'insensitive' as const } },
                ],
              }]
            : []),
          {
            OR: [
              { isPublic: true },
              { userId: user.id },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, photoURL: true } },
        university: { select: { id: true, name: true, shortName: true, slug: true } },
        courseRef: {
          include: {
            program: {
              include: {
                department: {
                  include: {
                    school: true,
                  }
                }
              }
            }
          }
        }
      }
    });

    return Promise.all(materials.map(m => this.studyMaterialService.withSignedUrl(m)));
  }

  @Get('my')
  async findMine(@CurrentUser() currentUser: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user) return [];
    return this.studyMaterialService.findByUser(user.id);
  }
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user) throw new NotFoundException('User not found');
    await this.studyMaterialService.incrementDownload(id, user.id);
    return this.studyMaterialService.findOne(id, user.id);
  }

@Patch(':id')
async update(
  @Param('id') id: string,
  @Body() body: {
    title?: string;
    description?: string;
    faculty?: string;
    department?: string;
    level?: string;
    semester?: string;
    course?: string;
    courseId?: string | null;   // ← new
    isPublic?: string;
  },
  @CurrentUser() currentUser: AuthUser,
) {
  const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
  if (!user) throw new NotFoundException('User not found');
  return this.studyMaterialService.update(id, user.id, {
    title: body.title,
    description: body.description,
    faculty: body.faculty,
    department: body.department,
    level: body.level,
    semester: body.semester,
    course: body.course,
    courseId: body.courseId,   // ← new
    isPublic: body.isPublic === undefined ? undefined : body.isPublic !== 'false',
  });
}

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user) throw new NotFoundException('User not found');
    return this.studyMaterialService.delete(id, user.id);
  }

@Post('bulk-upload')
@UseInterceptors(FileInterceptor('zipFile', {
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
    if (!['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype)) {
      return callback(new BadRequestException('A ZIP archive is required.'), false);
    }
    callback(null, true);
  },
}))
async bulkUpload(
  @UploadedFile() file: Express.Multer.File,
  @Body() body: {
    programId?: string;
    universityId?: string;   // ← add this
    level?: string;
    semester?: string;
    isPublic?: string;
    university?: string;
  },
  @CurrentUser() currentUser: AuthUser,
) {
  const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
  if (!user) throw new NotFoundException('User not found');
  if (!file) throw new BadRequestException('No zip file provided');
  if (!file.buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new BadRequestException('Uploaded file is not a valid ZIP archive.');
  }
  if (!body.programId) throw new BadRequestException('Program is required for bulk upload.');

  let universityId = body.universityId || user.universityId;   // ← prefer explicit id
  if (!body.universityId && body.university) {
    const uniName = Array.isArray(body.university) ? body.university[0] : body.university;
    const uni = await this.prisma.university.findFirst({
      where: {
        OR: [
          { name: { equals: uniName, mode: 'insensitive' } },
          { shortName: { equals: uniName, mode: 'insensitive' } },
        ],
      },
    });
    if (uni) universityId = uni.id;
  }
  if (!universityId) throw new BadRequestException('University not found. Please set your university in your profile.');

  return this.studyMaterialService.bulkUploadFromZip(file.buffer, {
    userId: user.id,
    universityId,
    programId: body.programId,
    level: body.level,
    semester: body.semester,
    isPublic: body.isPublic !== 'false',
  });
}

  @Patch('bulk')
  async bulkUpdate(
    @Body() dto: { ids: string[]; data: Partial<{
      faculty: string; department: string; level: string; semester: string; course: string; isPublic: boolean;
    }> },
    @CurrentUser() currentUser: AuthUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user) throw new NotFoundException('User not found');
    return this.studyMaterialService.bulkUpdate(dto.ids, user.id, dto.data);
  }

  @Patch(':id/resolve-review')
  @UseGuards(AdminGuard)
  async resolveReview(
    @Param('id') id: string,
    @Body() body: { department: string; level: string; semester: string; faculty: string },
  ) {
    return this.studyMaterialService.resolveReview(id, body);
  }
}
