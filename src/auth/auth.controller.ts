import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('google')
  async googleLogin(
    @Body('idToken') idToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.loginWithGoogle(idToken);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return { accessToken, user };
  }

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
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
    return { success: true };
  }

  
@UseGuards(JwtAuthGuard)
@Post('become-writer')
becomeWriter(@Req() req, @Body() dto: { penName: string; bio?: string; avatarUrl?: string }) {
  return this.authService.becomeWriter(req.user.sub, dto.penName, dto.bio, dto.avatarUrl);
}
}