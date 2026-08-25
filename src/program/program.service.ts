import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';

@Injectable()
export class ProgramService {
  constructor(private prisma: PrismaService) {}

  // Public: list programs under a department
  async findByDepartment(departmentId: string) {
    return this.prisma.program.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
    });
  }

  // Public: single program detail with its courses
async findOne(id: string) {
  const program = await this.prisma.program.findUnique({
    where: { id },
    include: {
      courses: { orderBy: { code: 'asc' } },
      crossListedCourses: { include: { course: true } },
    },
  });

  if (!program) {
    throw new NotFoundException(`Program with id ${id} not found`);
  }

  const crossListedCourses = program.crossListedCourses.map((pc) => pc.course);
  return {
    ...program,
    courses: [...program.courses, ...crossListedCourses],
  };
}

  // Admin: cross-list an existing course to additional programs
  async crossListCourse(courseId: string, programIds: string[]) {
    const results: any[] = [];
    for (const programId of programIds) {
      const existing = await this.prisma.programCourse.findUnique({
        where: { programId_courseId: { programId, courseId } },
      });
      if (existing) continue;
      results.push(
        await this.prisma.programCourse.create({ data: { programId, courseId } }),
      );
    }
    return results;
  }

  // Admin: create a program
  async create(dto: CreateProgramDto) {
    const existing = await this.prisma.program.findFirst({
      where: { departmentId: dto.departmentId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Program "${dto.name}" already exists under this department`,
      );
    }

    return this.prisma.program.create({ data: dto });
  }
  // Admin: update a program
  async update(id: string, dto: UpdateProgramDto) {
    await this.findOne(id); // throws if not found

    return this.prisma.program.update({
      where: { id },
      data: dto,
    });
  }

  // Admin: delete a program
  async remove(id: string) {
    await this.findOne(id); // throws if not found

    return this.prisma.program.delete({ where: { id } });
  }
}