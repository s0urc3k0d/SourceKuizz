import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ApiKeyGuard, RequireScopes } from './api-key.guard';

interface PaginationQuery {
  page?: string;
  limit?: string;
}

/**
 * API Publique REST
 * Tous les endpoints nécessitent une clé API valide
 */
@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class PublicApiController {
  constructor(private readonly prisma: PrismaService) {}

  // ========================================
  // QUIZZES
  // ========================================

  /**
   * Liste les quizzes publics
   * GET /api/v1/quizzes
   */
  @Get('quizzes')
  @RequireScopes('quizzes:read')
  async listQuizzes(@Query() query: PaginationQuery) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const [quizzes, total] = await Promise.all([
      this.prisma.quiz.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          isBlitzMode: true,
          blitzTimeLimitMs: true,
          createdAt: true,
          owner: {
            select: {
              id: true,
              username: true,
            },
          },
          _count: {
            select: { questions: true },
          },
        },
      }),
      this.prisma.quiz.count(),
    ]);

    return {
      success: true,
      data: quizzes.map(q => ({
        id: q.id,
        title: q.title,
        description: q.description,
        isBlitzMode: q.isBlitzMode,
        blitzTimeLimitMs: q.blitzTimeLimitMs,
        questionCount: q._count.questions,
        owner: q.owner,
        createdAt: q.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Détails d'un quiz
   * GET /api/v1/quizzes/:id
   */
  @Get('quizzes/:id')
  @RequireScopes('quizzes:read')
  async getQuiz(@Param('id') id: string) {
    const quiz = await this.prisma.quiz.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
          },
        },
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            type: true,
            prompt: true,
            mediaUrl: true,
            mediaType: true,
            timeLimitMs: true,
            order: true,
            options: {
              select: {
                id: true,
                label: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return {
      success: true,
      data: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        isBlitzMode: quiz.isBlitzMode,
        blitzTimeLimitMs: quiz.blitzTimeLimitMs,
        shuffleQuestions: quiz.shuffleQuestions,
        shuffleOptions: quiz.shuffleOptions,
        owner: quiz.owner,
        questions: quiz.questions,
        createdAt: quiz.createdAt,
        updatedAt: quiz.updatedAt,
      },
    };
  }

  // ========================================
  // SESSIONS
  // ========================================

  /**
   * Liste les sessions actives
   * GET /api/v1/sessions
   */
  @Get('sessions')
  @RequireScopes('sessions:read')
  async listSessions(@Query() query: PaginationQuery & { status?: string }) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const where = query.status ? { status: query.status } : {};

    const [sessions, total] = await Promise.all([
      this.prisma.gameSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          quiz: {
            select: {
              id: true,
              title: true,
            },
          },
          _count: {
            select: { players: true },
          },
        },
      }),
      this.prisma.gameSession.count({ where }),
    ]);

    return {
      success: true,
      data: sessions.map(s => ({
        id: s.id,
        code: s.code,
        status: s.status,
        quiz: s.quiz,
        playerCount: s._count.players,
        allowSpectatorReactions: s.allowSpectatorReactions,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Détails d'une session par code
   * GET /api/v1/sessions/:code
   */
  @Get('sessions/:code')
  @RequireScopes('sessions:read')
  async getSession(@Param('code') code: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { code },
      include: {
        quiz: {
          select: {
            id: true,
            title: true,
            _count: {
              select: { questions: true },
            },
          },
        },
        players: {
          orderBy: { score: 'desc' },
          select: {
            id: true,
            nickname: true,
            score: true,
            userId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      success: true,
      data: {
        id: session.id,
        code: session.code,
        status: session.status,
        quiz: {
          ...session.quiz,
          questionCount: session.quiz._count.questions,
        },
        players: session.players,
        allowSpectatorReactions: session.allowSpectatorReactions,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    };
  }

  /**
   * Leaderboard d'une session
   * GET /api/v1/sessions/:code/leaderboard
   */
  @Get('sessions/:code/leaderboard')
  @RequireScopes('sessions:read')
  async getSessionLeaderboard(@Param('code') code: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { code },
      include: {
        players: {
          orderBy: { score: 'desc' },
          include: {
            answers: {
              select: {
                correct: true,
                timeMs: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      success: true,
      data: {
        sessionCode: code,
        status: session.status,
        leaderboard: session.players.map((p, index) => ({
          rank: index + 1,
          playerId: p.id,
          nickname: p.nickname,
          score: p.score,
          correctAnswers: p.answers.filter(a => a.correct).length,
          totalAnswers: p.answers.length,
          averageTimeMs: p.answers.length > 0
            ? Math.round(p.answers.reduce((sum, a) => sum + a.timeMs, 0) / p.answers.length)
            : 0,
        })),
      },
    };
  }

  // ========================================
  // USERS
  // ========================================

  /**
   * Profil d'un utilisateur
   * GET /api/v1/users/:id
   */
  @Get('users/:id')
  @RequireScopes('users:read')
  async getUser(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        xp: true,
        streak: true,
        badges: {
          include: {
            badge: true,
          },
          orderBy: { earnedAt: 'desc' },
        },
        _count: {
          select: {
            quizzes: true,
            gameHistory: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        profile: user.profile ? {
          displayName: user.profile.displayName,
          bio: user.profile.bio,
          bannerColor: user.profile.bannerColor,
        } : null,
        stats: {
          level: user.xp?.level ?? 1,
          totalXp: user.xp?.totalXp ?? 0,
          currentStreak: user.streak?.currentStreak ?? 0,
          longestStreak: user.streak?.longestStreak ?? 0,
          quizzesCreated: user._count.quizzes,
          gamesPlayed: user._count.gameHistory,
        },
        badges: user.badges.map(ub => ({
          code: ub.badge.code,
          name: ub.badge.name,
          description: ub.badge.description,
          rarity: ub.badge.rarity,
          earnedAt: ub.earnedAt,
        })),
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Historique de jeu d'un utilisateur
   * GET /api/v1/users/:id/history
   */
  @Get('users/:id/history')
  @RequireScopes('users:read')
  async getUserHistory(
    @Param('id') id: string,
    @Query() query: PaginationQuery,
  ) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [history, total] = await Promise.all([
      this.prisma.gameHistory.findMany({
        where: { userId: id },
        skip,
        take: limit,
        orderBy: { playedAt: 'desc' },
      }),
      this.prisma.gameHistory.count({ where: { userId: id } }),
    ]);

    return {
      success: true,
      data: history.map(h => ({
        sessionCode: h.sessionCode,
        quizTitle: h.quizTitle,
        score: h.score,
        rank: h.rank,
        totalPlayers: h.totalPlayers,
        correctCount: h.correctCount,
        totalQuestions: h.totalQuestions,
        avgTimeMs: h.avgTimeMs,
        playedAt: h.playedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ========================================
  // ANALYTICS
  // ========================================

  /**
   * Statistiques globales de la plateforme
   * GET /api/v1/analytics/overview
   */
  @Get('analytics/overview')
  @RequireScopes('analytics:read')
  async getAnalyticsOverview() {
    const [
      totalUsers,
      totalQuizzes,
      totalSessions,
      activeSessions,
      totalGamesPlayed,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.quiz.count(),
      this.prisma.gameSession.count(),
      this.prisma.gameSession.count({ where: { status: { not: 'finished' } } }),
      this.prisma.gameHistory.count(),
      this.prisma.user.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        totalUsers,
        totalQuizzes,
        totalSessions,
        activeSessions,
        totalGamesPlayed,
        newUsersLast7Days: recentUsers,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Leaderboard global
   * GET /api/v1/analytics/leaderboard
   */
  @Get('analytics/leaderboard')
  @RequireScopes('analytics:read')
  async getGlobalLeaderboard(
    @Query() query: PaginationQuery & { period?: string },
  ) {
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10)));
    const skip = (page - 1) * limit;
    const period = query.period || 'all_time';

    if (!['all_time', 'monthly', 'weekly'].includes(period)) {
      throw new BadRequestException('Invalid period. Use: all_time, monthly, weekly');
    }

    const [entries, total] = await Promise.all([
      this.prisma.globalLeaderboard.findMany({
        where: { period },
        skip,
        take: limit,
        orderBy: { score: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.globalLeaderboard.count({ where: { period } }),
    ]);

    return {
      success: true,
      data: entries.map((e, index) => ({
        rank: skip + index + 1,
        user: e.user,
        score: e.score,
        wins: e.wins,
        gamesPlayed: e.gamesPlayed,
      })),
      period,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
