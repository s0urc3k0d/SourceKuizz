import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Controller()
export class LeaderboardController {
  constructor(private prisma: PrismaService) {}

  @Get('sessions/:code/leaderboard')
  async sessionLeaderboard(@Param('code') code: string) {
    const session = await this.prisma.gameSession.findUnique({ where: { code } });
    if (!session) throw new NotFoundException('session_not_found');
    const players = await this.prisma.gamePlayer.findMany({ where: { sessionId: session.id }, orderBy: { score: 'desc' } });
    const entries = players.map((p, i) => ({ nickname: p.nickname, score: p.score, rank: i+1 }));
    return { code, entries };
  }

  @Get('leaderboard')
  async globalLeaderboard(@Query('limit') limitQ?: string) {
    const limit = Math.min(100, Math.max(1, parseInt(limitQ || '10', 10)));
    const players = await this.prisma.gamePlayer.findMany({ orderBy: { score: 'desc' }, take: limit, include: { session: true } });
    return { entries: players.map((p,i)=>({ nickname: p.nickname, score: p.score, sessionCode: p.session.code, rank: i+1 })) };
  }
}
