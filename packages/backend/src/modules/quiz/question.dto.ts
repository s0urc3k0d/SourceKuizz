import { z } from 'zod';

export const questionOptionDto = z.object({
  label: z.string().min(1).max(200),
  isCorrect: z.boolean().optional().default(false),
  weight: z.number().int().min(1).max(10).optional().default(1),
});

export const createQuestionDto = z.object({
  type: z.enum(['mcq', 'multi', 'bool']).default('mcq'),
  prompt: z.string().min(1).max(500),
  mediaUrl: z.string().url().optional(),
  timeLimitMs: z.number().int().min(1000).max(120000).default(15000),
  options: z.array(questionOptionDto).min(2).max(8),
});

export const updateQuestionDto = createQuestionDto.partial();

export type CreateQuestionInput = z.infer<typeof createQuestionDto>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionDto>;
