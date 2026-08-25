import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSchoolStaffDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  role?: string;
}
