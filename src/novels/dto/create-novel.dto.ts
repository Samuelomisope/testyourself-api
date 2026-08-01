import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Genre } from '@prisma/client';

export class CreateNovelDto {
  @IsString() title: string;
  @IsString() synopsis: string;
  @IsEnum(Genre) genre: Genre;
  @IsOptional() @IsString() coverUrl?: string;
}

export class CreateEpisodeDto {
  @IsString() title: string;
  @IsString() content: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
}
