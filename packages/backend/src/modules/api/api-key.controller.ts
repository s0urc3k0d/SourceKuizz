import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiKeyService, API_SCOPES } from './api-key.service';

interface CreateApiKeyDto {
  name: string;
  scopes?: string[];
  expiresInDays?: number;
  rateLimit?: number;
}

@Controller('api/keys')
@UseGuards(JwtAuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Créer une nouvelle clé API
   * POST /api/keys
   */
  @Post()
  async createApiKey(
    @Request() req: any,
    @Body() body: CreateApiKeyDto,
  ) {
    if (!body.name || body.name.trim().length === 0) {
      throw new BadRequestException('Name is required');
    }

    if (body.name.length > 100) {
      throw new BadRequestException('Name must be less than 100 characters');
    }

    // Valider les scopes
    if (body.scopes) {
      const invalidScopes = body.scopes.filter(
        s => !API_SCOPES.includes(s as any)
      );
      if (invalidScopes.length > 0) {
        throw new BadRequestException(
          `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${API_SCOPES.join(', ')}`
        );
      }
    }

    const result = await this.apiKeyService.createApiKey(
      req.user.userId,
      body.name.trim(),
      body.scopes,
      {
        expiresInDays: body.expiresInDays,
        rateLimit: body.rateLimit,
      },
    );

    return {
      success: true,
      message: 'API key created. Store this key securely - it will not be shown again.',
      key: result.key,
      data: result.data,
    };
  }

  /**
   * Lister les clés API de l'utilisateur
   * GET /api/keys
   */
  @Get()
  async listApiKeys(@Request() req: any) {
    const keys = await this.apiKeyService.listUserApiKeys(req.user.userId);
    return {
      success: true,
      keys,
      availableScopes: API_SCOPES,
    };
  }

  /**
   * Obtenir les statistiques d'une clé API
   * GET /api/keys/:id/stats
   */
  @Get(':id/stats')
  async getApiKeyStats(@Request() req: any, @Param('id') keyId: string) {
    const stats = await this.apiKeyService.getApiKeyStats(req.user.userId, keyId);
    
    if (!stats) {
      throw new BadRequestException('API key not found');
    }

    return {
      success: true,
      ...stats,
    };
  }

  /**
   * Révoquer une clé API
   * DELETE /api/keys/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async revokeApiKey(@Request() req: any, @Param('id') keyId: string) {
    const revoked = await this.apiKeyService.revokeApiKey(req.user.userId, keyId);

    if (!revoked) {
      throw new BadRequestException('API key not found or already revoked');
    }

    return {
      success: true,
      message: 'API key revoked successfully',
    };
  }
}
