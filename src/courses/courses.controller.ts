// courses.controller.ts
import { Controller, Get, Post, Body, Query, Param, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get('schools')
  getSchools(@Query('universityId') universityId: string) {
    if (!universityId) throw new BadRequestException('universityId is required');
    return this.coursesService.getSchools(universityId);
  }

  @Get('schools/:schoolId/departments')
  getDepartments(@Param('schoolId') schoolId: string) {
    return this.coursesService.getDepartments(schoolId);
  }

  @Get('departments/:departmentId/programs')
  getPrograms(@Param('departmentId') departmentId: string) {
    return this.coursesService.getPrograms(departmentId);
  }

  @Get('programs/:programId/courses')
  getCourses(@Param('programId') programId: string, @Query('search') search?: string) {
    return this.coursesService.getCourses(programId, search);
  }

  @Post('courses')
  createCourse(
    @Req() req: any,
    @Body() body: { programId: string; code: string; title: string; level?: string; semester?: string },
  ) {
    if (!body.programId || !body.code?.trim() || !body.title?.trim()) {
      throw new BadRequestException('programId, code, and title are required');
    }
    return this.coursesService.createCourse(body);
  }
}