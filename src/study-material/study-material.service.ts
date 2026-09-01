import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

// Fields a caller is allowed to touch via bulkUpdate. Anything else
// (userId, courseId, fileUrl, id, ...) is stripped before it reaches Prisma.
const BULK_UPDATE_ALLOWED_FIELDS = [
  'faculty',
  'department',
  'level',
  'semester',
  'course',
  'isPublic',
  'needsReview',
] as const;

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

  // ── Single source of truth for turning a stored fileUrl back into an
  // R2/Wasabi object key. Both getSignedFileUrl and deleteFromR2 (and
  // anything else that needs the key) go through this, so they can never
  // drift out of sync again. Throws instead of silently falling back to
  // "key = whole URL", since a wrong key is worse than a clear failure —
  // silently means the DB row disappears while the R2 object doesn't.
  private extractR2Key(fileUrl: string): string {
    let key: string | undefined;
    if (fileUrl.includes(`/${process.env.R2_BUCKET_NAME}/`)) {
      key = fileUrl.split(`/${process.env.R2_BUCKET_NAME}/`)[1];
    } else if (fileUrl.includes(`${process.env.R2_BUCKET_NAME}/`)) {
      key = fileUrl.split(`${process.env.R2_BUCKET_NAME}/`)[1];
    } else if (fileUrl.includes('.r2.cloudflarestorage.com/')) {
      key = fileUrl.split('.r2.cloudflarestorage.com/')[1];
    } else if (fileUrl.includes('.r2.dev/')) {
      key = fileUrl.split('.r2.dev/')[1];
    } else if (fileUrl.includes('.wasabisys.com/')) {
      const afterHost = fileUrl.split('.wasabisys.com/')[1];
      const segments = afterHost.split('/');
      key = segments[0] === 'testyourself' ? segments.slice(1).join('/') : afterHost;
    }

    if (!key) {
      throw new Error(`Could not extract R2 key from fileUrl: ${fileUrl}`);
    }
    return key;
  }

  async getSignedFileUrl(fileUrl: string): Promise<string> {
    let key: string;
    try {
      key = this.extractR2Key(fileUrl);
    } catch {
      // Bad/unrecognized stored URL is a data problem, not a client error —
      // but callers should still get a clean 404 rather than an unhandled 500.
      throw new NotFoundException('Stored file reference is invalid');
    }
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

  // ── Resolve a real Course row from typed classification fields ──────
  // Matches on: course code (case-insensitive) + level + semester, scoped
  // to the material's university, then confirms the typed "department"
  // value against the course's Department — accepting a match on the
  // Department's own name, OR its parent School's full name, OR the
  // School's short code (e.g. "SIMME") — for either the course's primary
  // Program or one of its cross-listed programs (via ProgramCourse).
  // Returns null — never guesses — if nothing matches, so callers can
  // fall back to needsReview instead of silently mis-filing a material.
  private async resolveCourseId(input: {
    universityId: string;
    departmentName?: string | null;
    courseCode?: string | null;
    level?: string | null;
    semester?: string | null;
  }): Promise<string | null> {
    if (!input.departmentName || !input.courseCode || !input.level || !input.semester) {
      return null;
    }

    const code = input.courseCode.trim();
    const typed = input.departmentName.trim().toLowerCase();

    const candidates = await this.prisma.course.findMany({
      where: {
        code: { equals: code, mode: 'insensitive' },
        level: input.level,
        semester: input.semester,
        program: {
          department: {
            school: { universityId: input.universityId },
          },
        },
      },
      include: {
        program: { include: { department: { include: { school: true } } } },
        crossListedIn: {
          include: { program: { include: { department: { include: { school: true } } } } },
        },
      },
    });

    
    const matchesTyped = (dept: {
      name: string;
      school: { name: string; code: string };
    }): boolean => {
      const deptName = dept.name.trim().toLowerCase();
      const schoolName = dept.school.name.trim().toLowerCase();
      const schoolCode = dept.school.code.trim().toLowerCase();
      return typed === deptName || typed === schoolName || typed === schoolCode;
    };

    for (const c of candidates) {
      if (matchesTyped(c.program.department)) return c.id;
      for (const pc of c.crossListedIn) {
        if (matchesTyped(pc.program.department)) return c.id;
      }
    }


    return null;
  }


  private isPathSafe(entryPath: string): boolean {
    if (entryPath.startsWith('/') || entryPath.includes('\\')) return false;
    const parts = entryPath.split('/').filter(Boolean);
    return !parts.some((p) => p === '..');
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

    const summary = {
      courses: [] as string[],
      uploaded: [] as { file: string; course: string }[],
      skipped: [] as { file: string; reason: string }[],
    };

    const grouped = new Map<string, unzipper.File[]>();
    let totalUncompressed = 0;
    let consideredFileCount = 0; // real, filterable files — not raw zip entries

    for (const entry of directory.files) {
      if (entry.type !== 'File') continue;

      if (!this.isPathSafe(entry.path)) {
        summary.skipped.push({ file: entry.path, reason: 'Unsafe path in zip entry' });
        continue;
      }

      const parts = entry.path.split('/').filter(Boolean);
      if (parts.length < 2) {
        summary.skipped.push({ file: entry.path, reason: 'File is not inside a course folder' });
        continue;
      }

      const ext = path.extname(parts[parts.length - 1]).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        summary.skipped.push({ file: entry.path, reason: `Unsupported file type (${ext || 'no extension'})` });
        continue;
      }

      consideredFileCount++;
      if (consideredFileCount > MAX_FILES) {
        throw new BadRequestException(`Zip has too many files (max ${MAX_FILES})`);
      }

      totalUncompressed += entry.uncompressedSize ?? 0;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
        throw new BadRequestException('Zip is too large once unpacked');
      }

      const folderName = parts[0];
      if (!grouped.has(folderName)) grouped.set(folderName, []);
      grouped.get(folderName)!.push(entry);
    }

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
                faculty: folderName,
                department: opts.department,
                level: opts.level,
                semester: opts.semester,
                course: folderName,
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
    const key = this.extractR2Key(fileUrl);
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
    course?: string;
    isPublic?: boolean;
  }) {
    const fileUrl = await this.uploadToR2(data.fileBuffer, data.originalName, data.fileType);

    try {
      const courseId = await this.resolveCourseId({
        universityId: data.universityId,
        departmentName: data.department,
        courseCode: data.course,
        level: data.level,
        semester: data.semester,
      });

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
          course: data.course,
          courseId: courseId ?? undefined,
          isPublic: data.isPublic ?? true,
          needsReview: !data.faculty || !data.department || !data.semester || !data.level || !courseId,
        },
        include: {
          user: { select: { displayName: true, photoURL: true } },
          courseRef: { include: { program: { include: { department: { include: { school: true } } } } } },
        },
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
    } catch (err) {
      // The DB write (or the activity log write) failed after the file was
      // already durably stored in R2. Without this, the object is orphaned
      // forever — nothing in the DB points to it, so it can never be found
      // or cleaned up later. Best-effort delete; if even that fails, at
      // least surface both errors instead of swallowing the leak silently.
      try {
        await this.deleteFromR2(fileUrl);
      } catch (cleanupErr) {
        err.message = `${err.message} (additionally failed to clean up orphaned R2 object: ${cleanupErr.message})`;
      }
      throw err;
    }
  }

  // ── UPDATE metadata (owner only) ─────────────────────────────
  async update(id: string, userId: string, data: {
    title?: string;
    description?: string;
    faculty?: string;
    course?: string;
    department?: string;
    level?: string;
    semester?: string;
    isPublic?: boolean;
  }) {
    const material = await this.prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Study material not found');
    if (material.userId !== userId) throw new ForbiddenException('Not your material');

    // Only re-resolve courseRef when a field that affects classification
    // was actually touched — leaves title/description-only edits alone.
    const touchingClassification =
      data.faculty !== undefined ||
      data.department !== undefined ||
      data.level !== undefined ||
      data.semester !== undefined ||
      data.course !== undefined;

    let resolvedCourseId: string | null | undefined = undefined;
    if (touchingClassification) {
      resolvedCourseId = await this.resolveCourseId({
        universityId: material.universityId,
        departmentName: data.department ?? material.department,
        courseCode: data.course ?? material.course,
        level: data.level ?? material.level,
        semester: data.semester ?? material.semester,
      });
    }

    const updated = await this.prisma.studyMaterial.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.faculty !== undefined && { faculty: data.faculty }),
        ...(data.course !== undefined && { course: data.course }),
        ...(data.department !== undefined && { department: data.department }),
        ...(data.level !== undefined && { level: data.level }),
        ...(data.semester !== undefined && { semester: data.semester }),
        ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
        // Editing classification always re-decides courseRef: matched id,
        // or explicit null to clear a stale/no-longer-valid link rather
        // than silently leaving the old one in place.
        ...(touchingClassification && { courseId: resolvedCourseId }),
        ...(touchingClassification && { needsReview: !resolvedCourseId }),
      },
      include: {
        user: { select: { displayName: true, photoURL: true } },
        university: { select: { id: true, name: true, shortName: true } },
        courseRef: { include: { program: { include: { department: { include: { school: true } } } } } },
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
    return Promise.all(materials.map((m) => this.withSignedUrl(m)));
  }

  // ── Single-material fetch, now visibility-checked ────────────
  // Previously returned ANY material (including private ones owned by
  // someone else) to ANY caller who knew or guessed its id, complete
  // with a signed download URL. Now mirrors the same visibility rule
  // findByUniversity already enforces: public, or owned by the caller.
  async findOne(id: string, userId: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    if (!material) throw new NotFoundException('Study material not found');
    if (!material.isPublic && material.userId !== userId) {
      throw new ForbiddenException('Not your material');
    }
    return this.withSignedUrl(material);
  }

  // ── Same visibility rule as findOne. Previously ungated, so anyone
  // could confirm a private material's existence and bump its counter
  // purely by guessing/enumerating ids.
  async incrementDownload(id: string, userId: string) {
    const material = await this.prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Study material not found');
    if (!material.isPublic && material.userId !== userId) {
      throw new ForbiddenException('Not your material');
    }
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
    course?: string;
    search?: string;
  }) {
    const materials = await this.prisma.studyMaterial.findMany({
      where: {
        universityId,
        ...(filters?.faculty && { faculty: filters.faculty }),
        ...(filters?.department && { department: filters.department }),
        ...(filters?.level && { level: filters.level }),
        ...(filters?.semester && { semester: filters.semester }),
        ...(filters?.course && { course: filters.course }),
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
    return Promise.all(materials.map((m) => this.withSignedUrl(m)));
  }

  // ── bulkUpdate now (1) verifies the caller owns every id in the batch,
  // instead of blindly updating whatever ids were sent, and (2) whitelists
  // which fields can be written, so a caller can't smuggle userId,
  // courseId, fileUrl, id, etc. through the untyped `data` bag.
  // If this endpoint is meant to be admin-only, keep the controller-level
  // admin guard too — this check is what stops a compromised/careless
  // controller route from turning into a mass-ownership-bypass bug.
  async bulkUpdate(ids: string[], userId: string, data: Record<string, any>) {
    if (!ids?.length) throw new BadRequestException('No files selected');

    const owned = await this.prisma.studyMaterial.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    });
    if (owned.length !== ids.length) {
      throw new NotFoundException('One or more materials not found');
    }
    if (owned.some((m) => m.userId !== userId)) {
      throw new ForbiddenException('You do not own all selected materials');
    }

    const safeData: Record<string, any> = {};
    for (const field of BULK_UPDATE_ALLOWED_FIELDS) {
      if (data[field] !== undefined) safeData[field] = data[field];
    }
    if (Object.keys(safeData).length === 0) {
      throw new BadRequestException('No valid fields to update');
    }

    return this.prisma.studyMaterial.updateMany({
      where: { id: { in: ids } },
      data: safeData,
    });
  }

  async findNeedsReview() {
    const materials = await this.prisma.studyMaterial.findMany({
      where: { needsReview: true },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { displayName: true, photoURL: true } } },
    });
    return Promise.all(materials.map((m) => this.withSignedUrl(m)));
  }

  async resolveReview(id: string, data: {
    department: string;
    level: string;
    semester: string;
    faculty: string; // frontend uses this field for course code, per ReviewRow's "faculty" state key
  }) {
    const material = await this.prisma.studyMaterial.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Study material not found');

    const courseId = await this.resolveCourseId({
      universityId: material.universityId,
      departmentName: data.department,
      courseCode: data.faculty, // see param comment above — "faculty" holds the course code here
      level: data.level,
      semester: data.semester,
    });

    return this.prisma.studyMaterial.update({
      where: { id },
      data: {
        department: data.department,
        level: data.level,
        semester: data.semester,
        faculty: data.faculty,
        courseId: courseId ?? undefined,
        needsReview: false,
      },
    });
  }
}