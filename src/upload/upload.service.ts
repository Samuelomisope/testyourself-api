import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
      ACL: 'public-read',
    }));

  const url = `https://${process.env.WASABI_BUCKET_NAME}.s3.${process.env.WASABI_REGION}.wasabisys.com/${key}`;
console.log('Upload URL:', url);
return url;
  }

  async deleteFile(url: string): Promise<void> {
    try {
      const key = url.split(`${process.env.WASABI_BUCKET_NAME}/`)[1];
      await this.s3.send(new DeleteObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME,
        Key: key,
      }));
    } catch (err) {
      console.error('Failed to delete file:', err);
    }

    
  }
}
