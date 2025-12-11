import { z } from 'zod';

/**
 * Types partagés pour le backend
 */

// Type utilisateur authentifié (extrait du JWT)
export interface AuthenticatedUser {
  id: string;
  username: string;
}

// Type pour les réponses rejetées WebSocket
export interface WSRejectPayload {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
}

// Types pour les DTOs d'authentification
export const loginDtoSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});

export const registerDtoSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(6).max(128),
});

export const refreshDtoSchema = z.object({
  refreshToken: z.string().min(1),
});

export type LoginDto = z.infer<typeof loginDtoSchema>;
export type RegisterDto = z.infer<typeof registerDtoSchema>;
export type RefreshDto = z.infer<typeof refreshDtoSchema>;

// Types pour session
export const ensureSessionDtoSchema = z.object({
  quizId: z.string().min(1),  // CUID format (not UUID)
  code: z.string().regex(/^[A-Z0-9]{6}$/).optional(),
});

export type EnsureSessionDto = z.infer<typeof ensureSessionDtoSchema>;

// Types pour les réponses paginées
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// Type pour les erreurs Zod
export interface ZodValidationError {
  name: 'ZodError';
  errors: z.ZodIssue[];
}

export function isZodError(e: unknown): e is ZodValidationError {
  return typeof e === 'object' && e !== null && (e as any).name === 'ZodError';
}

// Type pour les erreurs Prisma
export interface PrismaError {
  code: string;
  meta?: Record<string, unknown>;
}

export function isPrismaUniqueError(e: unknown): e is PrismaError {
  return typeof e === 'object' && e !== null && (e as any).code === 'P2002';
}
