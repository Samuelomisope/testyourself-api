// courses.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  getSchools(universityId: string) {
    return this.prisma.school.findMany({
      where: { universityId },
      orderBy: { name: 'asc' },
    });
  }

  getDepartments(schoolId: string) {
    return this.prisma.department.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  getPrograms(departmentId: string) {
    return this.prisma.program.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
    });
  }

  getCourses(programId: string, search?: string) {
    return this.prisma.course.findMany({
      where: {
        programId,
        ...(search && { code: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { code: 'asc' },
    });
  }

  async createCourse(data: { programId: string; code: string; title: string; level?: string; semester?: string }) {
    const program = await this.prisma.program.findUnique({ where: { id: data.programId } });
    if (!program) throw new NotFoundException('Program not found');

    try {
      return await this.prisma.course.create({
        data: {
          programId: data.programId,
          code: data.code.trim(),
          title: data.title.trim(),
          level: data.level,
          semester: data.semester,
        },
      });
    } catch (err) {
      // Race: two users create the same (programId, code) course concurrently.
      // Return the existing row instead of a hard failure — the caller's
      // intent ("make sure this course exists") is still satisfied.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.course.findUnique({
          where: { programId_code: { programId: data.programId, code: data.code.trim() } },
        });
        if (existing) return existing;
        throw new ConflictException('Course with this code already exists in this program');
      }
      throw err;
    }
  }
}