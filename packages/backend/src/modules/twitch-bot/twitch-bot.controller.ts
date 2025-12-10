import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TwitchBotService } from './twitch-bot.service';
import { PrismaService } from '../database/prisma.service';

@Controller('twitch-bot')
@UseGuards(JwtAuthGuard)
export class TwitchBotController {
  constructor(
    private readonly twitchBotService: TwitchBotService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Activer le bot Twitch pour une session
   * POST /twitch-bot/sessions/:code/enable
   */
  @Post('sessions/:code/enable')
  async enableBot(
    @Param('code') code: string,
    @Body() body: { channel?: string },
    @Request() req: any,
  ) {
    // Vérifier que la session existe et appartient à l'utilisateur
    const session = await this.prisma.gameSession.findUnique({
      where: { code },
      include: {
        quiz: { select: { ownerId: true } },
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (session.quiz.ownerId !== req.user.id) {
      throw new ForbiddenException('Not the session owner');
    }

    // Utiliser le channel Twitch du propriétaire ou celui spécifié
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const channel = body.channel || user?.username;
    if (!channel) {
      throw new BadRequestException('Twitch channel required');
    }

    const success = await this.twitchBotService.joinChannel(
      channel,
      code,
      session.quizId,
      req.user.id,
    );

    if (!success) {
      throw new BadRequestException('Failed to enable Twitch bot. Check bot configuration.');
    }

    return {
      success: true,
      message: `Bot enabled for channel #${channel}`,
      channel,
      sessionCode: code,
    };
  }

  /**
   * Désactiver le bot Twitch pour une session
   * DELETE /twitch-bot/sessions/:code
   */
  @Delete('sessions/:code')
  async disableBot(@Param('code') code: string, @Request() req: any) {
    // Vérifier les permissions
    const session = await this.prisma.gameSession.findUnique({
      where: { code },
      include: {
        quiz: { select: { ownerId: true } },
      },
    });

    if (!session) {
      throw new BadRequestException('Session not found');
    }

    if (session.quiz.ownerId !== req.user.id) {
      throw new ForbiddenException('Not the session owner');
    }

    await this.twitchBotService.leaveChannel(code);

    return {
      success: true,
      message: 'Bot disabled',
    };
  }

  /**
   * Obtenir le statut du bot pour une session
   * GET /twitch-bot/sessions/:code/status
   */
  @Get('sessions/:code/status')
  async getBotStatus(@Param('code') code: string) {
    const isActive = this.twitchBotService.isSessionActive(code);
    const chatPlayerCount = this.twitchBotService.getChatPlayerCount(code);

    return {
      success: true,
      isActive,
      chatPlayerCount,
    };
  }
}
