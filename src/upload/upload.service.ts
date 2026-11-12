import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

  async uploadFile(file: Express.Multer.File, folder: string, ownerId: string): Promise<string> {
    if (!ownerId || !/^[a-z0-9_-]{1,80}$/i.test(folder)) throw new BadRequestException('Invalid upload owner or folder.');
    const ext = file.originalname.split('.').pop();
    const safeExt = ext && /^[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : 'bin';
    const key = `users/${ownerId}/${folder}/${randomUUID()}.${safeExt}`;

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

  /** Classroom-only upload path that lets the caller persist the private key before writing to R2. */
  createOwnedUploadKey(fileName: string, folder: string, ownerId: string): string {
    if (!ownerId || !/^[a-z0-9_-]{1,80}$/i.test(folder)) throw new BadRequestException('Invalid upload owner or folder.');
    const ext = fileName.split('.').pop();
    const safeExt = ext && /^[a-z0-9]{1,10}$/i.test(ext) ? ext.toLowerCase() : 'bin';
    return `users/${ownerId}/${folder}/${randomUUID()}.${safeExt}`;
  }

  async uploadToOwnedKey(file: Express.Multer.File, key: string, folder: string, ownerId: string): Promise<void> {
    this.assertOwnedKey(key, folder, ownerId);
    await this.s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
  }

  async deleteOwnedKey(key: string, folder: string, ownerId: string): Promise<void> {
    this.assertOwnedKey(key, folder, ownerId);
    // Deliberately propagates storage failures so callers can retain a retryable tombstone.
    await this.s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  }

  async downloadOwnedKey(key: string, folder: string, ownerId: string): Promise<Buffer> {
    this.assertOwnedKey(key, folder, ownerId);
    const response = await this.s3.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
    return this.streamToBuffer(response.Body as NodeJS.ReadableStream);
  }

  private assertOwnedKey(key: string, folder: string, ownerId: string) {
    const prefix = `users/${ownerId}/${folder}/`;
    if (!ownerId || !/^[a-z0-9_-]{1,80}$/i.test(folder) || !key.startsWith(prefix) || key.includes('..')) {
      throw new BadRequestException('Invalid private upload reference.');
    }
  }

  extractKey(storedUrl: string): string {
  // Strip query string first — old expired signed URLs still have the
  // correct key in the path, just with stale ?X-Amz-... params attached.
  const clean = storedUrl.split('?')[0];

  // Public R2 dev URL: pub-<hash>.r2.dev/<key> — no bucket segment in the
  // path, the bucket is implied by the pub-<hash> subdomain.
  if (clean.includes('.r2.dev/')) {
    return clean.split('.r2.dev/')[1];
  }

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

  isOwnedProfilePhoto(storedUrl: string, ownerId: string): boolean {
    return this.isOwnedUserUpload(storedUrl, ownerId, 'profile-pictures') ||
      this.isOwnedUserUpload(storedUrl, ownerId, 'profile');
  }

  /**
   * Older profile photos used a shared `profile/<filename>` key instead of
   * the owner-scoped path. Permit signing only image files in that exact
   * legacy prefix so old avatars continue to render without exposing other
   * objects in the bucket.
   */
  isLegacyProfilePhoto(storedUrl: string): boolean {
    try {
      const endpoint = new URL(process.env.R2_ENDPOINT!);
      const candidate = new URL(storedUrl);
      const bucketPrefix = `${endpoint.pathname.replace(/\/$/, '')}/${process.env.R2_BUCKET_NAME}/`;
      if (candidate.origin !== endpoint.origin || !candidate.pathname.startsWith(bucketPrefix)) return false;
      const key = decodeURIComponent(candidate.pathname.slice(bucketPrefix.length));
      return /^profile\/[^/]{1,180}\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(key);
    } catch {
      return false;
    }
  }

  isOwnedUserUpload(storedUrl: string, ownerId: string, folder: string): boolean {
    try {
      const endpoint = new URL(process.env.R2_ENDPOINT!);
      const candidate = new URL(storedUrl);
      const bucketPrefix = `${endpoint.pathname.replace(/\/$/, '')}/${process.env.R2_BUCKET_NAME}/`;
      if (candidate.origin !== endpoint.origin || !candidate.pathname.startsWith(bucketPrefix)) return false;
      const key = decodeURIComponent(candidate.pathname.slice(bucketPrefix.length));
      return key.startsWith(`users/${ownerId}/${folder}/`);
    } catch {
      return false;
    }
  }

  isStorageReference(value: string): boolean {
    return value.includes('.r2.cloudflarestorage.com/') || value.includes('.r2.dev/') ||
      value.includes('.wasabisys.com/') || (!!process.env.R2_BUCKET_NAME && value.includes(process.env.R2_BUCKET_NAME));
  }
  async getSignedUrlForStoredRef(storedUrl: string): Promise<string> {
    const key = this.extractKey(storedUrl);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    return getSignedUrl(this.s3, command, { expiresIn: 3600 });
  }

  /**
   * Downloads a stored file's raw bytes — needed by ClassificationService for hashing
   * (duplicate detection) and, later, text extraction/OCR. Unlike getSignedUrlForStoredRef,
   * this reads the object directly server-side rather than handing back a URL.
   */
  async downloadFile(storedUrl: string): Promise<Buffer> {
    const key = this.extractKey(storedUrl);
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    const response = await this.s3.send(command);
    return this.streamToBuffer(response.Body as NodeJS.ReadableStream);
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
    }
    return Buffer.concat(chunks);
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
