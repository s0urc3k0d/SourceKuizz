import { Body, Controller, Post, Get, Req, BadRequestException, UnauthorizedException, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { loginDto, registerDto } from './dto';
import { isZodError, LoginDto, RegisterDto, RefreshDto } from '../../types';
import { JwtAuthGuard } from './jwt-auth.guard';
import { isAdminUser } from './admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown) {
    try {
      const parsed = registerDto.parse(body);
      return this.auth.register(parsed.username, parsed.password);
    } catch (e: unknown) {
      if (isZodError(e)) throw new BadRequestException(e.errors);
      throw e;
    }
  }

  @Post('login')
  async login(@Body() body: unknown) {
    try {
      const parsed = loginDto.parse(body);
      return this.auth.login(parsed.username, parsed.password);
    } catch (e: unknown) {
      if (isZodError(e)) throw new BadRequestException(e.errors);
      throw e;
    }
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: string }) {
    if (!body?.refreshToken) throw new BadRequestException('missing_refresh_token');
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  async logout(@Body() body: { refreshToken?: string }) {
    if (!body?.refreshToken) throw new BadRequestException('missing_refresh_token');
    return this.auth.logout(body.refreshToken);
  }

  /**
   * GET /auth/me
   * Récupère les tokens depuis les cookies httpOnly
   * Utilisé après le callback OAuth pour transférer les tokens au frontend
   */
  @Get('me')
  async me(@Req() req: any) {
    // Récupérer les tokens depuis les cookies
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    if (!accessToken) {
      throw new UnauthorizedException('no_token');
    }

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * GET /auth/check-admin
   * Vérifie si l'utilisateur connecté est admin
   */
  @Get('check-admin')
  @UseGuards(JwtAuthGuard)
  async checkAdmin(@Request() req: any) {
    const isAdmin = isAdminUser(req.user.username);
    return {
      isAdmin,
      username: req.user.username,
    };
  }
}
