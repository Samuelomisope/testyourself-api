import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, MinLength, Matches,
} from 'class-validator';

export class CreateClassroomSessionDto {
  @IsString() @MinLength(2) @MaxLength(160)
  topic: string;

  @IsOptional() @IsString() @MaxLength(160)
  title?: string;

  @IsOptional() @IsUUID()
  courseId?: string;

  @IsOptional() @IsIn(['MALE', 'FEMALE'])
  tutorVoice?: string;

  /** CLASSROOM follows a generated lesson plan; CONVERSATION is free-form Q&A. Defaults to CLASSROOM for new lessons. */
  @IsOptional() @IsIn(['CLASSROOM', 'CONVERSATION'])
  mode?: 'CLASSROOM' | 'CONVERSATION';

  @IsOptional() @IsIn(['GENERAL', 'UPLOADED', 'LIBRARY'])
  sourceMode?: 'GENERAL' | 'UPLOADED' | 'LIBRARY';
}

export class UpdateClassroomSessionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160)
  title?: string;

  @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'ARCHIVED';

  @IsOptional() @IsIn(['MALE', 'FEMALE'])
  tutorVoice?: string;
}

export class CreateClassroomTurnDto {
  @IsString() @MinLength(1) @MaxLength(4000)
  message: string;

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID(undefined, { each: true })
  documentIds?: string[];

  @IsString() @Matches(/^[A-Za-z0-9._:-]{8,100}$/)
  idempotencyKey: string;

  /** ASK (default) answers in context without moving on; CONTINUE moves to the next step of the lesson plan. */
  @IsOptional() @IsIn(['ASK', 'CONTINUE'])
  action?: 'ASK' | 'CONTINUE';
}

export class LinkClassroomMaterialDto {
  @IsUUID()
  materialId: string;
}

export class ListClassroomSessionsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsUUID()
  before?: string;
}

export class ListClassroomTurnsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  beforeSequence?: number;
}
