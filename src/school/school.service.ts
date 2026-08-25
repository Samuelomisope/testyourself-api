import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // adjust path to match your project
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { CreateSchoolStaffDto } from './dto/create-school-staff.dto';

@Injectable()
export class SchoolService {
  constructor(private prisma: PrismaService) {}

  // Public: list all schools under a university
  async findByUniversity(universityId: string) {
    return this.prisma.school.findMany({
      where: { universityId },
      orderBy: { name: 'asc' },
    });
  }

  // Public: single school detail with staff + departments (each with its programs)
  // NOTE: School -> Department -> Program is the live chain; School has no
  // direct `programs` relation, so that can't be included here.
  async findOne(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: {
        staff: true,
        departments: {
          orderBy: { name: 'asc' },
          include: {
            programs: {
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });

    if (!school) {
      throw new NotFoundException(`School with id ${id} not found`);
    }

    return school;
  }

  // Admin: create a school
  async create(dto: CreateSchoolDto) {
    const existing = await this.prisma.school.findFirst({
      where: { universityId: dto.universityId, code: dto.code },
    });

    if (existing) {
      throw new ConflictException(
        `School with code ${dto.code} already exists for this university`,
      );
    }

    return this.prisma.school.create({ data: dto });
  }

  // Admin: update a school
  async update(id: string, dto: UpdateSchoolDto) {
    await this.findOne(id); // throws if not found

    return this.prisma.school.update({
      where: { id },
      data: dto,
    });
  }

  // Admin: delete a school
  async remove(id: string) {
    await this.findOne(id); // throws if not found

    return this.prisma.school.delete({ where: { id } });
  }

  // Admin: add staff member to a school
  async addStaff(schoolId: string, dto: CreateSchoolStaffDto) {
    await this.findOne(schoolId); // throws if not found

    return this.prisma.schoolStaff.create({
      data: {
        ...dto,
        schoolId,
      },
    });
  }

  // Admin: remove staff member
  async removeStaff(staffId: string) {
    const staff = await this.prisma.schoolStaff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      throw new NotFoundException(`Staff member with id ${staffId} not found`);
    }

    return this.prisma.schoolStaff.delete({ where: { id: staffId } });
  }
}