import { UsersService } from './users.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';
import { Controller, Get, Patch, Body, UseGuards, Query } from '@nestjs/common';

@Controller('users')
@UseGuards(FirebaseAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: FirebaseUser) {
    return this.usersService.findOrCreate(user);
  }

  @Get('search')
  async searchUsers(@Query('q') q: string) {
    return this.usersService.searchUsers(q);
  }

  @Get('me/stats')
  async getMyStats(@CurrentUser() user: FirebaseUser) {
    return this.usersService.getUserStats(user.uid);
  }

  @Get('me/activity')
  async getMyActivity(@CurrentUser() user: FirebaseUser) {
    return this.usersService.getRecentActivity(user.uid);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: FirebaseUser,
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
    return this.usersService.updateProfile(user.uid, body);
  }
}