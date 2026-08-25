import {
  Controller, Get, Delete, Patch, Post, Body, Param, UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard'; // adjust the path to wherever admin.guard.ts actually lives

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Stats ────────────────────────────────────────────────────────────────
  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ── Users ────────────────────────────────────────────────────────────────
  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ── Study Materials ──────────────────────────────────────────────────────
  @Get('materials')
  async getAllMaterials() {
    return this.adminService.getAllMaterials();
  }

  @Delete('materials/:id')
  async deleteMaterial(@Param('id') id: string) {
    return this.adminService.deleteMaterial(id);
  }

  @Patch('materials/bulk')
  async bulkUpdateMaterials(@Body() body: { ids: string[]; data: Record<string, any> }) {
    return this.adminService.bulkUpdateMaterials(body.ids, body.data);
  }

    // ── Needs Review (Department-layer backfill triage) ────────────────────
  @Get('materials/needs-review')
  async getMaterialsNeedingReview() {
    return this.adminService.getMaterialsNeedingReview();
  }

  @Patch('materials/:id/resolve-review')
  async resolveMaterialReview(
    @Param('id') id: string,
    @Body() body: { courseId: string },
  ) {
    return this.adminService.resolveMaterialReview(id, body.courseId);
  }

  @Patch('materials/:id/dismiss-review')
  async dismissMaterialReview(@Param('id') id: string) {
    return this.adminService.dismissMaterialReview(id);
  }

  // ── Products ─────────────────────────────────────────────────────────────
  @Get('products')
  async getAllProducts() {
    return this.adminService.getAllProducts();
  }

  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string) {
    return this.adminService.deleteProduct(id);
  }

  // ── Universities ─────────────────────────────────────────────────────────
  @Delete('universities/:id')
  async deleteUniversity(@Param('id') id: string) {
    return this.adminService.deleteUniversity(id);
  }

  // ── Reports ──────────────────────────────────────────────────────────────
  @Get('reports')
  async getAllReports() {
    return this.adminService.getAllReports();
  }

  @Patch('reports/:id/resolve')
  async resolveReport(@Param('id') id: string) {
    return this.adminService.resolveReport(id);
  }

  @Patch('users/:id/ban')
  async banUser(@Param('id') id: string) {
    return this.adminService.toggleBanUser(id);
  }

  // ── Marketplace ──────────────────────────────────────────────────────────
  @Get('sellers')
  async getAllSellers() {
    return this.adminService.getAllSellers();
  }

  @Delete('sellers/:id')
  async deleteSeller(@Param('id') id: string) {
    return this.adminService.deleteSeller(id);
  }

  @Get('reviews')
  async getAllReviews() {
    return this.adminService.getAllReviews();
  }

  @Delete('reviews/:id')
  async deleteReview(@Param('id') id: string) {
    return this.adminService.deleteReview(id);
  }

  @Post('notify-inactive')
  async notifyInactiveUsers() {
    return this.adminService.notifyInactiveUsers();
  }

  @Post('send-message')
  async sendMessageToUser(
    @Body() body: { userId: string; subject: string; message: string },
  ) {
    return this.adminService.sendMessageToUser(body.userId, body.subject, body.message);
  }

  // ── Novels ───────────────────────────────────────────────────────────────
  @Get('novels')
  async getAllNovels() {
    return this.adminService.getAllNovels();
  }

  @Delete('novels/:id')
  async deleteNovel(@Param('id') id: string) {
    return this.adminService.deleteNovel(id);
  }

  @Patch('novels/:id/toggle-hidden')
  async toggleHideNovel(@Param('id') id: string) {
    return this.adminService.toggleHideNovel(id);
  }

  @Delete('episodes/:id')
  async deleteEpisode(@Param('id') id: string) {
    return this.adminService.deleteEpisode(id);
  }
}