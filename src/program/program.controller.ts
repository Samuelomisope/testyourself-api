import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProgramService } from './program.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('programs')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  // GET /programs?departmentId=xxx — public
  @Get()
  findByDepartment(@Query('departmentId') departmentId: string) {
    return this.programService.findByDepartment(departmentId);
  }

  // GET /programs/:id — public
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.programService.findOne(id);
  }

@UseGuards(JwtAuthGuard, AdminGuard)
@Post(':courseId/cross-list')
crossListCourse(
  @Param('courseId') courseId: string,
  @Body() body: { programIds: string[] },
) {
  return this.programService.crossListCourse(courseId, body.programIds);
}

  // POST /programs — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  create(@Body() dto: CreateProgramDto) {
    return this.programService.create(dto);
  }

  // PATCH /programs/:id — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.programService.update(id, dto);
  }

  // DELETE /programs/:id — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.programService.remove(id);
  }
}