import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Controller, Get, Patch, Body, UseGuards, Query, Post } from '@nestjs/common';

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
    @Body() body: {
      displayName?: string;
      photoURL?: string;
      bio?: string;
      faculty?: string;
      department?: string;
      universityId?: string;
      chatSnapUsername?: string;
      chatWallpaper?: any;
    },
  ) {
    if (body.chatWallpaper && typeof body.chatWallpaper === 'object') {
      body.chatWallpaper = body.chatWallpaper.id;
    }
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
