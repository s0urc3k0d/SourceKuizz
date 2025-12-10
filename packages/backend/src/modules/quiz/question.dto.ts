import { z } from 'zod';

// Types de questions supportés
export const QUESTION_TYPE_ENUM = z.enum([
  'multiple_choice', // Choix multiples (ancien 'mcq')
  'true_false',      // Vrai/Faux (ancien 'bool')
  'text_input',      // Réponse texte libre
  'ordering',        // Ordonnancement
  // Legacy aliases
  'mcq',
  'multi',
  'bool',
]);

export const questionOptionDto = z.object({
  label: z.string().min(1).max(200),
  isCorrect: z.boolean().optional().default(false),
  weight: z.number().int().min(1).max(10).optional().default(1),
  orderIndex: z.number().int().optional(), // Pour les questions d'ordre
});

export const createQuestionDto = z.object({
  type: QUESTION_TYPE_ENUM.default('multiple_choice'),
  prompt: z.string().min(1).max(500),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video', 'audio']).optional(),
  timeLimitMs: z.number().int().min(1000).max(120000).default(15000),
  // Pour multiple_choice et ordering
  options: z.array(questionOptionDto).min(2).max(8).optional(),
  // Pour true_false
  correctAnswer: z.boolean().optional(),
  // Pour text_input
  correctAnswers: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional().default(false),
}).refine((data) => {
  // Validation conditionnelle selon le type
  const type = normalizeQuestionType(data.type);
  
  if (type === 'multiple_choice' || type === 'ordering') {
    return data.options && data.options.length >= 2;
  }
  if (type === 'text_input') {
    return data.correctAnswers && data.correctAnswers.length > 0;
  }
  return true; // true_false n'a pas besoin d'options
}, {
  message: 'Invalid question data for the specified type',
});

// Normalise les anciens types vers les nouveaux
export function normalizeQuestionType(type: string): string {
  const mapping: Record<string, string> = {
    'mcq': 'multiple_choice',
    'multi': 'multiple_choice',
    'bool': 'true_false',
  };
  return mapping[type] || type;
}

// Version partielle pour les mises à jour (on ne peut pas utiliser .partial() sur un ZodEffects)
export const updateQuestionDto = z.object({
  type: QUESTION_TYPE_ENUM.optional(),
  prompt: z.string().min(1).max(500).optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video', 'audio']).optional(),
  timeLimitMs: z.number().int().min(1000).max(120000).optional(),
  options: z.array(questionOptionDto).min(2).max(8).optional(),
  correctAnswer: z.boolean().optional(),
  correctAnswers: z.array(z.string()).optional(),
  caseSensitive: z.boolean().optional(),
});

export type CreateQuestionInput = z.infer<typeof createQuestionDto>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionDto>;

export const reorderQuestionsDto = z.object({
  orderedIds: z.array(z.string()).min(1),
});
export type ReorderQuestionsInput = z.infer<typeof reorderQuestionsDto>;
