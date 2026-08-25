import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UniversitiesService } from './universities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) {}

  // Public — anyone can get the list of universities
  @Get()
  findAll() {
    return this.universitiesService.findAll();
  }

  // Public — get one university by slug (e.g. "futa")
  // Placed above `:id` so it doesn't collide — this is a two-segment
  // path ("slug/futa"), `:id` only ever matches one segment.
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.universitiesService.findBySlug(slug);
  }

  // Public — get one university
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.universitiesService.findOne(id);
  }

  // Protected — get university stats
  @Get(':id/stats')
  @UseGuards(JwtAuthGuard)
  getStats(@Param('id') id: string) {
    return this.universitiesService.getStats(id);
  }

  // Protected — create university
  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  create(@Body() body: {
    name: string;
    shortName?: string;
    country?: string;
    domain?: string;
    logoUrl?: string;
  }) {
    return this.universitiesService.create(body);
  }

  // Protected — update university
  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Param('id') id: string, @Body() body: {
    name?: string;
    shortName?: string;
    domain?: string;
    logoUrl?: string;
    isVerified?: boolean;
  }) {
    return this.universitiesService.update(id, body);
  }

  // Protected — seed Nigerian universities
  @Post('seed/nigeria')
  @UseGuards(JwtAuthGuard, AdminGuard)
  seed(@Body() body: { universities: string[] }) {
    return this.universitiesService.seedNigerianUniversities(body.universities);
  }
}