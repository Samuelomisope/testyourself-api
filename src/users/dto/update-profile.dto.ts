import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, IsUrl, Length } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(1, 80) displayName?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) @Length(1, 2_000) photoURL?: string;
  @IsOptional() @IsString() @Length(0, 1_000) bio?: string;
  @IsOptional() @IsString() @Length(0, 120) faculty?: string;
  @IsOptional() @IsString() @Length(0, 120) department?: string;
  @IsOptional() @IsUUID() universityId?: string;
  @IsOptional() @IsString() @Length(3, 30) chatSnapUsername?: string;
  @Transform(({ value }) => value && typeof value === 'object' ? value.id : value)
  @IsOptional() @IsString() @Length(1, 80) chatWallpaper?: string;
}
