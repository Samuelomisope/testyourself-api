import { Injectable } from '@nestjs/common';
import {
  S3Client,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class R2Service {
  private s3 = new S3Client({
    endpoint: process.env.R2_ENDPOINT!,
    region: 'auto',
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY!,
      secretAccessKey: process.env.R2_SECRET_KEY!,
    },
  });

  private bucket = process.env.R2_BUCKET_NAME!;

  /** Move an object to a deleted/ prefix instead of hard-deleting it. */
  async softDeleteObject(key: string): Promise<string> {
    const deletedKey = `deleted/${Date.now()}-${key}`;

    await this.s3.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${key}`,
        Key: deletedKey,
      }),
    );

    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    return deletedKey; // store this if you want a restore path
  }
}
