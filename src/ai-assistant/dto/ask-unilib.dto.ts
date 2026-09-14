import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AskUniLibDto {
  // The image itself arrives as a multipart file (see controller's
  // FileInterceptor) — this DTO only covers the accompanying text fields.

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;
}
