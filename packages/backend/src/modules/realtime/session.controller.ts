import { Controller, Get, Post, Delete, Query, Param, Body, UseGuards, BadRequestException, NotFoundException, ForbiddenException, Header } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../database/prisma.service';
import { GamePlayer, PlayerAnswer, Question } from '@prisma/client';
import { ensureSessionDtoSchema, EnsureSessionDto, AuthenticatedUser } from '../../types';

@Controller('sessions')
export class SessionController {
  constructor(private readonly rt: RealtimeGateway, private readonly prisma: PrismaService) {}

  // Lister les sessions de l'utilisateur (quizzes qu'il a créés)
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async listMySessions(@CurrentUser() user: AuthenticatedUser) {
    // Récupérer les quizzes de l'utilisateur
    const quizzes = await this.prisma.quiz.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });
    const quizIds = quizzes.map(q => q.id);
    
    if (quizIds.length === 0) return [];

    // Récupérer les sessions liées à ces quizzes
    const sessions = await this.prisma.gameSession.findMany({
      where: { quizId: { in: quizIds } },
      include: {
        quiz: { select: { id: true, title: true } },
        _count: { select: { players: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limiter à 50 sessions
    });

    // Enrichir avec l'état en temps réel
    return sessions.map(session => {
      const liveState = this.rt.getPublicState(session.code);
      return {
        id: session.id,
        code: session.code,
        quizId: session.quizId,
        quizTitle: session.quiz?.title,
        createdAt: session.createdAt,
        playerCount: liveState?.playersCount ?? session._count.players,
        status: liveState?.status ?? 'finished',
        isLive: !!liveState,
      };
    });
  }

  // Supprimer une session
  @UseGuards(JwtAuthGuard)
  @Delete(':code')
  async deleteSession(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    const session = await this.prisma.gameSession.findUnique({
      where: { code },
      include: { quiz: { select: { ownerId: true } } },
    });
    
    if (!session) throw new NotFoundException('session_not_found');
    if (session.quiz.ownerId !== user.id) throw new ForbiddenException('not_owner');

    // Fermer la session en temps réel si elle existe
    this.rt.closeSession(code);

    // Supprimer les données en cascade
    // D'abord les réponses des joueurs
    const players = await this.prisma.gamePlayer.findMany({
      where: { sessionId: session.id },
      select: { id: true },
    });
    const playerIds = players.map(p => p.id);
    
    if (playerIds.length > 0) {
      await this.prisma.playerAnswer.deleteMany({
        where: { playerId: { in: playerIds } },
      });
    }
    
    // Puis les joueurs
    await this.prisma.gamePlayer.deleteMany({
      where: { sessionId: session.id },
    });
    
    // Enfin la session
    await this.prisma.gameSession.delete({
      where: { id: session.id },
    });

    return { success: true };
  }

  // Créer ou récupérer une session pour un quiz
  @UseGuards(JwtAuthGuard)
  @Post('ensure')
  async ensure(@Body() body: unknown) {
    const parsed = ensureSessionDtoSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('quizId_required');
    const { quizId, code } = parsed.data;
    return this.rt.ensureSession(code, quizId);
  }

  // Récupérer les infos d'une session par son code (incluant quizId)
  // Utile pour rejoindre une session sans connaître le quizId
  @Get(':code/info')
  async getSessionInfo(@Param('code') code: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { code },
      include: { quiz: { select: { id: true, title: true } } },
    });
    if (!session) throw new NotFoundException('session_not_found');
    const publicState = this.rt.getPublicState(code);
    return {
      code,
      quizId: session.quizId,
      quizTitle: session.quiz?.title,
      status: publicState?.status ?? 'unknown',
      playerCount: publicState?.playersCount ?? 0,
    };
  }

  // Snapshot public minimal (pour afficher l'état du lobby côté front sans socket)
  @Get(':code')
  async getPublic(@Param('code') code: string) {
    const state = this.rt.getPublicState(code);
    if (!state) throw new BadRequestException('unknown_session');
    return state;
  }

  // Détail question courante pour affichage côté front (prompt + options visibles)
  @Get(':code/current-question')
  async getCurrentQuestion(@Param('code') code: string) {
    const qid = this.rt.getCurrentQuestionId(code);
    if (!qid) throw new BadRequestException('no_current_question');
    const q = await this.prisma.question.findUnique({ where: { id: qid }, include: { options: { select: { id: true, label: true } } } as any });
    if (!q) throw new BadRequestException('unknown_question');
    return { id: q.id, prompt: q.prompt, timeLimitMs: q.timeLimitMs, options: q.options };
  }

  // Résumé complet d'une session (podium, classement, stats par question)
  @Get(':code/summary')
  async getSummary(@Param('code') code: string) {
    return this.computeSummary(code);
  }

  // Export CSV basique (leaderboard) - protégé par authentification
  @UseGuards(JwtAuthGuard)
  @Get(':code/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="session-leaderboard.csv"')
  async exportCsv(@Param('code') code: string): Promise<string> {
    const summary = await this.computeSummary(code);
    const header = ['rank', 'nickname', 'score', 'correctAnswers', 'totalAnswers'];
    const lines = [header.join(',')];
    for (const e of summary.leaderboard) {
      const pstat = summary.playerStats[e.nickname] || { correct: 0, answered: 0 };
      lines.push([e.rank, e.nickname, e.score, pstat.correct, pstat.answered].join(','));
    }
    return lines.join('\n');
  }

  private async computeSummary(code: string) {
    const session = await this.prisma.gameSession.findUnique({ where: { code }, include: { quiz: true } });
    if (!session) throw new NotFoundException('session_not_found');
    const players = await this.prisma.gamePlayer.findMany({ where: { sessionId: session.id }, orderBy: { score: 'desc' } });
    const playerIds = players.map((p: GamePlayer) => p.id);
    const answers = playerIds.length > 0
      ? await this.prisma.playerAnswer.findMany({ where: { playerId: { in: playerIds } } })
      : [];
    const questions = await this.prisma.question.findMany({ where: { quizId: session.quizId }, orderBy: { order: 'asc' } });

    // Classement
    const leaderboard = players.map((p: GamePlayer, i: number) => ({ nickname: p.nickname, score: p.score, rank: i + 1 }));
    const podium = leaderboard.slice(0, 3);

    // Stats par question
    const qStats: Array<{ id: string; prompt: string; index: number; answered: number; correct: number; correctRate: number; avgTimeCorrectMs: number | null }>
      = questions.map((q: Question, idx: number) => {
        const qa = answers.filter((a: PlayerAnswer) => a.questionId === q.id);
        const answered = qa.length;
        const correct = qa.filter((a: PlayerAnswer) => a.correct).length;
        const correctOnes = qa.filter((a: PlayerAnswer) => a.correct);
        const avgTimeCorrectMs = correctOnes.length > 0 ? Math.round(correctOnes.reduce((s: number, a: PlayerAnswer) => s + (a.timeMs || 0), 0) / correctOnes.length) : null;
        const correctRate = answered > 0 ? correct / answered : 0;
        return { id: q.id, prompt: q.prompt, index: idx, answered, correct, correctRate, avgTimeCorrectMs };
      });

    // Stats par joueur
    const playerStats: Record<string, { correct: number; answered: number; avgTimeCorrectMs: number | null }> = {};
    for (const p of players) {
      const pa = answers.filter((a: PlayerAnswer) => a.playerId === p.id);
      const answered = pa.length;
      const correct = pa.filter((a: PlayerAnswer) => a.correct).length;
      const correctOnes = pa.filter((a: PlayerAnswer) => a.correct);
      const avgTimeCorrectMs = correctOnes.length > 0 ? Math.round(correctOnes.reduce((s: number, a: PlayerAnswer) => s + (a.timeMs || 0), 0) / correctOnes.length) : null;
      playerStats[p.nickname] = { correct, answered, avgTimeCorrectMs };
    }

    return {
      code,
      quiz: { id: session.quiz.id, title: session.quiz.title },
      createdAt: session.createdAt,
      leaderboard,
      podium,
      questions: qStats,
      playerStats,
    };
  }
}
