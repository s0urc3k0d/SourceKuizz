import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BadgeService } from './badge.service';
import { XPService } from './xp.service';
import { StreakService } from './streak.service';

@Controller('gamification')
export class GamificationController {
  constructor(
    private readonly badgeService: BadgeService,
    private readonly xpService: XPService,
    private readonly streakService: StreakService,
  ) {}

  // ==================== BADGES ====================

  /**
   * Récupère tous les badges disponibles
   */
  @Get('badges')
  async getAvailableBadges() {
    return this.badgeService.getAvailableBadges();
  }

  /**
   * Récupère les badges de l'utilisateur connecté
   */
  @Get('badges/me')
  @UseGuards(JwtAuthGuard)
  async getMyBadges(@Request() req: { user: { id: string } }) {
    return this.badgeService.getUserBadges(req.user.id);
  }

  /**
   * Récupère les badges d'un utilisateur spécifique
   */
  @Get('badges/user/:userId')
  async getUserBadges(@Param('userId') userId: string) {
    return this.badgeService.getUserBadges(userId);
  }

  // ==================== XP & NIVEAUX ====================

  /**
   * Récupère le niveau et l'XP de l'utilisateur connecté
   */
  @Get('xp/me')
  @UseGuards(JwtAuthGuard)
  async getMyXp(@Request() req: { user: { id: string } }) {
    return this.xpService.getLevelInfo(req.user.id);
  }

  /**
   * Récupère le niveau et l'XP d'un utilisateur spécifique
   */
  @Get('xp/user/:userId')
  async getUserXp(@Param('userId') userId: string) {
    return this.xpService.getLevelInfo(userId);
  }

  /**
   * Récupère le leaderboard XP global
   */
  @Get('xp/leaderboard')
  async getXpLeaderboard(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.xpService.getLevelLeaderboard(parsedLimit);
  }

  // ==================== STREAKS ====================

  /**
   * Récupère le streak de l'utilisateur connecté
   */
  @Get('streaks/me')
  @UseGuards(JwtAuthGuard)
  async getMyStreak(@Request() req: { user: { id: string } }) {
    return this.streakService.getCurrentStreak(req.user.id);
  }

  /**
   * Récupère le streak d'un utilisateur spécifique
   */
  @Get('streaks/user/:userId')
  async getUserStreak(@Param('userId') userId: string) {
    return this.streakService.getCurrentStreak(userId);
  }

  /**
   * Vérifie si le streak de l'utilisateur est en danger
   */
  @Get('streaks/me/at-risk')
  @UseGuards(JwtAuthGuard)
  async isMyStreakAtRisk(@Request() req: { user: { id: string } }) {
    const atRisk = await this.streakService.isStreakAtRisk(req.user.id);
    return { atRisk };
  }

  /**
   * Récupère le leaderboard des streaks actifs
   */
  @Get('streaks/leaderboard')
  async getStreakLeaderboard(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.streakService.getStreakLeaderboard(parsedLimit);
  }

  /**
   * Récupère le leaderboard des plus longs streaks historiques
   */
  @Get('streaks/leaderboard/longest')
  async getLongestStreakLeaderboard(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    return this.streakService.getLongestStreakLeaderboard(parsedLimit);
  }

  // ==================== PROFIL GAMIFICATION COMPLET ====================

  /**
   * Récupère toutes les stats de gamification de l'utilisateur connecté
   */
  @Get('profile/me')
  @UseGuards(JwtAuthGuard)
  async getMyGamificationProfile(@Request() req: { user: { id: string } }) {
    const [badges, xp, streak] = await Promise.all([
      this.badgeService.getUserBadges(req.user.id),
      this.xpService.getLevelInfo(req.user.id),
      this.streakService.getCurrentStreak(req.user.id),
    ]);

    return {
      badges,
      xp,
      streak,
    };
  }

  /**
   * Récupère toutes les stats de gamification d'un utilisateur
   */
  @Get('profile/:userId')
  async getUserGamificationProfile(@Param('userId') userId: string) {
    const [badges, xp, streak] = await Promise.all([
      this.badgeService.getUserBadges(userId),
      this.xpService.getLevelInfo(userId),
      this.streakService.getCurrentStreak(userId),
    ]);

    return {
      badges,
      xp,
      streak,
    };
  }

  // ==================== LEADERBOARD GLOBAL ====================

  /**
   * Récupère le leaderboard global combiné (XP + Streaks)
   */
  @Get('leaderboard')
  async getGlobalLeaderboard(
    @Query('type') type: 'xp' | 'streak' | 'longest-streak' = 'xp',
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;

    switch (type) {
      case 'streak':
        return {
          type: 'streak',
          entries: await this.streakService.getStreakLeaderboard(parsedLimit),
        };
      case 'longest-streak':
        return {
          type: 'longest-streak',
          entries: await this.streakService.getLongestStreakLeaderboard(parsedLimit),
        };
      case 'xp':
      default:
        return {
          type: 'xp',
          entries: await this.xpService.getLevelLeaderboard(parsedLimit),
        };
    }
  }
}
