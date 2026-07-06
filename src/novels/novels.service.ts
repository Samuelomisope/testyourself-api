import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Genre } from '@prisma/client';
import { CreateNovelDto, CreateEpisodeDto } from './dto/create-novel.dto';

@Injectable()
export class NovelsService {
  constructor(private prisma: PrismaService) {}

  getGenres() {
    return Object.values(Genre);
  }

  async create(authorId: string, dto: CreateNovelDto) {
    return this.prisma.novel.create({
      data: { ...dto, authorId },
    });
  }

  async addEpisode(novelId: string, authorId: string, dto: CreateEpisodeDto) {
    const novel = await this.prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) throw new NotFoundException('Novel not found');
    if (novel.authorId !== authorId) throw new ForbiddenException('Not your novel');

    const lastEpisode = await this.prisma.episode.findFirst({
      where: { novelId },
      orderBy: { episodeNumber: 'desc' },
    });

    return this.prisma.episode.create({
      data: {
        ...dto,
        novelId,
        episodeNumber: (lastEpisode?.episodeNumber ?? 0) + 1,
        releasedAt: dto.isPublished ? new Date() : null,
      },
    });
  }

  async getEpisode(episodeId: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: { novel: { select: { id: true, title: true, authorId: true } } },
    });
    if (!episode || !episode.isPublished) throw new NotFoundException('Episode not found');
    return episode;
  }

  async myNovels(authorId: string) {
    return this.prisma.novel.findMany({
      where: { authorId },
      include: { _count: { select: { episodes: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findAll(genre?: string, page = 1, limit = 12) {
    return this.prisma.novel.findMany({
      where: {
        isHidden: false,
        ...(genre ? { genre: genre as Genre } : {}),
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, penName: true, writerAvatarUrl: true } },
        _count: { select: { episodes: true, reviews: true } },
      },
    });
  }

  async findOne(id: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id, isHidden: false },
      include: {
        author: { select: { id: true, penName: true, writerAvatarUrl: true } },
        episodes: {
          where: { isPublished: true },
          orderBy: { episodeNumber: 'asc' },
          select: { id: true, title: true, episodeNumber: true, releasedAt: true },
        },
      },
    });
    if (!novel) throw new NotFoundException('Novel not found');

    const ratingAgg = await this.prisma.novelReview.aggregate({
      where: { novelId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      ...novel,
      averageRating: ratingAgg._avg.rating || null,
      reviewCount: ratingAgg._count.rating,
    };
  }

  async upsertReview(novelId: string, userId: string, rating: number, comment?: string) {
    if (rating < 1 || rating > 5) {
      throw new ForbiddenException('Rating must be between 1 and 5');
    }
    const novel = await this.prisma.novel.findUnique({ where: { id: novelId } });
    if (!novel) throw new NotFoundException('Novel not found');

    return this.prisma.novelReview.upsert({
      where: { userId_novelId: { userId, novelId } },
      create: { userId, novelId, rating, comment },
      update: { rating, comment },
    });
  }

  async getReviews(novelId: string) {
    return this.prisma.novelReview.findMany({
      where: { novelId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, displayName: true, photoURL: true } } },
    });
  }
}