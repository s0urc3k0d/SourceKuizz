import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { QuizService } from '../services/QuizService';
import { DatabaseService } from '../services/DatabaseService';
import { asyncHandler, CustomError, formatValidationErrors } from '../middleware/errorHandler';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';
import { logWithContext } from '../utils/logger';

const router = Router();
const databaseService = new DatabaseService();
const quizService = new QuizService(databaseService);

// Validation rules
const createQuizValidation = [
  body('title')
    .isLength({ min: 3, max: 255 })
    .withMessage('Le titre doit contenir entre 3 et 255 caractères')
    .trim(),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('La description ne peut pas dépasser 1000 caractères')
    .trim(),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic doit être un booléen'),
  body('maxParticipants')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Le nombre maximum de participants doit être entre 1 et 1000'),
  body('timeLimit')
    .optional()
    .isInt({ min: 60, max: 7200 })
    .withMessage('La limite de temps doit être entre 60 et 7200 secondes')
];

const createQuestionValidation = [
  body('questionText')
    .isLength({ min: 5, max: 1000 })
    .withMessage('La question doit contenir entre 5 et 1000 caractères')
    .trim(),
  body('questionType')
    .isIn(['multiple_choice', 'true_false', 'text'])
    .withMessage('Type de question invalide'),
  body('correctAnswer')
    .notEmpty()
    .withMessage('La réponse correcte est requise')
    .trim(),
  body('options')
    .optional()
    .isArray({ min: 2, max: 8 })
    .withMessage('Les options doivent être un tableau de 2 à 8 éléments'),
  body('options.*')
    .optional()
    .isLength({ min: 1, max: 200 })
    .withMessage('Chaque option doit contenir entre 1 et 200 caractères')
    .trim(),
  body('points')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Les points doivent être entre 1 et 1000'),
  body('timeLimit')
    .optional()
    .isInt({ min: 5, max: 300 })
    .withMessage('La limite de temps par question doit être entre 5 et 300 secondes')
];

// GET /api/quiz - Obtenir la liste des quiz publics
router.get('/', 
  optionalAuth,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Le numéro de page doit être un entier positif'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('La limite doit être entre 1 et 50')
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const quizzes = await quizService.getPublicQuizzes(limit, offset);

    // Ajouter des informations supplémentaires pour chaque quiz
    const quizzesWithInfo = await Promise.all(quizzes.map(async (quiz) => {
      const questionCount = await databaseService.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM questions WHERE quiz_id = ?',
        [quiz.id]
      );

      const sessionCount = await databaseService.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM quiz_sessions WHERE quiz_id = ?',
        [quiz.id]
      );

      const creator = await databaseService.get<{ username: string; avatar_url?: string }>(
        'SELECT username, avatar_url FROM users WHERE id = ?',
        [quiz.creator_id]
      );

      return {
        ...quiz,
        questionCount: questionCount?.count || 0,
        sessionCount: sessionCount?.count || 0,
        creator: creator ? {
          username: creator.username,
          avatar_url: creator.avatar_url
        } : null
      };
    }));

    res.json({
      success: true,
      quizzes: quizzesWithInfo,
      pagination: {
        page,
        limit,
        hasMore: quizzes.length === limit
      }
    });
  })
);

// POST /api/quiz - Créer un nouveau quiz
router.post('/', requireAuth, createQuizValidation, asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
  }

  if (!req.user) {
    throw new CustomError('Utilisateur non authentifié', 401);
  }

  const { title, description, isPublic, maxParticipants, timeLimit } = req.body;

  const quiz = await quizService.createQuiz(req.user.id, {
    title,
    description,
    isPublic,
    maxParticipants,
    timeLimit
  });

  res.status(201).json({
    success: true,
    message: 'Quiz créé avec succès',
    quiz
  });
}));

// GET /api/quiz/my - Obtenir les quiz de l'utilisateur connecté
router.get('/my', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('Utilisateur non authentifié', 401);
  }

  const quizzes = await quizService.getUserQuizzes(req.user.id);

  // Ajouter des informations supplémentaires
  const quizzesWithInfo = await Promise.all(quizzes.map(async (quiz) => {
    const questionCount = await databaseService.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM questions WHERE quiz_id = ?',
      [quiz.id]
    );

    const sessionCount = await databaseService.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM quiz_sessions WHERE quiz_id = ?',
      [quiz.id]
    );

    const participantCount = await databaseService.get<{ count: number }>(
      `SELECT COUNT(DISTINCT p.id) as count 
       FROM quiz_sessions qs 
       JOIN participants p ON qs.id = p.session_id 
       WHERE qs.quiz_id = ?`,
      [quiz.id]
    );

    return {
      ...quiz,
      questionCount: questionCount?.count || 0,
      sessionCount: sessionCount?.count || 0,
      totalParticipants: participantCount?.count || 0
    };
  }));

  res.json({
    success: true,
    quizzes: quizzesWithInfo
  });
}));

// GET /api/quiz/:id - Obtenir un quiz spécifique avec ses questions
router.get('/:id', 
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('ID de quiz invalide')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    const quizId = parseInt(req.params.id);
    const quiz = await quizService.getQuizWithQuestions(quizId);

    if (!quiz) {
      throw new CustomError('Quiz non trouvé', 404);
    }

    // Vérifier les permissions
    if (!quiz.is_public && (!req.user || req.user.id !== quiz.creator_id)) {
      throw new CustomError('Accès non autorisé à ce quiz', 403);
    }

    // Obtenir le créateur
    const creator = await databaseService.get<{ username: string; avatar_url?: string }>(
      'SELECT username, avatar_url FROM users WHERE id = ?',
      [quiz.creator_id]
    );

    // Masquer les réponses correctes si l'utilisateur n'est pas le créateur
    const questionsForResponse = quiz.questions.map(question => {
      if (req.user && req.user.id === quiz.creator_id) {
        return {
          ...question,
          options: question.options ? JSON.parse(question.options) : null
        };
      } else {
        return {
          id: question.id,
          question_text: question.question_text,
          question_type: question.question_type,
          options: question.options ? JSON.parse(question.options) : null,
          points: question.points,
          time_limit: question.time_limit,
          order_index: question.order_index
        };
      }
    });

    res.json({
      success: true,
      quiz: {
        ...quiz,
        questions: questionsForResponse,
        creator: creator ? {
          username: creator.username,
          avatar_url: creator.avatar_url
        } : null
      }
    });
  })
);

// POST /api/quiz/:id/questions - Ajouter une question à un quiz
router.post('/:id/questions', 
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('ID de quiz invalide')],
  createQuestionValidation,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    if (!req.user) {
      throw new CustomError('Utilisateur non authentifié', 401);
    }

    const quizId = parseInt(req.params.id);
    const quiz = await quizService.getQuizById(quizId);

    if (!quiz) {
      throw new CustomError('Quiz non trouvé', 404);
    }

    if (quiz.creator_id !== req.user.id) {
      throw new CustomError('Non autorisé à modifier ce quiz', 403);
    }

    const { questionText, questionType, correctAnswer, options, points, timeLimit } = req.body;

    // Validation spécifique selon le type de question
    if (questionType === 'multiple_choice' && (!options || options.length < 2)) {
      throw new CustomError('Les questions à choix multiples doivent avoir au moins 2 options', 400);
    }

    if (questionType === 'multiple_choice' && !options.includes(correctAnswer)) {
      throw new CustomError('La réponse correcte doit être l\'une des options proposées', 400);
    }

    const question = await quizService.addQuestion(quizId, {
      questionText,
      questionType,
      correctAnswer,
      options: questionType === 'multiple_choice' ? options : undefined,
      points,
      timeLimit
    });

    res.status(201).json({
      success: true,
      message: 'Question ajoutée avec succès',
      question: {
        ...question,
        options: question.options ? JSON.parse(question.options) : null
      }
    });
  })
);

// POST /api/quiz/:id/session - Créer une session pour un quiz
router.post('/:id/session',
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('ID de quiz invalide')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    if (!req.user) {
      throw new CustomError('Utilisateur non authentifié', 401);
    }

    const quizId = parseInt(req.params.id);
    const quiz = await quizService.getQuizById(quizId);

    if (!quiz) {
      throw new CustomError('Quiz non trouvé', 404);
    }

    if (quiz.creator_id !== req.user.id) {
      throw new CustomError('Non autorisé à créer une session pour ce quiz', 403);
    }

    // Vérifier qu'il y a au moins une question
    const questionCount = await databaseService.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM questions WHERE quiz_id = ?',
      [quizId]
    );

    if (!questionCount || questionCount.count === 0) {
      throw new CustomError('Le quiz doit avoir au moins une question pour créer une session', 400);
    }

    const session = await quizService.createSession(quizId, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Session créée avec succès',
      session: {
        ...session,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description
        }
      }
    });
  })
);

// GET /api/quiz/session/:code - Obtenir les informations d'une session
router.get('/session/:code',
  optionalAuth,
  [param('code').isLength({ min: 6, max: 6 }).withMessage('Code de session invalide')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    const sessionCode = req.params.code.toUpperCase();
    const session = await quizService.getSessionByCode(sessionCode);

    if (!session) {
      throw new CustomError('Session non trouvée', 404);
    }

    const quiz = await quizService.getQuizById(session.quiz_id);
    if (!quiz) {
      throw new CustomError('Quiz associé non trouvé', 404);
    }

    const participants = await quizService.getSessionParticipants(session.id);

    res.json({
      success: true,
      session: {
        ...session,
        quiz: {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description
        },
        participantCount: participants.length,
        participants: participants.map(p => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score,
          isConnected: p.is_connected
        }))
      }
    });
  })
);

// GET /api/quiz/stats - Obtenir les statistiques générales
router.get('/stats', asyncHandler(async (req: AuthRequest, res: Response) => {
  const stats = await quizService.getQuizStats();

  res.json({
    success: true,
    stats
  });
}));

// DELETE /api/quiz/:id - Supprimer un quiz (désactiver)
router.delete('/:id',
  requireAuth,
  [param('id').isInt({ min: 1 }).withMessage('ID de quiz invalide')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    if (!req.user) {
      throw new CustomError('Utilisateur non authentifié', 401);
    }

    const quizId = parseInt(req.params.id);
    const quiz = await quizService.getQuizById(quizId);

    if (!quiz) {
      throw new CustomError('Quiz non trouvé', 404);
    }

    if (quiz.creator_id !== req.user.id) {
      throw new CustomError('Non autorisé à supprimer ce quiz', 403);
    }

    // Vérifier s'il y a des sessions actives
    const activeSessions = await databaseService.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM quiz_sessions WHERE quiz_id = ? AND status IN (\'waiting\', \'active\', \'paused\')',
      [quizId]
    );

    if (activeSessions && activeSessions.count > 0) {
      throw new CustomError('Impossible de supprimer un quiz avec des sessions actives', 400);
    }

    // Désactiver le quiz
    await databaseService.run(
      'UPDATE quizzes SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [quizId]
    );

    logWithContext.quiz('Quiz supprimé', quizId, undefined, req.user.id);

    res.json({
      success: true,
      message: 'Quiz supprimé avec succès'
    });
  })
);

export { router as quizRoutes };