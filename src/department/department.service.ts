import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private prisma: PrismaService) {}

  // Public: list departments under a school
  async findBySchool(schoolId: string) {
    return this.prisma.department.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }

  // Public: single department detail with its programs
  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        programs: { orderBy: { name: 'asc' } },
      },
    });

    if (!department) {
      throw new NotFoundException(`Department with id ${id} not found`);
    }

    return department;
  }

  // Admin: create a department
  async create(dto: CreateDepartmentDto) {
    const existing = await this.prisma.department.findFirst({
      where: { schoolId: dto.schoolId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Department "${dto.name}" already exists under this school`,
      );
    }

    return this.prisma.department.create({ data: dto });
  }

  // Admin: update a department
  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id); // throws if not found

    return this.prisma.department.update({
      where: { id },
      data: dto,
    });
  }

  // Admin: delete a department
  async remove(id: string) {
    await this.findOne(id); // throws if not found

    return this.prisma.department.delete({ where: { id } });
  }
}