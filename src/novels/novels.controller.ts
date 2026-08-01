import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WriterGuard } from './guards/writer.guard';
import { NovelsService } from './novels.service';
import { CreateNovelDto, CreateEpisodeDto } from './dto/create-novel.dto';

@Controller()
export class NovelsController {
  constructor(private novelsService: NovelsService) {}

  @Get('novels')
  findAll(@Query('genre') genre?: string, @Query('page') page?: string) {
    return this.novelsService.findAll(genre, page ? +page : 1);
  }

  @Get('novels/genres')
  getGenres() {
    return this.novelsService.getGenres();
  }

  @Get('novels/mine')
  @UseGuards(JwtAuthGuard)
  myNovels(@Req() req) {
    return this.novelsService.myNovels(req.user.sub);
  }

  @Get('novels/:id')
  findOne(@Param('id') id: string) {
    return this.novelsService.findOne(id);
  }

  @Get('episodes/:id')
  getEpisode(@Param('id') id: string) {
    return this.novelsService.getEpisode(id);
  }

  @UseGuards(JwtAuthGuard, WriterGuard)
  @Post('novels')
  create(@Req() req, @Body() dto: CreateNovelDto) {
    return this.novelsService.create(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, WriterGuard)
  @Post('novels/:id/episodes')
  addEpisode(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: CreateEpisodeDto,
  ) {
    return this.novelsService.addEpisode(id, req.user.sub, dto);
  }

  @Get('novels/:id/reviews')
  getReviews(@Param('id') id: string) {
    return this.novelsService.getReviews(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('novels/:id/reviews')
  upsertReview(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: { rating: number; comment?: string },
  ) {
    return this.novelsService.upsertReview(
      id,
      req.user.sub,
      dto.rating,
      dto.comment,
    );
  }
}
