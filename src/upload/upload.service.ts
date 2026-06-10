import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';



@Injectable()
export class UploadService {
  private s3 = new S3Client({
  endpoint: `https://s3.${process.env.WASABI_REGION!}.wasabisys.com`,
  region: process.env.WASABI_REGION!,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY!,
    secretAccessKey: process.env.WASABI_SECRET_KEY!,
  },
});

 async uploadFile(file: Express.Multer.File, folder: string = 'general'): Promise<string> {
  const ext = file.originalname.split('.').pop();
  const key = `${folder}/${uuidv4()}.${ext}`;

  await this.s3.send(new PutObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  }));

  const signedUrl = await getSignedUrl(
    this.s3,
    new GetObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
    }),
    { expiresIn: 60 * 60 * 24 * 7 } // 7 days
  );

  console.log('Upload URL:', signedUrl);
  return signedUrl;
}

  async deleteFile(url: string): Promise<void> {
  try {
    // Extract just the path before the query string
    const urlObj = new URL(url);
    const key = urlObj.pathname.slice(1).split('/').slice(1).join('/');
    await this.s3.send(new DeleteObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
    }));
  } catch (err) {
    console.error('Failed to delete file:', err);
  }
}
}
