import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type NewsStatus = 'DRAFT' | 'PUBLISHED';

interface CreateNewsInput {
  title: string;
  excerpt: string;
  body: string;
  coverImageUrl?: string;
  sourceUrl?: string;
  status?: NewsStatus;
  publishedAt?: string;
}

interface UpdateNewsInput {
  title?: string;
  excerpt?: string;
  body?: string;
  coverImageUrl?: string;
  sourceUrl?: string;
  status?: NewsStatus;
  publishedAt?: string;
}

@Injectable()
export class UniversityNewsService {
  constructor(private prisma: PrismaService) {}

  // Public feed — students only ever see PUBLISHED items, newest first
  async findPublishedForUniversity(universityId: string) {
    return this.prisma.universityNews.findMany({
      where: { universityId, status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // Admin management view — sees everything, including drafts
  async findAllForUniversityAdmin(universityId: string) {
    return this.prisma.universityNews.findMany({
      where: { universityId },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async create(universityId: string, data: CreateNewsInput) {
    return this.prisma.universityNews.create({
      data: {
        universityId,
        title: data.title,
        excerpt: data.excerpt,
        body: data.body,
        coverImageUrl: data.coverImageUrl,
        sourceUrl: data.sourceUrl,
        status: data.status ?? 'PUBLISHED',
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      },
    });
  }

  async update(id: string, data: UpdateNewsInput) {
    return this.prisma.universityNews.update({
      where: { id },
      data: {
        ...data,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.universityNews.delete({ where: { id } });
  }
}