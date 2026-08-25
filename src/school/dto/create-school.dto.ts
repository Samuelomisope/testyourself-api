import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateSchoolDto {
  @IsUUID()
  @IsNotEmpty()
  universityId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsOptional()
  label?: string; // "School" (default), "College", "Faculty" — lets non-FUTA universities use their own terminology

  @IsString()
  @IsOptional()
  admissionRequirement?: string;
}