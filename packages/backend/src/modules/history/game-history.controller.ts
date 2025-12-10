import { Controller, Get, Delete, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GameHistoryService, GameHistoryFilters } from './game-history.service';
import { ProfileService } from '../profile/profile.service';
import type { AuthenticatedUser } from '../../types';

@Controller('history')
export class GameHistoryController {
  constructor(
    private historyService: GameHistoryService,
    private profileService: ProfileService,
  ) {}

  /**
   * GET /history/me - Récupérer son historique
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyHistory(
    @Request() req: { user: AuthenticatedUser },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    const filters: GameHistoryFilters = {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      sortBy: sortBy as GameHistoryFilters['sortBy'],
      sortOrder: sortOrder as GameHistoryFilters['sortOrder'],
    };
    return this.historyService.getUserHistory(req.user.id, filters);
  }

  /**
   * GET /history/user/:userId - Voir l'historique public d'un utilisateur
   */
  @Get('user/:userId')
  async getUserHistory(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Vérifier si l'utilisateur autorise l'affichage de son historique
    const profile = await this.profileService.getPublicProfile(userId);
    if (!profile.showHistory) {
      throw new ForbiddenException('Cet utilisateur a désactivé l\'affichage de son historique');
    }

    const filters: GameHistoryFilters = {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };
    return this.historyService.getUserHistory(userId, filters);
  }

  /**
   * GET /history/:id - Détails d'une partie
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getGameDetail(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    const game = await this.historyService.getGameDetail(id);
    if (!game) {
      throw new ForbiddenException('Partie non trouvée');
    }
    // Seul le propriétaire peut voir les détails
    if (game.userId !== req.user.id) {
      throw new ForbiddenException('Accès interdit');
    }
    return game;
  }

  /**
   * DELETE /history/:id - Supprimer une entrée
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteEntry(
    @Param('id') id: string,
    @Request() req: { user: AuthenticatedUser },
  ) {
    await this.historyService.deleteHistoryEntry(id, req.user.id);
    return { success: true };
  }
}
