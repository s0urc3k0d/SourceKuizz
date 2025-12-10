import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard, AdminOnly } from '../auth/admin.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Statistiques globales (Admin only)
   * GET /analytics/overview
   */
  @Get('overview')
  @AdminOnly()
  async getOverview() {
    const stats = await this.analyticsService.getOverviewStats();
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Tendance des inscriptions (Admin only)
   * GET /analytics/trends/registrations?days=30
   */
  @Get('trends/registrations')
  @AdminOnly()
  async getRegistrationTrend(@Query('days') days?: string) {
    const numDays = Math.min(90, Math.max(7, parseInt(days || '30', 10)));
    const trend = await this.analyticsService.getUserRegistrationTrend(numDays);
    return {
      success: true,
      data: trend,
      period: `${numDays} days`,
    };
  }

  /**
   * Tendance des parties jouées (Admin only)
   * GET /analytics/trends/games?days=30
   */
  @Get('trends/games')
  @AdminOnly()
  async getGamesTrend(@Query('days') days?: string) {
    const numDays = Math.min(90, Math.max(7, parseInt(days || '30', 10)));
    const trend = await this.analyticsService.getGamesPlayedTrend(numDays);
    return {
      success: true,
      data: trend,
      period: `${numDays} days`,
    };
  }

  /**
   * Statistiques par type de question (Admin only)
   * GET /analytics/question-types
   */
  @Get('question-types')
  @AdminOnly()
  async getQuestionTypeStats() {
    const stats = await this.analyticsService.getQuestionTypeStats();
    return {
      success: true,
      data: stats,
    };
  }

  /**
   * Top quizzes (Admin only)
   * GET /analytics/top-quizzes?limit=10
   */
  @Get('top-quizzes')
  @AdminOnly()
  async getTopQuizzes(@Query('limit') limit?: string) {
    const numLimit = Math.min(50, Math.max(5, parseInt(limit || '10', 10)));
    const quizzes = await this.analyticsService.getTopQuizzes(numLimit);
    return {
      success: true,
      data: quizzes,
    };
  }

  /**
   * Top joueurs (Admin only)
   * GET /analytics/top-players?limit=10
   */
  @Get('top-players')
  @AdminOnly()
  async getTopPlayers(@Query('limit') limit?: string) {
    const numLimit = Math.min(50, Math.max(5, parseInt(limit || '10', 10)));
    const players = await this.analyticsService.getTopPlayers(numLimit);
    return {
      success: true,
      data: players,
    };
  }

  /**
   * Distribution des badges (Admin only)
   * GET /analytics/badges
   */
  @Get('badges')
  @AdminOnly()
  async getBadgeDistribution() {
    const distribution = await this.analyticsService.getBadgeDistribution();
    return {
      success: true,
      data: distribution,
    };
  }

  /**
   * Temps de réponse moyens (Admin only)
   * GET /analytics/response-times
   */
  @Get('response-times')
  @AdminOnly()
  async getResponseTimes() {
    const times = await this.analyticsService.getAverageResponseTimes();
    return {
      success: true,
      data: times,
    };
  }

  /**
   * Activité par heure (Admin only)
   * GET /analytics/activity-hours
   */
  @Get('activity-hours')
  @AdminOnly()
  async getActivityByHour() {
    const activity = await this.analyticsService.getActivityByHour();
    return {
      success: true,
      data: activity,
    };
  }

  /**
   * Mes statistiques personnelles (accessible à tous les utilisateurs connectés)
   * GET /analytics/me
   */
  @Get('me')
  async getMyAnalytics(@Request() req: any) {
    const analytics = await this.analyticsService.getUserAnalytics(req.user.id);

    if (!analytics) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: analytics,
    };
  }

  /**
   * Statistiques d'un utilisateur spécifique (Admin only)
   * GET /analytics/users/:id
   */
  @Get('users/:id')
  @AdminOnly()
  async getUserAnalytics(@Param('id') userId: string) {
    const analytics = await this.analyticsService.getUserAnalytics(userId);

    if (!analytics) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: analytics,
    };
  }
}
