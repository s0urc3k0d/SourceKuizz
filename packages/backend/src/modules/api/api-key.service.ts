import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as crypto from 'crypto';

export interface ApiKeyData {
  id: string;
  name: string;
  keyPrefix: string;
  userId: string;
  scopes: string[];
  rateLimit: number;
  requestCount: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export const API_SCOPES = [
  'quizzes:read',
  'quizzes:write',
  'sessions:read',
  'sessions:write',
  'users:read',
  'analytics:read',
] as const;

export type ApiScope = typeof API_SCOPES[number];

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Génère une nouvelle clé API pour un utilisateur
   */
  async createApiKey(
    userId: string,
    name: string,
    scopes: string[] = ['quizzes:read'],
    options?: { expiresInDays?: number; rateLimit?: number }
  ): Promise<{ key: string; data: ApiKeyData }> {
    // Valider les scopes
    const validScopes = scopes.filter(s => API_SCOPES.includes(s as ApiScope));
    if (validScopes.length === 0) {
      validScopes.push('quizzes:read');
    }

    // Générer une clé aléatoire
    const rawKey = `sk_live_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 16);

    const expiresAt = options?.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await this.prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        userId,
        scopes: JSON.stringify(validScopes),
        rateLimit: options?.rateLimit ?? 1000,
        expiresAt,
      },
    });

    this.logger.log(`API key created for user ${userId}: ${keyPrefix}...`);

    return {
      key: rawKey, // Ne sera affiché qu'une seule fois
      data: this.formatApiKey(apiKey),
    };
  }

  /**
   * Valide une clé API et vérifie le rate limiting
   */
  async validateApiKey(key: string): Promise<{
    valid: boolean;
    userId?: string;
    scopes?: string[];
    error?: string;
  }> {
    if (!key || !key.startsWith('sk_live_')) {
      return { valid: false, error: 'invalid_key_format' };
    }

    const keyHash = this.hashKey(key);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      return { valid: false, error: 'key_not_found' };
    }

    if (apiKey.revokedAt) {
      return { valid: false, error: 'key_revoked' };
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return { valid: false, error: 'key_expired' };
    }

    // Vérifier le rate limiting
    const rateLimitResult = await this.checkAndUpdateRateLimit(apiKey);
    if (!rateLimitResult.allowed) {
      return { valid: false, error: 'rate_limit_exceeded' };
    }

    return {
      valid: true,
      userId: apiKey.userId,
      scopes: JSON.parse(apiKey.scopes),
    };
  }

  /**
   * Vérifie et met à jour le rate limiting
   */
  private async checkAndUpdateRateLimit(apiKey: {
    id: string;
    rateLimit: number;
    requestCount: number;
    lastResetAt: Date;
  }): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Reset le compteur si plus d'une heure depuis le dernier reset
    if (apiKey.lastResetAt < oneHourAgo) {
      await this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: {
          requestCount: 1,
          lastResetAt: now,
          lastUsedAt: now,
        },
      });
      return {
        allowed: true,
        remaining: apiKey.rateLimit - 1,
        resetAt: new Date(now.getTime() + 60 * 60 * 1000),
      };
    }

    // Vérifier si on dépasse la limite
    if (apiKey.requestCount >= apiKey.rateLimit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(apiKey.lastResetAt.getTime() + 60 * 60 * 1000),
      };
    }

    // Incrémenter le compteur
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        requestCount: { increment: 1 },
        lastUsedAt: now,
      },
    });

    return {
      allowed: true,
      remaining: apiKey.rateLimit - apiKey.requestCount - 1,
      resetAt: new Date(apiKey.lastResetAt.getTime() + 60 * 60 * 1000),
    };
  }

  /**
   * Liste les clés API d'un utilisateur
   */
  async listUserApiKeys(userId: string): Promise<ApiKeyData[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map(k => this.formatApiKey(k));
  }

  /**
   * Obtient les statistiques d'une clé API
   */
  async getApiKeyStats(userId: string, keyId: string): Promise<{
    key: ApiKeyData;
    usage: { date: string; requests: number }[];
  } | null> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId, revokedAt: null },
    });

    if (!apiKey) {
      return null;
    }

    // Statistiques des 7 derniers jours depuis les logs
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logs = await this.prisma.apiRequestLog.findMany({
      where: {
        keyId,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true },
    });

    // Grouper par jour
    const usageByDay = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      usageByDay.set(date.toISOString().split('T')[0], 0);
    }
    
    logs.forEach(log => {
      const day = log.createdAt.toISOString().split('T')[0];
      usageByDay.set(day, (usageByDay.get(day) || 0) + 1);
    });

    return {
      key: this.formatApiKey(apiKey),
      usage: Array.from(usageByDay.entries())
        .map(([date, requests]) => ({ date, requests }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Révoque une clé API
   */
  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key) {
      return false;
    }

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    this.logger.log(`API key revoked: ${key.keyPrefix}...`);
    return true;
  }

  /**
   * Enregistre une requête API dans les logs
   */
  async logRequest(
    keyId: string,
    endpoint: string,
    method: string,
    status: number,
    duration: number,
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.apiRequestLog.create({
      data: {
        keyId,
        endpoint,
        method,
        status,
        duration,
        ip,
        userAgent,
      },
    });
  }

  /**
   * Hash une clé API avec SHA-256
   */
  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  /**
   * Formate une clé API pour l'API
   */
  private formatApiKey(apiKey: any): ApiKeyData {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      userId: apiKey.userId,
      scopes: JSON.parse(apiKey.scopes),
      rateLimit: apiKey.rateLimit,
      requestCount: apiKey.requestCount,
      lastUsedAt: apiKey.lastUsedAt,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }
}
