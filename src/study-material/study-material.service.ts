import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StudyMaterialService {
  private s3: S3Client;

  constructor(private prisma: PrismaService) {
    this.s3 = new S3Client({
      region: process.env.WASABI_REGION,
      endpoint: process.env.WASABI_ENDPOINT,
      credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY!,
        secretAccessKey: process.env.WASABI_SECRET_KEY!,
      },
    });
  }

  // Upload file to Wasabi
  async uploadToWasabi(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const key = `study-materials/${uuidv4()}-${originalName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ACL: 'public-read',
    });
    await this.s3.send(command);
    return `https://${process.env.WASABI_BUCKET_NAME}.s3.${process.env.WASABI_REGION}.wasabisys.com/${key}`;
  }

  // Delete file from Wasabi
  async deleteFromWasabi(fileUrl: string): Promise<void> {
    const key = fileUrl.split(`${process.env.WASABI_BUCKET_NAME}/`)[1];
    const command = new DeleteObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
    });
    await this.s3.send(command);
  }

  // Create study material
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
  isPublic?: boolean;
}) {
  const fileUrl = await this.uploadToWasabi(data.fileBuffer, data.originalName, data.fileType);

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
      isPublic: data.isPublic ?? true,
    },
    include: { user: { select: { displayName: true, photoURL: true } } },
  });

  // Log activity — must be BEFORE return
  await this.prisma.activityLog.create({
    data: {
      userId: data.userId,
      type: 'upload',
      description: `Uploaded "${data.title}"`,
      href: '/study-material',
    },
  });

  return material;
}

  // Get all materials for a university
async findByUniversity(universityId: string, userId: string, filters?: {
  faculty?: string;
  department?: string;
  search?: string;
}) {
  return this.prisma.studyMaterial.findMany({
    where: {
      universityId,
      ...(filters?.faculty && { faculty: filters.faculty }),
      ...(filters?.department && { department: filters.department }),
      ...(filters?.search && {
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      OR: [
        { isPublic: true },
        { userId: userId }, // show private files only to owner
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { displayName: true, photoURL: true } } },
  });
}
  // Get materials uploaded by a specific user
  async findByUser(userId: string) {
    return this.prisma.studyMaterial.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
  }

  // Get one material
  async findOne(id: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    if (!material) throw new NotFoundException('Study material not found');
    return material;
  }

  // Increment download count
  async incrementDownload(id: string) {
    return this.prisma.studyMaterial.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
  }

  // Delete material
  async delete(id: string, userId: string) {
    const material = await this.prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Study material not found');
    if (material.userId !== userId) throw new ForbiddenException('Not your material');
    await this.deleteFromWasabi(material.fileUrl);
    return this.prisma.studyMaterial.delete({ where: { id } });
  }
}