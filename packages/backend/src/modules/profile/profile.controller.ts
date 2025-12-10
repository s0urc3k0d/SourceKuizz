import { Controller, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileService, UpdateProfileDto } from './profile.service';
import type { AuthenticatedUser } from '../../types';

@Controller('profile')
export class ProfileController {
  constructor(private profileService: ProfileService) {}

  /**
   * GET /profile/me - Récupérer son propre profil
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyProfile(@Request() req: { user: AuthenticatedUser }) {
    const profile = await this.profileService.getOrCreateProfile(req.user.id);
    const stats = await this.profileService.getUserStats(req.user.id);
    return { profile, stats };
  }

  /**
   * PATCH /profile/me - Mettre à jour son profil
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMyProfile(
    @Request() req: { user: AuthenticatedUser },
    @Body() body: UpdateProfileDto
  ) {
    return this.profileService.updateProfile(req.user.id, body);
  }

  /**
   * GET /profile/:userId - Voir le profil public d'un utilisateur
   */
  @Get(':userId')
  async getPublicProfile(@Param('userId') userId: string) {
    const profile = await this.profileService.getPublicProfile(userId);
    
    // Si l'utilisateur autorise l'affichage des stats
    let stats = null;
    if (profile.showStats) {
      stats = await this.profileService.getUserStats(userId);
    }

    return { profile, stats };
  }
}
