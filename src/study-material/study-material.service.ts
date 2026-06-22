import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

import * as unzipper from 'unzipper';
import * as path from 'path';
import pLimit from 'p-limit';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.mp4', '.mov', '.avi', '.mkv', '.webm'];
const MAX_FILES = 200;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // same cap as your single upload
const MAX_TOTAL_UNCOMPRESSED = 1.5 * 1024 * 1024 * 1024;

function mimeTypeFor(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}


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

  async bulkUploadFromZip(
  zipBuffer: Buffer,
  opts: {
    userId: string;
    universityId: string;
    department?: string;
    level?: string;
    semester?: string;
    isPublic?: boolean;
  },
) {
  const directory = await unzipper.Open.buffer(zipBuffer);

  if (directory.files.length > MAX_FILES) {
    throw new Error(`Zip has too many files (max ${MAX_FILES})`);
  }

  const grouped = new Map<string, unzipper.File[]>();
  let totalUncompressed = 0;

  for (const entry of directory.files) {
    if (entry.type !== 'File') continue;

    const parts = entry.path.split('/').filter(Boolean);
    if (parts.some((p) => p === '..')) continue;   // zip-slip guard
    if (parts.length < 2) continue;                 // skip loose files at zip root — need folder/file

    const ext = path.extname(parts[parts.length - 1]).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) continue;

    totalUncompressed += entry.uncompressedSize ?? 0;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
      throw new Error('Zip is too large once unpacked');
    }

    const folderName = parts[0];
    if (!grouped.has(folderName)) grouped.set(folderName, []);
    grouped.get(folderName)!.push(entry);
  }

  const summary = {
    courses: [] as string[],
    uploaded: [] as { file: string; course: string }[],
    skipped: [] as { file: string; reason: string }[],
  };

  const limit = pLimit(3); // a few uploads in parallel, gentle on R2/Wasabi and your DB pool

  for (const [folderName, entries] of grouped) {
    summary.courses.push(folderName);

    await Promise.all(
      entries.map((entry) =>
        limit(async () => {
          try {
            const buffer = await entry.buffer();
            if (buffer.length > MAX_FILE_SIZE) {
              summary.skipped.push({ file: entry.path, reason: 'File too large (max 100MB)' });
              return;
            }

            const fileName = path.basename(entry.path);
            await this.create({
              title: fileName.replace(/\.[^/.]+$/, ''),
              fileBuffer: buffer,
              originalName: fileName,
              fileType: mimeTypeFor(fileName),
              fileSize: buffer.length,
              userId: opts.userId,
              universityId: opts.universityId,
              faculty: folderName,        // ← the folder name becomes the course code
              department: opts.department,
              level: opts.level,
              semester: opts.semester,
              isPublic: opts.isPublic,
            });

            summary.uploaded.push({ file: entry.path, course: folderName });
          } catch (err) {
            summary.skipped.push({ file: entry.path, reason: err.message });
          }
        }),
      ),
    );
  }

  return summary;
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