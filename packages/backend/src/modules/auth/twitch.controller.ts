import { Controller, Get, Query, Res } from '@nestjs/common';
import { TwitchService } from './twitch.service';

// Type pour la réponse Fastify (compatible NestJS)
interface FastifyResponse {
  redirect(statusCode: number, url: string): void;
  setCookie(name: string, value: string, options: Record<string, unknown>): void;
}

// Configuration des cookies sécurisés
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
};

@Controller('auth/twitch')
export class TwitchController {
  constructor(private readonly twitch: TwitchService) {}

  /**
   * GET /auth/twitch
   * Redirige vers la page d'autorisation Twitch
   */
  @Get()
  async redirectToTwitch(@Res() res: FastifyResponse) {
    const url = this.twitch.getAuthorizationUrl();
    return res.redirect(302, url);
  }

  /**
   * GET /auth/twitch/callback
   * Callback OAuth Twitch - echange le code et stocke les tokens en cookies httpOnly
   */
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Query('error_description') errorDesc: string,
    @Res() res: FastifyResponse,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (error) {
      return res.redirect(302, `${frontendUrl}/login?error=${encodeURIComponent(errorDesc || error)}`);
    }

    if (!code) {
      return res.redirect(302, `${frontendUrl}/login?error=missing_code`);
    }

    try {
      const result = await this.twitch.authenticateWithTwitch(code);
      
      // Stocker les tokens dans des cookies httpOnly sécurisés
      // Cela évite l'exposition des tokens dans l'URL (historique, logs, etc.)
      res.setCookie('accessToken', result.accessToken, COOKIE_OPTIONS);
      res.setCookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
      
      // Seules les infos non-sensibles sont passées en URL pour l'affichage UI
      const params = new URLSearchParams({
        username: result.user.username,
        authSuccess: 'true',
      });
      
      if (result.user.avatarUrl) {
        params.set('avatarUrl', result.user.avatarUrl);
      }

      return res.redirect(302, `${frontendUrl}/auth/callback?${params.toString()}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'auth_failed';
      console.error('Twitch auth error:', err);
      return res.redirect(302, `${frontendUrl}/login?error=${encodeURIComponent(message)}`);
    }
  }

  /**
   * GET /auth/twitch/url
   * Retourne l'URL d'autorisation (utile pour les SPA)
   */
  @Get('url')
  getAuthUrl() {
    return { url: this.twitch.getAuthorizationUrl() };
  }
}
