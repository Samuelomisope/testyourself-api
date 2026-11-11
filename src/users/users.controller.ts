import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Controller, Get, Patch, Body, UseGuards, Query, Post } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
 async getMe(@CurrentUser() user: AuthUser) {
  return this.usersService.findById(user.sub);
}

  @Get('search')
  async searchUsers(@Query('q') q: string) {
    if (typeof q !== 'string' || q.trim().length < 2 || q.length > 64) throw new BadRequestException('Search must be between 2 and 64 characters.');
    return this.usersService.searchUsers(q);
  }

  @Get('me/stats')
  async getMyStats(@CurrentUser() user: AuthUser) {
    return this.usersService.getUserStats(user.sub);
  }

@Get('me/activity')
async getMyActivity(
  @CurrentUser() user: AuthUser,
  @Query('type') type?: string,
  @Query('days') days?: string,
) {
  return this.usersService.getRecentActivity(user.sub, type, days ? parseInt(days, 10) : 7);
}
  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.sub, body);
  }

  @Post('me/activity')
async logActivity(
  @CurrentUser() user: AuthUser,
  @Body() body: { type: string; description: string; href?: string },
) {
  return this.usersService.logActivity(user.sub, body.type, body.description, body.href);
}
}
