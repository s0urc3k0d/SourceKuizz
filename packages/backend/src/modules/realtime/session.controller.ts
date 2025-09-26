import { Controller, Get, Post, Query, Param, Body, UseGuards, BadRequestException, NotFoundException, Header } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly rt: RealtimeGateway, private readonly prisma: PrismaService) {}

  // Créer ou récupérer une session pour un quiz
  @UseGuards(JwtAuthGuard)
  @Post('ensure')
  async ensure(@Body() body: any) {
    const quizId = body?.quizId as string; const code = body?.code as string | undefined;
    if (!quizId) throw new BadRequestException('quizId_required');
    return this.rt.ensureSession(code, quizId);
  }

  // Snapshot public minimal (pour afficher l’état du lobby côté front sans socket)
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

  // Export CSV basique (leaderboard)
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
    const playerIds = players.map(p => p.id);
    const answers = playerIds.length > 0
      ? await this.prisma.playerAnswer.findMany({ where: { playerId: { in: playerIds } } })
      : [];
    const questions = await this.prisma.question.findMany({ where: { quizId: session.quizId }, orderBy: { order: 'asc' } });

    // Classement
    const leaderboard = players.map((p, i) => ({ nickname: p.nickname, score: p.score, rank: i + 1 }));
    const podium = leaderboard.slice(0, 3);

    // Stats par question
    const qStats: Array<{ id: string; prompt: string; index: number; answered: number; correct: number; correctRate: number; avgTimeCorrectMs: number | null }>
      = questions.map((q, idx) => {
        const qa = answers.filter(a => a.questionId === q.id);
        const answered = qa.length;
        const correct = qa.filter(a => a.correct).length;
        const correctOnes = qa.filter(a => a.correct);
        const avgTimeCorrectMs = correctOnes.length > 0 ? Math.round(correctOnes.reduce((s, a) => s + (a.timeMs || 0), 0) / correctOnes.length) : null;
        const correctRate = answered > 0 ? correct / answered : 0;
        return { id: q.id, prompt: q.prompt, index: idx, answered, correct, correctRate, avgTimeCorrectMs };
      });

    // Stats par joueur
    const playerStats: Record<string, { correct: number; answered: number; avgTimeCorrectMs: number | null }> = {};
    for (const p of players) {
      const pa = answers.filter(a => a.playerId === p.id);
      const answered = pa.length;
      const correct = pa.filter(a => a.correct).length;
      const correctOnes = pa.filter(a => a.correct);
      const avgTimeCorrectMs = correctOnes.length > 0 ? Math.round(correctOnes.reduce((s, a) => s + (a.timeMs || 0), 0) / correctOnes.length) : null;
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
