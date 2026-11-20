import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, MinLength, Matches, ValidateNested,
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

/** Points at one block on the whiteboard. The server looks the block up itself; the client never sends its content. */
export class BoardRefDto {
  @IsUUID() turnId: string;
  @IsString() @Matches(/^e\d{1,4}$/) eventId: string;
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
  /** Optional: the whiteboard block this question is about. Only valid with ASK. */
  @IsOptional() @ValidateNested() @Type(() => BoardRefDto) boardRef?: BoardRefDto;
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

/** Where the learner is in the lesson (Phase G). Saved so another device can offer "continue where you left off". */
export class ResumePositionDto {
  @IsInt() @Min(0) @Max(200)
  stepIndex: number;

  @IsOptional() @Matches(/^e\d{1,4}$/)
  eventId?: string;

  @IsOptional() @IsInt() @Min(0) @Max(99)
  boardPage?: number;
}

export class AssessmentAnswerDto {
  @Matches(/^q[1-4]$/)
  questionId: string;

  @IsOptional() @IsInt() @Min(0) @Max(4)
  choice?: number;

  @IsOptional() @IsBoolean()
  truth?: boolean;

  @IsOptional() @IsString() @MaxLength(300)
  text?: string;
}

export class SubmitAssessmentAttemptDto {
  @IsArray() @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => AssessmentAnswerDto)
  answers: AssessmentAnswerDto[];
}
