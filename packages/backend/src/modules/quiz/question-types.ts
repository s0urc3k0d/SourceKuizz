/**
 * Types de questions supportés par SourceKuizz
 */

export const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'multiple_choice',
  TRUE_FALSE: 'true_false',
  TEXT_INPUT: 'text_input',
  ORDERING: 'ordering',
} as const;

export type QuestionType = typeof QUESTION_TYPES[keyof typeof QUESTION_TYPES];

export interface BaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | 'audio' | null;
  timeLimitMs: number;
  order: number;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: typeof QUESTION_TYPES.MULTIPLE_CHOICE;
  options: QuestionOption[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: typeof QUESTION_TYPES.TRUE_FALSE;
  options: [QuestionOption, QuestionOption]; // Toujours 2 options: Vrai et Faux
}

export interface TextInputQuestion extends BaseQuestion {
  type: typeof QUESTION_TYPES.TEXT_INPUT;
  correctAnswers: string[]; // Liste des réponses acceptées
  caseSensitive: boolean;
}

export interface OrderingQuestion extends BaseQuestion {
  type: typeof QUESTION_TYPES.ORDERING;
  options: OrderingOption[];
}

export interface QuestionOption {
  id: string;
  label: string;
  isCorrect: boolean;
  weight?: number;
}

export interface OrderingOption {
  id: string;
  label: string;
  orderIndex: number; // L'ordre correct
}

export type Question =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | TextInputQuestion
  | OrderingQuestion;

/**
 * DTOs pour la création de questions
 */
export interface CreateMultipleChoiceQuestionDto {
  type: typeof QUESTION_TYPES.MULTIPLE_CHOICE;
  prompt: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  timeLimitMs: number;
  options: Array<{
    label: string;
    isCorrect: boolean;
  }>;
}

export interface CreateTrueFalseQuestionDto {
  type: typeof QUESTION_TYPES.TRUE_FALSE;
  prompt: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  timeLimitMs: number;
  correctAnswer: boolean; // true = Vrai est la bonne réponse
}

export interface CreateTextInputQuestionDto {
  type: typeof QUESTION_TYPES.TEXT_INPUT;
  prompt: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  timeLimitMs: number;
  correctAnswers: string[];
  caseSensitive?: boolean;
}

export interface CreateOrderingQuestionDto {
  type: typeof QUESTION_TYPES.ORDERING;
  prompt: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio';
  timeLimitMs: number;
  options: string[]; // Labels dans l'ordre correct
}

export type CreateQuestionDto =
  | CreateMultipleChoiceQuestionDto
  | CreateTrueFalseQuestionDto
  | CreateTextInputQuestionDto
  | CreateOrderingQuestionDto;

/**
 * DTOs pour les réponses des joueurs
 */
export interface MultipleChoiceAnswerDto {
  questionId: string;
  optionId: string;
  clientTs: number;
}

export interface TrueFalseAnswerDto {
  questionId: string;
  answer: boolean;
  clientTs: number;
}

export interface TextInputAnswerDto {
  questionId: string;
  textAnswer: string;
  clientTs: number;
}

export interface OrderingAnswerDto {
  questionId: string;
  orderedOptionIds: string[];
  clientTs: number;
}

export type SubmitAnswerDto =
  | MultipleChoiceAnswerDto
  | TrueFalseAnswerDto
  | TextInputAnswerDto
  | OrderingAnswerDto;

/**
 * Utilitaires de validation
 */
export function isMultipleChoiceAnswer(dto: SubmitAnswerDto): dto is MultipleChoiceAnswerDto {
  return 'optionId' in dto;
}

export function isTrueFalseAnswer(dto: SubmitAnswerDto): dto is TrueFalseAnswerDto {
  return 'answer' in dto && typeof (dto as TrueFalseAnswerDto).answer === 'boolean';
}

export function isTextInputAnswer(dto: SubmitAnswerDto): dto is TextInputAnswerDto {
  return 'textAnswer' in dto;
}

export function isOrderingAnswer(dto: SubmitAnswerDto): dto is OrderingAnswerDto {
  return 'orderedOptionIds' in dto;
}

/**
 * Validation de réponse selon le type de question
 */
export function validateAnswer(
  questionType: QuestionType,
  answer: SubmitAnswerDto
): { valid: boolean; error?: string } {
  switch (questionType) {
    case QUESTION_TYPES.MULTIPLE_CHOICE:
      if (!isMultipleChoiceAnswer(answer)) {
        return { valid: false, error: 'Expected optionId for multiple choice question' };
      }
      return { valid: true };

    case QUESTION_TYPES.TRUE_FALSE:
      if (!isTrueFalseAnswer(answer)) {
        return { valid: false, error: 'Expected boolean answer for true/false question' };
      }
      return { valid: true };

    case QUESTION_TYPES.TEXT_INPUT:
      if (!isTextInputAnswer(answer)) {
        return { valid: false, error: 'Expected textAnswer for text input question' };
      }
      return { valid: true };

    case QUESTION_TYPES.ORDERING:
      if (!isOrderingAnswer(answer)) {
        return { valid: false, error: 'Expected orderedOptionIds for ordering question' };
      }
      return { valid: true };

    default:
      return { valid: false, error: `Unknown question type: ${questionType}` };
  }
}
