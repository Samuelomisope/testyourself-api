import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { UniversityNewsService } from './university-news.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('universities/:universityId/news')
export class UniversityNewsController {
  constructor(private readonly newsService: UniversityNewsService) {}

  // Public — only PUBLISHED items, for the university welcome page
  @Get()
  findPublished(@Param('universityId') universityId: string) {
    return this.newsService.findPublishedForUniversity(universityId);
  }

  // Admin only — sees drafts too, for the management list
  @Get('admin')
  @UseGuards(JwtAuthGuard, AdminGuard)
  findAllAdmin(@Param('universityId') universityId: string) {
    return this.newsService.findAllForUniversityAdmin(universityId);
  }

  // Admin only — create a news item (draft or published)
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(
    @Param('universityId') universityId: string,
    @Body() body: {
      title: string;
      excerpt: string;
      body: string;
      coverImageUrl?: string;
      sourceUrl?: string;
      status?: 'DRAFT' | 'PUBLISHED';
      publishedAt?: string;
    },
  ) {
    return this.newsService.create(universityId, body);
  }

  // Admin only — edit a news item (including flipping draft -> published)
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      excerpt?: string;
      body?: string;
      coverImageUrl?: string;
      sourceUrl?: string;
      status?: 'DRAFT' | 'PUBLISHED';
      publishedAt?: string;
    },
  ) {
    return this.newsService.update(id, body);
  }

  // Admin only — delete a news item
  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id') id: string) {
    return this.newsService.remove(id);
  }
}