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

  async findAll(genre?: string, page = 1, limit = 12) {
    return this.prisma.novel.findMany({
      where: genre ? { genre: genre as Genre } : {},
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, penName: true, writerAvatarUrl: true } },
        _count: { select: { episodes: true } },
      },
    });
  }

  async findOne(id: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id },
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
    return novel;
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
}