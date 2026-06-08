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
      region: process.env.WASABI_REGION,
      endpoint: process.env.WASABI_ENDPOINT,
      credentials: {
        accessKeyId: process.env.WASABI_ACCESS_KEY!,
        secretAccessKey: process.env.WASABI_SECRET_KEY!,
      },
      forcePathStyle: true, // keep this for uploads
    });
  }

  // Generate a signed URL from a stored fileUrl
  async getSignedFileUrl(fileUrl: string): Promise<string> {
  console.log('fileUrl:', fileUrl);
  
  let key: string;
  
  // Handle both path-style and virtual-hosted URLs
  if (fileUrl.includes(`/${process.env.WASABI_BUCKET_NAME}/`)) {
    key = fileUrl.split(`/${process.env.WASABI_BUCKET_NAME}/`)[1];
  } else if (fileUrl.includes('.wasabisys.com/')) {
    key = fileUrl.split('.wasabisys.com/')[1];
  } else {
    key = fileUrl; // already a key
  }

  console.log('extracted key:', key);

  if (!key) throw new Error(`Could not extract key from fileUrl: ${fileUrl}`);

  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
  });
  return getSignedUrl(this.s3, command, { expiresIn: 3600 });
}

  // Attach signed URL to a material object
  async withSignedUrl(material: any) {
    const signedUrl = await this.getSignedFileUrl(material.fileUrl);
    return { ...material, signedUrl };
  }

  // Upload file to Wasabi
  async uploadToWasabi(buffer: Buffer, originalName: string, mimeType: string): Promise<string> {
    const key = `study-materials/${uuidv4()}-${originalName}`;
    const command = new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    });
    await this.s3.send(command);
    // Store path-style URL in DB (used to extract key later)
    return `${process.env.WASABI_ENDPOINT}/${process.env.WASABI_BUCKET_NAME}/${key}`;
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

  // Get materials uploaded by a specific user
  async findByUser(userId: string) {
    const materials = await this.prisma.studyMaterial.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    return Promise.all(materials.map(m => this.withSignedUrl(m)));
  }

  // Get one material
  async findOne(id: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    if (!material) throw new NotFoundException('Study material not found');
    return this.withSignedUrl(material);
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

  // Get all materials for a university
  async findByUniversity(universityId: string, userId: string, filters?: {
    faculty?: string;
    department?: string;
    search?: string;
  }) {
    const materials = await this.prisma.studyMaterial.findMany({
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
          { userId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    return Promise.all(materials.map(m => this.withSignedUrl(m)));
  }
}