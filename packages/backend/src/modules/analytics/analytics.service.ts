import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface OverviewStats {
  totalUsers: number;
  totalQuizzes: number;
  totalSessions: number;
  activeSessions: number;
  totalGamesPlayed: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  averagePlayersPerSession: number;
}

export interface TrendData {
  date: string;
  value: number;
}

export interface QuestionTypeStats {
  type: string;
  count: number;
  avgCorrectRate: number;
}

export interface UserActivityStats {
  dailyActiveUsers: TrendData[];
  weeklyActiveUsers: TrendData[];
  retentionRate: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Statistiques globales de la plateforme
   */
  async getOverviewStats(): Promise<OverviewStats> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalQuizzes,
      totalSessions,
      activeSessions,
      totalGamesPlayed,
      newUsersLast7Days,
      newUsersLast30Days,
      sessionsWithPlayers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.quiz.count(),
      this.prisma.gameSession.count(),
      this.prisma.gameSession.count({
        where: { status: { in: ['lobby', 'playing'] } },
      }),
      this.prisma.gameHistory.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.gameSession.findMany({
        select: {
          _count: { select: { players: true } },
        },
      }),
    ]);

    const totalPlayers = sessionsWithPlayers.reduce(
      (sum, s) => sum + s._count.players,
      0,
    );
    const averagePlayersPerSession =
      sessionsWithPlayers.length > 0
        ? Math.round((totalPlayers / sessionsWithPlayers.length) * 10) / 10
        : 0;

    return {
      totalUsers,
      totalQuizzes,
      totalSessions,
      activeSessions,
      totalGamesPlayed,
      newUsersLast7Days,
      newUsersLast30Days,
      averagePlayersPerSession,
    };
  }

  /**
   * Tendance des inscriptions sur les 30 derniers jours
   */
  async getUserRegistrationTrend(days: number = 30): Promise<TrendData[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
    });

    // Grouper par jour
    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(date.toISOString().split('T')[0], 0);
    }

    users.forEach((u) => {
      const day = u.createdAt.toISOString().split('T')[0];
      if (byDay.has(day)) {
        byDay.set(day, byDay.get(day)! + 1);
      }
    });

    return Array.from(byDay.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Tendance des parties jouées sur les 30 derniers jours
   */
  async getGamesPlayedTrend(days: number = 30): Promise<TrendData[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const games = await this.prisma.gameHistory.findMany({
      where: { playedAt: { gte: startDate } },
      select: { playedAt: true },
    });

    // Grouper par jour
    const byDay = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(date.toISOString().split('T')[0], 0);
    }

    games.forEach((g) => {
      const day = g.playedAt.toISOString().split('T')[0];
      if (byDay.has(day)) {
        byDay.set(day, byDay.get(day)! + 1);
      }
    });

    return Array.from(byDay.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Statistiques par type de question
   */
  async getQuestionTypeStats(): Promise<QuestionTypeStats[]> {
    const questions = await this.prisma.question.findMany({
      select: {
        type: true,
        answers: {
          select: { correct: true },
        },
      },
    });

    // Grouper par type
    const byType = new Map<string, { total: number; correct: number; count: number }>();

    questions.forEach((q) => {
      const current = byType.get(q.type) || { total: 0, correct: 0, count: 0 };
      current.count += 1;
      current.total += q.answers.length;
      current.correct += q.answers.filter((a) => a.correct).length;
      byType.set(q.type, current);
    });

    return Array.from(byType.entries()).map(([type, stats]) => ({
      type,
      count: stats.count,
      avgCorrectRate:
        stats.total > 0
          ? Math.round((stats.correct / stats.total) * 100)
          : 0,
    }));
  }

  /**
   * Top quizzes par nombre de parties
   */
  async getTopQuizzes(limit: number = 10): Promise<
    Array<{
      id: string;
      title: string;
      timesPlayed: number;
      avgScore: number;
      creator: string;
    }>
  > {
    const history = await this.prisma.gameHistory.groupBy({
      by: ['quizId'],
      _count: { _all: true },
      _avg: { score: true },
      orderBy: { _count: { quizId: 'desc' } },
      take: limit,
    });

    const quizIds = history.map((h) => h.quizId);
    const quizzes = await this.prisma.quiz.findMany({
      where: { id: { in: quizIds } },
      include: {
        owner: { select: { username: true } },
      },
    });

    const quizMap = new Map(quizzes.map((q) => [q.id, q]));

    return history.map((h) => {
      const quiz = quizMap.get(h.quizId);
      return {
        id: h.quizId,
        title: quiz?.title || 'Unknown',
        timesPlayed: h._count._all,
        avgScore: Math.round(h._avg.score || 0),
        creator: quiz?.owner.username || 'Unknown',
      };
    });
  }

  /**
   * Top joueurs par XP
   */
  async getTopPlayers(limit: number = 10): Promise<
    Array<{
      id: string;
      username: string;
      level: number;
      totalXp: number;
      gamesPlayed: number;
      badgeCount: number;
    }>
  > {
    const xpEntries = await this.prisma.userXP.findMany({
      orderBy: { totalXp: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            _count: {
              select: {
                gameHistory: true,
                badges: true,
              },
            },
          },
        },
      },
    });

    return xpEntries.map((e) => ({
      id: e.user.id,
      username: e.user.username,
      level: e.level,
      totalXp: e.totalXp,
      gamesPlayed: e.user._count.gameHistory,
      badgeCount: e.user._count.badges,
    }));
  }

  /**
   * Distribution des badges
   */
  async getBadgeDistribution(): Promise<
    Array<{
      code: string;
      name: string;
      rarity: string;
      earnedCount: number;
      earnedPercent: number;
    }>
  > {
    const [totalUsers, badges] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.badge.findMany({
        include: {
          _count: { select: { userBadges: true } },
        },
      }),
    ]);

    return badges
      .map((b) => ({
        code: b.code,
        name: b.name,
        rarity: b.rarity,
        earnedCount: b._count.userBadges,
        earnedPercent:
          totalUsers > 0
            ? Math.round((b._count.userBadges / totalUsers) * 100)
            : 0,
      }))
      .sort((a, b) => b.earnedCount - a.earnedCount);
  }

  /**
   * Temps de réponse moyen par question
   */
  async getAverageResponseTimes(): Promise<{
    overall: number;
    byQuestionType: Array<{ type: string; avgTimeMs: number }>;
    byDifficulty: Array<{ correct: boolean; avgTimeMs: number }>;
  }> {
    const answers = await this.prisma.playerAnswer.findMany({
      select: {
        timeMs: true,
        correct: true,
        question: {
          select: { type: true },
        },
      },
    });

    if (answers.length === 0) {
      return {
        overall: 0,
        byQuestionType: [],
        byDifficulty: [],
      };
    }

    // Overall
    const overall = Math.round(
      answers.reduce((sum, a) => sum + a.timeMs, 0) / answers.length,
    );

    // Par type de question
    const byType = new Map<string, { total: number; count: number }>();
    answers.forEach((a) => {
      const current = byType.get(a.question.type) || { total: 0, count: 0 };
      current.total += a.timeMs;
      current.count += 1;
      byType.set(a.question.type, current);
    });

    const byQuestionType = Array.from(byType.entries()).map(([type, stats]) => ({
      type,
      avgTimeMs: Math.round(stats.total / stats.count),
    }));

    // Par résultat (correct vs incorrect)
    const correctAnswers = answers.filter((a) => a.correct);
    const incorrectAnswers = answers.filter((a) => !a.correct);

    const byDifficulty = [
      {
        correct: true,
        avgTimeMs:
          correctAnswers.length > 0
            ? Math.round(
                correctAnswers.reduce((sum, a) => sum + a.timeMs, 0) /
                  correctAnswers.length,
              )
            : 0,
      },
      {
        correct: false,
        avgTimeMs:
          incorrectAnswers.length > 0
            ? Math.round(
                incorrectAnswers.reduce((sum, a) => sum + a.timeMs, 0) /
                  incorrectAnswers.length,
              )
            : 0,
      },
    ];

    return { overall, byQuestionType, byDifficulty };
  }

  /**
   * Statistiques d'activité par heure de la journée
   */
  async getActivityByHour(): Promise<Array<{ hour: number; games: number }>> {
    const history = await this.prisma.gameHistory.findMany({
      select: { playedAt: true },
    });

    const byHour = new Map<number, number>();
    for (let i = 0; i < 24; i++) {
      byHour.set(i, 0);
    }

    history.forEach((h) => {
      const hour = h.playedAt.getHours();
      byHour.set(hour, byHour.get(hour)! + 1);
    });

    return Array.from(byHour.entries()).map(([hour, games]) => ({
      hour,
      games,
    }));
  }

  /**
   * Statistiques d'un utilisateur spécifique
   */
  async getUserAnalytics(userId: string): Promise<{
    overview: {
      totalGames: number;
      totalWins: number;
      winRate: number;
      avgScore: number;
      avgRank: number;
      bestStreak: number;
    };
    recentPerformance: TrendData[];
    questionTypeAccuracy: Array<{ type: string; accuracy: number }>;
  } | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        gameHistory: {
          orderBy: { playedAt: 'desc' },
          take: 100,
        },
        streak: true,
      },
    });

    if (!user) {
      return null;
    }

    const history = user.gameHistory;
    const totalGames = history.length;
    const totalWins = history.filter((h) => h.rank === 1).length;
    const avgScore =
      totalGames > 0
        ? Math.round(history.reduce((sum, h) => sum + h.score, 0) / totalGames)
        : 0;
    const avgRank =
      totalGames > 0
        ? Math.round(
            (history.reduce((sum, h) => sum + h.rank, 0) / totalGames) * 10,
          ) / 10
        : 0;

    // Performance des 7 derniers jours
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentGames = history.filter((h) => h.playedAt >= sevenDaysAgo);

    const byDay = new Map<string, { total: number; count: number }>();
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(date.toISOString().split('T')[0], { total: 0, count: 0 });
    }

    recentGames.forEach((g) => {
      const day = g.playedAt.toISOString().split('T')[0];
      const current = byDay.get(day);
      if (current) {
        current.total += g.score;
        current.count += 1;
      }
    });

    const recentPerformance = Array.from(byDay.entries())
      .map(([date, stats]) => ({
        date,
        value: stats.count > 0 ? Math.round(stats.total / stats.count) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Précision par type de question (depuis PlayerAnswer)
    const answers = await this.prisma.playerAnswer.findMany({
      where: {
        player: { userId },
      },
      select: {
        correct: true,
        question: { select: { type: true } },
      },
    });

    const byType = new Map<string, { correct: number; total: number }>();
    answers.forEach((a) => {
      const current = byType.get(a.question.type) || { correct: 0, total: 0 };
      current.total += 1;
      if (a.correct) current.correct += 1;
      byType.set(a.question.type, current);
    });

    const questionTypeAccuracy = Array.from(byType.entries()).map(
      ([type, stats]) => ({
        type,
        accuracy:
          stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      }),
    );

    return {
      overview: {
        totalGames,
        totalWins,
        winRate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0,
        avgScore,
        avgRank,
        bestStreak: user.streak?.longestStreak || 0,
      },
      recentPerformance,
      questionTypeAccuracy,
    };
  }
}
