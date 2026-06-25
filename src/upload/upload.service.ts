import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

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

  async uploadFile(file: Express.Multer.File, folder: string = 'general'): Promise<string> {
    const ext = file.originalname.split('.').pop();
    const key = `${folder}/${uuidv4()}.${ext}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));

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
      return segments[0] === 'testyourself' ? segments.slice(1).join('/') : afterHost;
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

  async deleteFile(url: string): Promise<void> {
    try {
      const key = this.extractKey(url);
      await this.s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      }));
    } catch (err) {
      console.error('Failed to delete file:', err);
    }
  }
}
