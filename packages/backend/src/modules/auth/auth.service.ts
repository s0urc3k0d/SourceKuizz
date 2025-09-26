import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(username: string, password: string) {
    const existing = await this.users.findByUsername(username);
    if (existing) throw new (require('@nestjs/common').ConflictException)('username_taken');
    const user = await this.users.createLocalUser(username, password);
    return this.issueTokens(user.id, username);
  }

  async login(username: string, password: string) {
    const user = await this.users.findByUsername(username);
    if (!user) throw new UnauthorizedException('invalid_credentials');
    if (!user.passwordHash) throw new UnauthorizedException('invalid_credentials');
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedException('invalid_credentials');
    return this.issueTokens(user.id, user.username);
  }

  private async issueTokens(userId: string, username: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, username });
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshHash = await argon2.hash(refreshToken);
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7j
    await this.prisma.authSession.create({
      data: { userId, refreshTokenHash: refreshHash, expiresAt: expires },
    });
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    const sessions = await this.prisma.authSession.findMany({ where: { expiresAt: { gt: new Date() } } });
    for (const s of sessions) {
      if (await argon2.verify(s.refreshTokenHash, refreshToken)) {
        const user = await this.prisma.user.findUnique({ where: { id: s.userId } });
        if (!user) break;
        return this.issueTokens(user.id, user.username);
      }
    }
    throw new UnauthorizedException('invalid_refresh');
  }
}
