import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UniversitiesService {
  constructor(private prisma: PrismaService) {}

  // Get all universities
  async findAll() {
    return this.prisma.university.findMany({
      orderBy: { name: 'asc' },
    });
  }

  // Get one university by id
  async findOne(id: string) {
    return this.prisma.university.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, studyMaterials: true, marketplaceItems: true },
        },
      },
    });
  }

  // Create a university (super admin only)
  async create(data: {
    name: string;
    shortName?: string;
    country?: string;
    domain?: string;
    logoUrl?: string;
  }) {
    return this.prisma.university.create({ data });
  }

  // Update a university
  async update(id: string, data: {
    name?: string;
    shortName?: string;
    domain?: string;
    logoUrl?: string;
    isVerified?: boolean;
  }) {
    return this.prisma.university.update({ where: { id }, data });
  }

  // Seed Nigerian universities from the frontend universities.js file
  async seedNigerianUniversities(universities: string[]) {
    const created: any[] = [];
    for (const name of universities) {
      const exists = await this.prisma.university.findUnique({ where: { name } });
      if (!exists) {
        const uni = await this.prisma.university.create({
          data: { name, country: 'Nigeria' },
        });
        created.push(uni);
      }
    }
return { 
  created: created.length, 
  message: `${created.length} universities seeded`,
};
  }

  // Get university stats
  async getStats(id: string) {
    const [users, materials, listings] = await Promise.all([
      this.prisma.user.count({ where: { universityId: id } }),
      this.prisma.studyMaterial.count({ where: { universityId: id } }),
      this.prisma.marketplaceItem.count({ where: { universityId: id } }),
    ]);
    return { users, materials, listings };
  }
}