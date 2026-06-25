import {
  Controller, Get, Delete, Patch, Post, Body, Param, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

const ADMIN_EMAILS = ['omisope34@gmail.com'];

function requireAdmin(user: AuthUser) {
  if (!ADMIN_EMAILS.includes(user.email)) {
    throw new Error('Forbidden: Admin access only.');
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Stats ────────────────────────────────────────────────────────────────
  @Get('stats')
  async getStats(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getStats();
  }

  // ── Users ────────────────────────────────────────────────────────────────
  @Get('users')
  async getAllUsers(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getAllUsers();
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.deleteUser(id);
  }

  // ── Study Materials ──────────────────────────────────────────────────────
  @Get('materials')
  async getAllMaterials(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getAllMaterials();
  }

  @Delete('materials/:id')
  async deleteMaterial(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.deleteMaterial(id);
  }

  // ── Products ─────────────────────────────────────────────────────────────
  @Get('products')
  async getAllProducts(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getAllProducts();
  }

  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.deleteProduct(id);
  }

  // ── Universities ─────────────────────────────────────────────────────────
  @Delete('universities/:id')
  async deleteUniversity(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.deleteUniversity(id);
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  @Get('reports')
  async getAllReports(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getAllReports();
  }

  @Patch('reports/:id/resolve')
  async resolveReport(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.resolveReport(id);
  }

  @Patch('users/:id/ban')
async banUser(@Param('id') id: string, @CurrentUser() user: AuthUser) {
  requireAdmin(user);
  return this.adminService.toggleBanUser(id);
}

// ── Marketplace ───────────────────────────────────────────────────
  @Get('sellers')
  async getAllSellers(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getAllSellers();
  }

  @Delete('sellers/:id')
  async deleteSeller(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.deleteSeller(id);
  }

  @Get('reviews')
  async getAllReviews(@CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.getAllReviews();
  }

  @Delete('reviews/:id')
  async deleteReview(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    requireAdmin(user);
    return this.adminService.deleteReview(id);
  }

  @Post('notify-inactive')
@UseGuards(JwtAuthGuard)
async notifyInactiveUsers() {
  return this.adminService.notifyInactiveUsers();
}

@Post('send-message')
async sendMessageToUser(
  @CurrentUser() user: AuthUser,
  @Body() body: { userId: string; subject: string; message: string },
) {
  requireAdmin(user);
  return this.adminService.sendMessageToUser(body.userId, body.subject, body.message);
}

}
