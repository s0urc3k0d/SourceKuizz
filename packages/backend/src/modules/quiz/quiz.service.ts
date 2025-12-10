import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { z } from 'zod';

export const quizCreateDto = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export const quizUpdateDto = quizCreateDto.partial();

export const paginationDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationParams = z.infer<typeof paginationDto>;

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, data: z.infer<typeof quizCreateDto>) {
    return this.prisma.quiz.create({ data: { ...data, ownerId } });
  }

  async list(ownerId: string, pagination?: PaginationParams): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 20 } = pagination || {};
    const skip = (page - 1) * limit;
    
    const [data, total] = await Promise.all([
      this.prisma.quiz.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.quiz.count({ where: { ownerId } }),
    ]);
    
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async get(ownerId: string, id: string) {
    const quiz = await this.prisma.quiz.findFirst({ where: { id, ownerId } });
    if (!quiz) throw new NotFoundException();
    return quiz;
  }

  async update(ownerId: string, id: string, patch: z.infer<typeof quizUpdateDto>) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException();
    if (quiz.ownerId !== ownerId) throw new ForbiddenException();
    return this.prisma.quiz.update({ where: { id }, data: patch });
  }

  async remove(ownerId: string, id: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id } });
    if (!quiz) throw new NotFoundException();
    if (quiz.ownerId !== ownerId) throw new ForbiddenException();
    
    // Suppression en cascade: options -> questions -> sessions -> quiz
    await this.prisma.$transaction(async (tx) => {
      // Supprimer les options des questions
      await tx.questionOption.deleteMany({
        where: { question: { quizId: id } },
      });
      // Supprimer les questions
      await tx.question.deleteMany({ where: { quizId: id } });
      // Supprimer les réponses des joueurs liées aux sessions de ce quiz
      const sessions = await tx.gameSession.findMany({ where: { quizId: id }, select: { id: true } });
      const sessionIds = sessions.map(s => s.id);
      if (sessionIds.length > 0) {
        await tx.playerAnswer.deleteMany({
          where: { player: { sessionId: { in: sessionIds } } },
        });
        await tx.gamePlayer.deleteMany({ where: { sessionId: { in: sessionIds } } });
      }
      // Supprimer les sessions
      await tx.gameSession.deleteMany({ where: { quizId: id } });
      // Supprimer le quiz
      await tx.quiz.delete({ where: { id } });
    });
    
    return { deleted: true };
  }
}
