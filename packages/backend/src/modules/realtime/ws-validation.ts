import { z } from 'zod';

/**
 * Schémas de validation Zod pour tous les messages WebSocket
 * Utilisés côté backend pour valider les payloads entrants
 */

export const WSJoinSessionSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/).optional(),
  quizId: z.string().uuid(),
  nickname: z.string().min(1).max(32).optional(),
  spectator: z.boolean().optional(),
});

export const WSStartQuestionSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
});

export const WSToggleAutoNextSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  enabled: z.boolean(),
});

export const WSSubmitAnswerSchema = z.object({
  questionId: z.string(),
  // Pour multiple_choice et true_false
  optionId: z.string().optional(),
  // Pour text_input
  textAnswer: z.string().max(500).optional(),
  // Pour ordering
  orderedOptionIds: z.array(z.string()).optional(),
  clientTs: z.number().int().positive(),
  code: z.string().regex(/^[A-Z0-9]{6}$/).optional(),
}).refine((data) => {
  // Au moins un type de réponse doit être fourni
  return data.optionId || data.textAnswer || data.orderedOptionIds;
}, { message: 'At least one answer type must be provided' });

export const WSTransferHostSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  targetPlayerId: z.string().min(1),
});

export const WSReactionSchema = z.object({
  emoji: z.string().min(1).max(4), // Un emoji max
  code: z.string().regex(/^[A-Z0-9]{6}$/).optional(),
});

export const WSForceRevealSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
});

export const WSAdvanceNextSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
});

export const WSToggleSpectatorReactionsSchema = z.object({
  code: z.string().regex(/^[A-Z0-9]{6}$/),
  enabled: z.boolean(),
});

/**
 * Valide un payload WebSocket avec un schéma Zod
 * Retourne les données validées ou null si invalide
 */
export function validatePayload<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { 
    success: false, 
    error: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ') 
  };
}

// Export des schémas pour les tests
export const schemas = {
  join_session: WSJoinSessionSchema,
  start_question: WSStartQuestionSchema,
  toggle_auto_next: WSToggleAutoNextSchema,
  submit_answer: WSSubmitAnswerSchema,
  transfer_host: WSTransferHostSchema,
  reaction: WSReactionSchema,
  force_reveal: WSForceRevealSchema,
  advance_next: WSAdvanceNextSchema,
  toggle_spectator_reactions: WSToggleSpectatorReactionsSchema,
};
