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
import { SchoolService } from './school.service';
import { CreateSchoolDto } from './dto/create-school.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { CreateSchoolStaffDto } from './dto/create-school-staff.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // adjust path
import { AdminGuard } from '../auth/admin.guard'; // adjust path

@Controller('schools')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  // GET /schools?universityId=xxx — public
  @Get()
  findByUniversity(@Query('universityId') universityId: string) {
    return this.schoolService.findByUniversity(universityId);
  }

  // GET /schools/:id — public
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.schoolService.findOne(id);
  }

  // POST /schools — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  create(@Body() dto: CreateSchoolDto) {
    return this.schoolService.create(dto);
  }

  // PATCH /schools/:id — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSchoolDto) {
    return this.schoolService.update(id, dto);
  }

  // DELETE /schools/:id — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schoolService.remove(id);
  }

  // POST /schools/:id/staff — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post(':id/staff')
  addStaff(@Param('id') id: string, @Body() dto: CreateSchoolStaffDto) {
    return this.schoolService.addStaff(id, dto);
  }

  // DELETE /schools/staff/:staffId — admin only
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete('staff/:staffId')
  removeStaff(@Param('staffId') staffId: string) {
    return this.schoolService.removeStaff(staffId);
  }
}