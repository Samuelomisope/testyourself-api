import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StudyMaterialService {
  private s3: S3Client;

  constructor(private prisma: PrismaService) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!,
      },
      forcePathStyle: true,
    });
  }

  async getSignedFileUrl(fileUrl: string): Promise<string> {
    let key: string;
    if (fileUrl.includes(`/${process.env.R2_BUCKET_NAME}/`)) {
      key = fileUrl.split(`/${process.env.R2_BUCKET_NAME}/`)[1];
    } else if (fileUrl.includes('.r2.cloudflarestorage.com/')) {
      key = fileUrl.split('.r2.cloudflarestorage.com/')[1];
   } else if (fileUrl.includes('.wasabisys.com/')) {
  const afterHost = fileUrl.split('.wasabisys.com/')[1];
  const segments = afterHost.split('/');
  key = segments[0] === 'testyourself' ? segments.slice(1).join('/') : afterHost;
} else {
      key = fileUrl;
    }
    if (!key) throw new Error(`Could not extract key from fileUrl: ${fileUrl}`);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }

  async withSignedUrl(material: any) {
    const signedUrl = await this.getSignedFileUrl(material.fileUrl);
    return { ...material, signedUrl };
  }

  async uploadToR2(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const key = `study-materials/${uuidv4()}-${originalName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });
    await this.s3.send(command);
    return `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;
  }

  async deleteFromR2(fileUrl: string): Promise<void> {
    let key: string;
    if (fileUrl.includes(`${process.env.R2_BUCKET_NAME}/`)) {
      key = fileUrl.split(`${process.env.R2_BUCKET_NAME}/`)[1];
    } else if (fileUrl.includes('.wasabisys.com/')) {
      key = fileUrl.split('.wasabisys.com/')[1];
    } else {
      key = fileUrl;
    }
    const command = new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    await this.s3.send(command);
  }

  async create(data: {
    title: string;
    description?: string;
    fileBuffer: Buffer;
    originalName: string;
    fileType: string;
    fileSize: number;
    userId: string;
    universityId: string;
    faculty?: string;
    department?: string;
    level?: string;
    semester?: string;
    isPublic?: boolean;
  }) {
    const fileUrl = await this.uploadToR2(data.fileBuffer, data.originalName, data.fileType);
    const material = await this.prisma.studyMaterial.create({
      data: {
        title: data.title,
        description: data.description,
        fileUrl,
        fileType: data.fileType,
        fileSize: data.fileSize,
        userId: data.userId,
        universityId: data.universityId,
        faculty: data.faculty,
        department: data.department,
        level: data.level,
        semester: data.semester,
        isPublic: data.isPublic ?? true,
      },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    await this.prisma.activityLog.create({
      data: {
        userId: data.userId,
        type: 'upload',
        description: `Uploaded "${data.title}"`,
        href: '/study-material',
      },
    });
    return this.withSignedUrl(material);
  }

  // ── UPDATE metadata (owner only) ─────────────────────────────
  async update(id: string, userId: string, data: {
    title?: string;
    description?: string;
    faculty?: string;
    department?: string;
    level?: string;
    semester?: string;
    isPublic?: boolean;
  }) {
    const material = await this.prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Study material not found');
    if (material.userId !== userId) throw new ForbiddenException('Not your material');

    const updated = await this.prisma.studyMaterial.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.faculty !== undefined && { faculty: data.faculty }),
        ...(data.department !== undefined && { department: data.department }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.semester !== undefined && { semester: data.semester }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
      },
      include: {
        user: { select: { displayName: true, photoURL: true } },
        university: { select: { id: true, name: true, shortName: true } },
      },
    });
    return this.withSignedUrl(updated);
  }

  async findByUser(userId: string) {
    const materials = await this.prisma.studyMaterial.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    return Promise.all(materials.map(m => this.withSignedUrl(m)));
  }

  async findOne(id: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    if (!material) throw new NotFoundException('Study material not found');
    return this.withSignedUrl(material);
  }

  async incrementDownload(id: string) {
    return this.prisma.studyMaterial.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
  }

  async delete(id: string, userId: string) {
    const material = await this.prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Study material not found');
    if (material.userId !== userId) throw new ForbiddenException('Not your material');
    await this.deleteFromR2(material.fileUrl);
    return this.prisma.studyMaterial.delete({ where: { id } });
  }

  async findByUniversity(universityId: string, userId: string, filters?: {
    faculty?: string;
    department?: string;
    level?: string;
    semester?: string;
    search?: string;
  }) {
    const materials = await this.prisma.studyMaterial.findMany({
      where: {
        universityId,
        ...(filters?.faculty && { faculty: filters.faculty }),
        ...(filters?.department && { department: filters.department }),
        ...(filters?.level && { level: filters.level }),
        ...(filters?.semester && { semester: filters.semester }),
        ...(filters?.search && {
          OR: [
            { title: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
        OR: [{ isPublic: true }, { userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    return Promise.all(materials.map(m => this.withSignedUrl(m)));
  }
}