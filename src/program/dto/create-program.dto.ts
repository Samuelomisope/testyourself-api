import { IsString, IsNotEmpty, IsOptional, IsUUID, IsInt } from 'class-validator';

export class CreateProgramDto {
  @IsUUID()
  @IsNotEmpty()
  departmentId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @IsOptional()
  durationYears?: number;

  @IsString()
  @IsOptional()
  graduationRequirement?: string;
}