import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
  email?: string;
}

@Injectable()
export class TwitchService {
  private readonly clientId = process.env.TWITCH_CLIENT_ID || '';
  private readonly clientSecret = process.env.TWITCH_CLIENT_SECRET || '';
  private readonly redirectUri = process.env.TWITCH_REDIRECT_URI || 'http://localhost:3000/api/auth/twitch/callback';

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  /**
   * Génère l'URL d'autorisation Twitch
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'user:read:email',
      state: state || crypto.randomBytes(16).toString('hex'),
    });
    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Échange le code d'autorisation contre des tokens
   */
  async exchangeCode(code: string): Promise<TwitchTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new UnauthorizedException(`Twitch token exchange failed: ${err}`);
    }

    return res.json();
  }

  /**
   * Récupère les informations utilisateur Twitch
   */
  async getTwitchUser(accessToken: string): Promise<TwitchUser> {
    const res = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': this.clientId,
      },
    });

    if (!res.ok) {
      throw new UnauthorizedException('Failed to fetch Twitch user');
    }

    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      throw new UnauthorizedException('No Twitch user data returned');
    }

    return data.data[0];
  }

  /**
   * Authentifie ou crée un utilisateur via Twitch
   */
  async authenticateWithTwitch(code: string): Promise<{ accessToken: string; refreshToken: string; user: { id: string; username: string; avatarUrl?: string } }> {
    // 1. Échanger le code contre des tokens Twitch
    const tokens = await this.exchangeCode(code);

    // 2. Récupérer les infos utilisateur Twitch
    const twitchUser = await this.getTwitchUser(tokens.access_token);

    // 3. Trouver ou créer l'utilisateur local
    let user = await this.prisma.user.findUnique({
      where: { twitchId: twitchUser.id },
    });

    if (!user) {
      // Vérifier si le username existe déjà
      const existingUsername = await this.prisma.user.findUnique({
        where: { username: twitchUser.login },
      });

      const username = existingUsername
        ? `${twitchUser.login}_${twitchUser.id.slice(-4)}`
        : twitchUser.login;

      user = await this.prisma.user.create({
        data: {
          username,
          twitchId: twitchUser.id,
          avatarUrl: twitchUser.profile_image_url,
        },
      });
    } else {
      // Mettre à jour l'avatar si changé
      if (user.avatarUrl !== twitchUser.profile_image_url) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: twitchUser.profile_image_url },
        });
      }
    }

    // 4. Générer les tokens JWT
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
    });

    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = await import('argon2').then(a => a.hash(refreshToken));
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 jours

    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        expiresAt: expires,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl || undefined,
      },
    };
  }
}
