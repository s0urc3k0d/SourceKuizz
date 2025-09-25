import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { z } from 'zod';

export const quizCreateDto = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

export const quizUpdateDto = quizCreateDto.partial();

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async create(ownerId: string, data: z.infer<typeof quizCreateDto>) {
    return this.prisma.quiz.create({ data: { ...data, ownerId } });
  }

  async list(ownerId: string) {
    return this.prisma.quiz.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' } });
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
    await this.prisma.quiz.delete({ where: { id } });
    return { deleted: true };
  }
}
