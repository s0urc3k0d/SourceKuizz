import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateQuestionInput, UpdateQuestionInput } from './question.dto';

@Injectable()
export class QuestionService {
  constructor(private prisma: PrismaService) {}

  private async assertQuizOwnership(quizId: string, ownerId: string) {
    const quiz = await this.prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) throw new NotFoundException('quiz_not_found');
    if (quiz.ownerId !== ownerId) throw new ForbiddenException();
    return quiz;
  }

  async create(quizId: string, ownerId: string, data: CreateQuestionInput) {
    await this.assertQuizOwnership(quizId, ownerId);
    const correctCount = data.options.filter(o => o.isCorrect).length;
    if (correctCount === 0) throw new BadRequestException('no_correct_option');
    const existingCount = await this.prisma.question.count({ where: { quizId } });
    const question = await this.prisma.question.create({
      data: {
        quizId,
        type: data.type,
        prompt: data.prompt,
        mediaUrl: data.mediaUrl,
        timeLimitMs: data.timeLimitMs,
        order: existingCount,
        options: { create: data.options.map(o => ({ label: o.label, isCorrect: o.isCorrect ?? false, weight: o.weight ?? 1 })) },
      },
      include: { options: true },
    });
    return question;
  }

  async list(quizId: string, ownerId: string) {
    await this.assertQuizOwnership(quizId, ownerId);
    return this.prisma.question.findMany({ where: { quizId }, include: { options: true }, orderBy: { order: 'asc' } });
  }

  async update(quizId: string, questionId: string, ownerId: string, patch: UpdateQuestionInput) {
    await this.assertQuizOwnership(quizId, ownerId);
    const existing = await this.prisma.question.findUnique({ where: { id: questionId }, include: { options: true } });
    if (!existing || existing.quizId !== quizId) throw new NotFoundException('question_not_found');
    if (patch.options) {
      const correctCount = patch.options.filter(o => o.isCorrect).length;
      if (correctCount === 0) throw new BadRequestException('no_correct_option');
    }
    const updated = await this.prisma.$transaction(async tx => {
      if (patch.options) {
        await tx.questionOption.deleteMany({ where: { questionId } });
      }
      return tx.question.update({
        where: { id: questionId },
        data: {
          type: patch.type ?? existing.type,
            prompt: patch.prompt ?? existing.prompt,
            mediaUrl: patch.mediaUrl ?? existing.mediaUrl,
            timeLimitMs: patch.timeLimitMs ?? existing.timeLimitMs,
            options: patch.options
              ? { create: patch.options.map(o => ({ label: o.label, isCorrect: o.isCorrect ?? false, weight: o.weight ?? 1 })) }
              : undefined,
        },
        include: { options: true },
      });
    });
    return updated;
  }

  async remove(quizId: string, questionId: string, ownerId: string) {
    await this.assertQuizOwnership(quizId, ownerId);
    const existing = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!existing || existing.quizId !== quizId) throw new NotFoundException('question_not_found');
    await this.prisma.question.delete({ where: { id: questionId } });
    return { deleted: true };
  }
}
