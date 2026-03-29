import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { Request } from 'express';
import { AuthService, AuthUser } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { RequestUser } from './strategies/jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    /* redirects to Google */
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(
    @Req() req: Request & { user: AuthUser },
    @Res() res: Response,
  ): void {
    const token = this.authService.signAccessToken(req.user);
    const frontend =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';
    const target = new URL('/auth/callback', frontend);
    target.hash = `access_token=${encodeURIComponent(token)}`;
    res.redirect(target.toString());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return { user };
  }
}
