import {
  Controller, Get, Post, Patch, Delete, Param, Query,
  UseGuards, UseInterceptors, UploadedFile, Body
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StudyMaterialService } from './study-material.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('study-material')
@UseGuards(FirebaseAuthGuard)
export class StudyMaterialController {
  constructor(
    private readonly studyMaterialService: StudyMaterialService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      title: string;
      description?: string;
      faculty?: string;
      department?: string;
      level?: string;
      semester?: string;
      isPublic?: string;
      university?: string;
    },
    @CurrentUser() currentUser: FirebaseUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    if (!file) throw new Error('No file provided');
    if (file.size > 100 * 1024 * 1024) throw new Error('File too large. Maximum size is 100MB.');

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

    if (!universityId) throw new Error('University not found. Please set your university in your profile.');

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
      isPublic: body.isPublic !== 'false',
    });
  }

  @Get()
  async findAll(
    @CurrentUser() currentUser: FirebaseUser,
    @Query('faculty') faculty?: string,
    @Query('department') department?: string,
    @Query('level') level?: string,
    @Query('semester') semester?: string,
    @Query('search') search?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) return [];

    const materials = await this.prisma.studyMaterial.findMany({
      where: {
        ...(faculty && { faculty }),
        ...(department && { department }),
        ...(level && { level }),
        ...(semester && { semester }),
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { faculty: { contains: search, mode: 'insensitive' } },
            { department: { contains: search, mode: 'insensitive' } },
          ],
        }),
        OR: [
          { isPublic: true },
          { userId: user.id },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { displayName: true, photoURL: true } },
        university: { select: { id: true, name: true, shortName: true } },
      },
    });

    return Promise.all(materials.map(m => this.studyMaterialService.withSignedUrl(m)));
  }

  @Get('my')
  async findMine(@CurrentUser() currentUser: FirebaseUser) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) return [];
    return this.studyMaterialService.findByUser(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    await this.studyMaterialService.incrementDownload(id);
    return this.studyMaterialService.findOne(id);
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
      isPublic?: string;
    },
    @CurrentUser() currentUser: FirebaseUser,
  ) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    return this.studyMaterialService.update(id, user.id, {
      title: body.title,
      description: body.description,
      faculty: body.faculty,
      department: body.department,
      level: body.level,
      semester: body.semester,
      isPublic: body.isPublic === undefined ? undefined : body.isPublic !== 'false',
    });
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @CurrentUser() currentUser: FirebaseUser) {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid: currentUser.uid } });
    if (!user) throw new Error('User not found');
    return this.studyMaterialService.delete(id, user.id);
  }
}