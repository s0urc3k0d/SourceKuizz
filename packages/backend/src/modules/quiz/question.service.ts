import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateQuestionInput, UpdateQuestionInput, ReorderQuestionsInput } from './question.dto';
import { Prisma } from '@prisma/client';
import { QUESTION_TYPES, QuestionType } from './question-types';

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
    
    const questionType = data.type as QuestionType || QUESTION_TYPES.MULTIPLE_CHOICE;
    
    // Validation selon le type
    this.validateQuestionData(questionType, data);
    
    const existingCount = await this.prisma.question.count({ where: { quizId } });
    
    // Création selon le type
    switch (questionType) {
      case QUESTION_TYPES.TRUE_FALSE:
        return this.createTrueFalseQuestion(quizId, data, existingCount);
      case QUESTION_TYPES.TEXT_INPUT:
        return this.createTextInputQuestion(quizId, data, existingCount);
      case QUESTION_TYPES.ORDERING:
        return this.createOrderingQuestion(quizId, data, existingCount);
      case QUESTION_TYPES.MULTIPLE_CHOICE:
      default:
        return this.createMultipleChoiceQuestion(quizId, data, existingCount);
    }
  }

  private validateQuestionData(type: QuestionType, data: CreateQuestionInput) {
    switch (type) {
      case QUESTION_TYPES.MULTIPLE_CHOICE:
        if (!data.options || data.options.length < 2) {
          throw new BadRequestException('multiple_choice_requires_2_options');
        }
        if (!data.options.some(o => o.isCorrect)) {
          throw new BadRequestException('no_correct_option');
        }
        break;
        
      case QUESTION_TYPES.TRUE_FALSE:
        // Pas besoin d'options, elles seront générées automatiquement
        break;
        
      case QUESTION_TYPES.TEXT_INPUT:
        if (!data.correctAnswers || data.correctAnswers.length === 0) {
          throw new BadRequestException('text_input_requires_correct_answers');
        }
        break;
        
      case QUESTION_TYPES.ORDERING:
        if (!data.options || data.options.length < 2) {
          throw new BadRequestException('ordering_requires_2_items');
        }
        break;
    }
  }

  private async createMultipleChoiceQuestion(quizId: string, data: CreateQuestionInput, order: number) {
    return this.prisma.question.create({
      data: {
        quizId,
        type: QUESTION_TYPES.MULTIPLE_CHOICE,
        prompt: data.prompt,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        timeLimitMs: data.timeLimitMs,
        order,
        options: { 
          create: data.options!.map(o => ({ 
            label: o.label, 
            isCorrect: o.isCorrect ?? false, 
            weight: o.weight ?? 1 
          })) 
        },
      },
      include: { options: true },
    });
  }

  private async createTrueFalseQuestion(quizId: string, data: CreateQuestionInput, order: number) {
    // Déterminer si "Vrai" est la bonne réponse
    const correctAnswer = data.correctAnswer ?? true;
    
    return this.prisma.question.create({
      data: {
        quizId,
        type: QUESTION_TYPES.TRUE_FALSE,
        prompt: data.prompt,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        timeLimitMs: data.timeLimitMs,
        order,
        options: {
          create: [
            { label: 'Vrai', isCorrect: correctAnswer === true, weight: 1 },
            { label: 'Faux', isCorrect: correctAnswer === false, weight: 1 },
          ],
        },
      },
      include: { options: true },
    });
  }

  private async createTextInputQuestion(quizId: string, data: CreateQuestionInput, order: number) {
    return this.prisma.question.create({
      data: {
        quizId,
        type: QUESTION_TYPES.TEXT_INPUT,
        prompt: data.prompt,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        timeLimitMs: data.timeLimitMs,
        order,
        correctAnswers: JSON.stringify(data.correctAnswers),
        caseSensitive: data.caseSensitive ?? false,
      },
      include: { options: true },
    });
  }

  private async createOrderingQuestion(quizId: string, data: CreateQuestionInput, order: number) {
    return this.prisma.question.create({
      data: {
        quizId,
        type: QUESTION_TYPES.ORDERING,
        prompt: data.prompt,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        timeLimitMs: data.timeLimitMs,
        order,
        options: {
          create: data.options!.map((o, idx) => ({
            label: o.label,
            isCorrect: true, // Toutes sont "correctes" si bien placées
            orderIndex: idx,
            weight: 1,
          })),
        },
      },
      include: { options: true },
    });
  }

  /**
   * Vérifie si une réponse est correcte selon le type de question
   */
  async checkAnswer(
    questionId: string,
    answer: {
      optionId?: string;
      textAnswer?: string;
      orderedOptionIds?: string[];
    }
  ): Promise<{ correct: boolean; partialScore?: number }> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: true },
    });

    if (!question) {
      throw new BadRequestException('Question not found');
    }

    const questionType = question.type as QuestionType;

    switch (questionType) {
      case QUESTION_TYPES.MULTIPLE_CHOICE:
      case QUESTION_TYPES.TRUE_FALSE:
        return this.checkOptionAnswer(question.options, answer.optionId);

      case QUESTION_TYPES.TEXT_INPUT:
        return this.checkTextAnswer(
          question.correctAnswers,
          question.caseSensitive,
          answer.textAnswer
        );

      case QUESTION_TYPES.ORDERING:
        return this.checkOrderingAnswer(question.options, answer.orderedOptionIds);

      default:
        return { correct: false };
    }
  }

  private checkOptionAnswer(
    options: Array<{ id: string; isCorrect: boolean }>,
    optionId?: string
  ): { correct: boolean } {
    if (!optionId) return { correct: false };
    const option = options.find(o => o.id === optionId);
    return { correct: option?.isCorrect ?? false };
  }

  private checkTextAnswer(
    correctAnswersJson: string | null,
    caseSensitive: boolean,
    textAnswer?: string
  ): { correct: boolean } {
    if (!textAnswer || !correctAnswersJson) return { correct: false };

    let correctAnswers: string[];
    try {
      correctAnswers = JSON.parse(correctAnswersJson);
    } catch {
      return { correct: false };
    }

    const normalize = (s: string) => {
      let normalized = s.trim();
      if (!caseSensitive) {
        normalized = normalized.toLowerCase();
      }
      return normalized;
    };

    const normalizedAnswer = normalize(textAnswer);
    const isCorrect = correctAnswers.some(ca => normalize(ca) === normalizedAnswer);

    return { correct: isCorrect };
  }

  private checkOrderingAnswer(
    options: Array<{ id: string; orderIndex: number | null }>,
    orderedOptionIds?: string[]
  ): { correct: boolean; partialScore: number } {
    if (!orderedOptionIds || orderedOptionIds.length === 0) {
      return { correct: false, partialScore: 0 };
    }

    const sortedOptions = [...options]
      .filter(o => o.orderIndex !== null)
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const correctOrder = sortedOptions.map(o => o.id);

    const isFullyCorrect =
      orderedOptionIds.length === correctOrder.length &&
      orderedOptionIds.every((id, idx) => id === correctOrder[idx]);

    let correctPositions = 0;
    for (let i = 0; i < Math.min(orderedOptionIds.length, correctOrder.length); i++) {
      if (orderedOptionIds[i] === correctOrder[i]) {
        correctPositions++;
      }
    }

    const partialScore = correctOrder.length > 0
      ? correctPositions / correctOrder.length
      : 0;

    return { correct: isFullyCorrect, partialScore };
  }

  /**
   * Mélange les options d'une question (pour l'affichage)
   */
  shuffleOptions<T extends { id: string }>(options: T[]): T[] {
    const shuffled = [...options];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
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
    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

  async reorder(quizId: string, ownerId: string, data: ReorderQuestionsInput) {
    await this.assertQuizOwnership(quizId, ownerId);
    const questions = await this.prisma.question.findMany({ where: { quizId }, select: { id: true } });
    const idsSet = new Set(questions.map((q: { id: string }) => q.id));
    if (data.orderedIds.some(id => !idsSet.has(id))) throw new BadRequestException('invalid_question_id_in_order');
    return this.prisma.$transaction(
      data.orderedIds.map((id, idx) => this.prisma.question.update({ where: { id }, data: { order: idx } }))
    );
  }

  async duplicate(quizId: string, questionId: string, ownerId: string) {
    await this.assertQuizOwnership(quizId, ownerId);
    const existing = await this.prisma.question.findUnique({ where: { id: questionId }, include: { options: true } });
    if (!existing || existing.quizId !== quizId) throw new NotFoundException('question_not_found');
    const count = await this.prisma.question.count({ where: { quizId } });
    const created = await this.prisma.question.create({
      data: {
        quizId,
        type: existing.type,
        prompt: existing.prompt + ' (copie)',
        mediaUrl: existing.mediaUrl ?? undefined,
        timeLimitMs: existing.timeLimitMs,
        order: count,
        options: { create: existing.options.map((o: { label: string; isCorrect: boolean; weight: number }) => ({ label: o.label, isCorrect: o.isCorrect, weight: o.weight })) },
      },
      include: { options: true },
    });
    return created;
  }
}
