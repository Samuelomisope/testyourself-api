import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  async googleLogin(
    @Body('idToken') idToken: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = req.headers['user-agent'];
    const { accessToken, refreshToken, user } =
      await this.authService.loginWithGoogle(idToken, deviceInfo);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return { accessToken, user };
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Req() req: Request) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return { accessToken: null };
    }
    const accessToken = await this.authService.refreshAccessToken(refreshToken);
    return { accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Req() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeAllSessionsForUser(req.user.sub);
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async listSessions(@Req() req) {
    return this.authService.listActiveSessions(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('become-writer')
  becomeWriter(
    @Req() req,
    @Body() dto: { penName: string; bio?: string; avatarUrl?: string },
  ) {
    return this.authService.becomeWriter(
      req.user.sub,
      dto.penName,
      dto.bio,
      dto.avatarUrl,
    );
  }
}
