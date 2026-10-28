import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { UploadService } from '../upload/upload.service';

// Field names that hold a single stored-file reference (string).
const SIGNABLE_STRING_FIELDS = ['photoURL'];
// Field names that hold an array of stored-file references (string[]).
const SIGNABLE_ARRAY_FIELDS = ['images'];

@Injectable()
export class SignedUrlInterceptor implements NestInterceptor {
  constructor(private uploadService: UploadService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(mergeMap((data) => from(this.signDeep(data))));
  }

  private looksLikeStorageUrl(value: unknown): value is string {
    if (typeof value !== 'string' || !value) return false;
    return (
      value.includes('r2.cloudflarestorage.com') ||
      value.includes('wasabisys.com') ||
      (!!process.env.R2_BUCKET_NAME && value.includes(process.env.R2_BUCKET_NAME))
    );
  }

  private async signString(value: string): Promise<string> {
    try {
      return await this.uploadService.getSignedUrlForStoredRef(value);
    } catch (err) {
      console.error('Failed to sign stored file reference:', err instanceof Error ? err.name : 'unknown error');
      return value;
    }
  }

  private isPlainObject(value: any): boolean {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !Buffer.isBuffer(value)
    );
  }

  private async signDeep(value: any, parentKey?: string, ownerId?: string): Promise<any> {
    if (value === null || value === undefined) return value;

    if (Array.isArray(value)) {
      if (parentKey && SIGNABLE_ARRAY_FIELDS.includes(parentKey)) {
        return Promise.all(
          value.map((v) => (
            this.looksLikeStorageUrl(v) && ownerId && this.uploadService.isOwnedUserUpload(v, ownerId, 'marketplace')
              ? this.signString(v)
              : v
          )),
        );
      }
      return Promise.all(value.map((v) => this.signDeep(v)));
    }

    if (this.isPlainObject(value)) {
      const entries = await Promise.all(
        Object.entries(value).map(async ([k, v]) => {
          if (SIGNABLE_STRING_FIELDS.includes(k) && this.looksLikeStorageUrl(v)) {
            const ownerId = typeof value.id === 'string' ? value.id : undefined;
            if (ownerId && this.uploadService.isOwnedProfilePhoto(v as string, ownerId)) {
              return [k, await this.signString(v as string)];
            }
            return [k, v];
          }
            return [k, await this.signDeep(v, k, typeof value.userId === 'string' ? value.userId : typeof value.id === 'string' ? value.id : ownerId)];
        }),
      );
      return Object.fromEntries(entries);
    }

    return value;
  }
}
