import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../prisma/prisma.service'; // adjust path to match your project
import { R2Service } from '../r2/r2.service'; // adjust path to match your project

@Injectable()
export class UploadService {
  private s3 = new S3Client({
    endpoint: process.env.R2_ENDPOINT!,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2Service: R2Service,
    @InjectPinoLogger(UploadService.name)
    private readonly logger: PinoLogger,
  ) {}

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<string> {
    const ext = file.originalname.split('.').pop();
    const key = `${folder}/${uuidv4()}.${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    // Store a stable, UNSIGNED reference. Signed URLs expire — we sign
    // fresh on every read instead, via getSignedUrlForStoredRef.
    return `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`;
  }

  extractKey(storedUrl: string): string {
    // Strip query string first — old expired signed URLs still have the
    // correct key in the path, just with stale ?X-Amz-... params attached.
    const clean = storedUrl.split('?')[0];

    if (clean.includes(`/${process.env.R2_BUCKET_NAME}/`)) {
      return clean.split(`/${process.env.R2_BUCKET_NAME}/`)[1];
    }
    if (clean.includes('.r2.cloudflarestorage.com/')) {
      return clean.split('.r2.cloudflarestorage.com/')[1];
    }
    if (clean.includes('.wasabisys.com/')) {
      const afterHost = clean.split('.wasabisys.com/')[1];
      const segments = afterHost.split('/');
      return segments[0] === 'testyourself'
        ? segments.slice(1).join('/')
        : afterHost;
    }
    return clean;
  }

  async getSignedUrlForStoredRef(storedUrl: string): Promise<string> {
    const key = this.extractKey(storedUrl);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }

  /** Hard delete — kept for cases that genuinely need it (e.g. purging the deleted/ prefix). */
  async deleteFile(url: string): Promise<void> {
    try {
      const key = this.extractKey(url);
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: key,
        }),
      );
    } catch (err) {
      this.logger.error({ err, url }, 'Failed to delete file');
    }
  }

  /** Soft-delete a Material: archive its R2 object instead of hard-deleting, and flag it in the DB. */
  async deleteMaterial(materialId: string) {
    const material = await this.prisma.material.findUniqueOrThrow({
      where: { id: materialId },
    });

    const key = this.extractKey(material.r2Key ?? material.fileUrl); // adjust to your actual field name
    await this.r2Service.softDeleteObject(key);

    await this.prisma.material.update({
      where: { id: materialId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}