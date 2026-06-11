import {
  Controller, Get, Delete, Patch, Post, Param, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { FirebaseUser } from '../common/decorators/current-user.decorator';

const ADMIN_EMAILS = ['omisope34@gmail.com'];

function requireAdmin(user: FirebaseUser) {
  if (!ADMIN_EMAILS.includes(user.email)) {
    throw new Error('Forbidden: Admin access only.');
  }
}

@Controller('admin')
@UseGuards(FirebaseAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Stats ────────────────────────────────────────────────────────────────
  @Get('stats')
  async getStats(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getStats();
  }

  // ── Users ────────────────────────────────────────────────────────────────
  @Get('users')
  async getAllUsers(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getAllUsers();
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.deleteUser(id);
  }

  // ── Study Materials ──────────────────────────────────────────────────────
  @Get('materials')
  async getAllMaterials(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getAllMaterials();
  }

  @Delete('materials/:id')
  async deleteMaterial(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.deleteMaterial(id);
  }

  // ── Products ─────────────────────────────────────────────────────────────
  @Get('products')
  async getAllProducts(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getAllProducts();
  }

  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.deleteProduct(id);
  }

  // ── Universities ─────────────────────────────────────────────────────────
  @Delete('universities/:id')
  async deleteUniversity(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.deleteUniversity(id);
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  @Get('reports')
  async getAllReports(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getAllReports();
  }

  @Patch('reports/:id/resolve')
  async resolveReport(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.resolveReport(id);
  }

  @Patch('users/:id/ban')
async banUser(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
  requireAdmin(user);
  return this.adminService.toggleBanUser(id);
}

// ── Marketplace ───────────────────────────────────────────────────
  @Get('sellers')
  async getAllSellers(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getAllSellers();
  }

  @Delete('sellers/:id')
  async deleteSeller(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.deleteSeller(id);
  }

  @Get('reviews')
  async getAllReviews(@CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.getAllReviews();
  }

  @Delete('reviews/:id')
  async deleteReview(@Param('id') id: string, @CurrentUser() user: FirebaseUser) {
    requireAdmin(user);
    return this.adminService.deleteReview(id);
  }

  @Post('notify-inactive')
@UseGuards(FirebaseAuthGuard)
async notifyInactiveUsers() {
  return this.adminService.notifyInactiveUsers();
}

}