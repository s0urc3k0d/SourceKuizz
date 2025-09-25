import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async createLocalUser(username: string, password: string) {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    return this.prisma.user.create({ data: { username, passwordHash: hash } });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) return false;
    return argon2.verify(user.passwordHash, password);
  }
}
