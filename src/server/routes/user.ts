import { Router, Response } from 'express';
import { param, query, validationResult } from 'express-validator';
import { DatabaseService } from '../services/DatabaseService';
import { asyncHandler, CustomError, formatValidationErrors } from '../middleware/errorHandler';
import { requireAuth, optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const databaseService = new DatabaseService();

// GET /api/user/:id - Obtenir le profil public d'un utilisateur
router.get('/:id',
  optionalAuth,
  [param('id').isInt({ min: 1 }).withMessage('ID utilisateur invalide')],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    const userId = parseInt(req.params.id);
    
    // Obtenir les informations de base de l'utilisateur
    const user = await databaseService.get<{
      id: number;
      username: string;
      avatar_url?: string;
      twitch_username?: string;
      created_at: string;
    }>(`
      SELECT id, username, avatar_url, twitch_username, created_at 
      FROM users 
      WHERE id = ? AND is_active = 1
    `, [userId]);

    if (!user) {
      throw new CustomError('Utilisateur non trouvé', 404);
    }

    // Obtenir les statistiques publiques
    const stats = await databaseService.get<{
      public_quiz_count: number;
      total_sessions: number;
      total_participants: number;
    }>(`
      SELECT 
        COUNT(DISTINCT CASE WHEN q.is_public = 1 THEN q.id END) as public_quiz_count,
        COUNT(DISTINCT qs.id) as total_sessions,
        COALESCE(SUM(participant_counts.count), 0) as total_participants
      FROM users u
      LEFT JOIN quizzes q ON u.id = q.creator_id AND q.is_active = 1
      LEFT JOIN quiz_sessions qs ON q.id = qs.quiz_id
      LEFT JOIN (
        SELECT session_id, COUNT(*) as count 
        FROM participants 
        GROUP BY session_id
      ) participant_counts ON qs.id = participant_counts.session_id
      WHERE u.id = ?
    `, [userId]);

    // Obtenir les quiz publics récents
    const recentQuizzes = await databaseService.all<{
      id: number;
      title: string;
      description?: string;
      created_at: string;
      question_count: number;
    }>(`
      SELECT 
        q.id,
        q.title,
        q.description,
        q.created_at,
        COUNT(questions.id) as question_count
      FROM quizzes q
      LEFT JOIN questions ON q.id = questions.quiz_id
      WHERE q.creator_id = ? AND q.is_public = 1 AND q.is_active = 1
      GROUP BY q.id, q.title, q.description, q.created_at
      ORDER BY q.created_at DESC
      LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        twitch_username: user.twitch_username,
        joined_at: user.created_at,
        stats: {
          publicQuizCount: stats?.public_quiz_count || 0,
          totalSessions: stats?.total_sessions || 0,
          totalParticipants: stats?.total_participants || 0
        },
        recentQuizzes
      }
    });
  })
);

// GET /api/user/:id/quizzes - Obtenir les quiz publics d'un utilisateur
router.get('/:id/quizzes',
  optionalAuth,
  [
    param('id').isInt({ min: 1 }).withMessage('ID utilisateur invalide'),
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

    const userId = parseInt(req.params.id);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Vérifier que l'utilisateur existe
    const user = await databaseService.get<{ id: number; username: string }>(
      'SELECT id, username FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );

    if (!user) {
      throw new CustomError('Utilisateur non trouvé', 404);
    }

    // Obtenir les quiz publics
    const quizzes = await databaseService.all<{
      id: number;
      title: string;
      description?: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT id, title, description, created_at, updated_at
      FROM quizzes 
      WHERE creator_id = ? AND is_public = 1 AND is_active = 1
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `, [userId, limit, offset]);

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
      user: {
        id: user.id,
        username: user.username
      },
      quizzes: quizzesWithInfo,
      pagination: {
        page,
        limit,
        hasMore: quizzes.length === limit
      }
    });
  })
);

// GET /api/user/search - Rechercher des utilisateurs
router.get('/search',
  optionalAuth,
  [
    query('q')
      .isLength({ min: 2, max: 50 })
      .withMessage('La recherche doit contenir entre 2 et 50 caractères'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('La limite doit être entre 1 et 20')
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    const searchTerm = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;

    const users = await databaseService.all<{
      id: number;
      username: string;
      avatar_url?: string;
      twitch_username?: string;
      quiz_count: number;
    }>(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        u.twitch_username,
        COUNT(q.id) as quiz_count
      FROM users u
      LEFT JOIN quizzes q ON u.id = q.creator_id AND q.is_public = 1 AND q.is_active = 1
      WHERE u.is_active = 1 
        AND (u.username LIKE ? OR u.twitch_username LIKE ?)
      GROUP BY u.id, u.username, u.avatar_url, u.twitch_username
      ORDER BY quiz_count DESC, u.username ASC
      LIMIT ?
    `, [`%${searchTerm}%`, `%${searchTerm}%`, limit]);

    res.json({
      success: true,
      users,
      searchTerm
    });
  })
);

// GET /api/user/leaderboard - Obtenir le classement des créateurs
router.get('/leaderboard',
  optionalAuth,
  [
    query('period')
      .optional()
      .isIn(['all', 'month', 'week'])
      .withMessage('Période invalide (all, month, week)'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100')
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    const period = req.query.period as string || 'all';
    const limit = parseInt(req.query.limit as string) || 20;

    let dateFilter = '';
    if (period === 'month') {
      dateFilter = "AND q.created_at >= datetime('now', '-30 days')";
    } else if (period === 'week') {
      dateFilter = "AND q.created_at >= datetime('now', '-7 days')";
    }

    const leaderboard = await databaseService.all<{
      id: number;
      username: string;
      avatar_url?: string;
      twitch_username?: string;
      quiz_count: number;
      total_participants: number;
      total_sessions: number;
      average_rating: number;
    }>(`
      SELECT 
        u.id,
        u.username,
        u.avatar_url,
        u.twitch_username,
        COUNT(DISTINCT q.id) as quiz_count,
        COUNT(DISTINCT qs.id) as total_sessions,
        COALESCE(SUM(participant_counts.count), 0) as total_participants,
        0 as average_rating
      FROM users u
      LEFT JOIN quizzes q ON u.id = q.creator_id AND q.is_public = 1 AND q.is_active = 1 ${dateFilter}
      LEFT JOIN quiz_sessions qs ON q.id = qs.quiz_id
      LEFT JOIN (
        SELECT session_id, COUNT(*) as count 
        FROM participants 
        GROUP BY session_id
      ) participant_counts ON qs.id = participant_counts.session_id
      WHERE u.is_active = 1
      GROUP BY u.id, u.username, u.avatar_url, u.twitch_username
      HAVING quiz_count > 0
      ORDER BY total_participants DESC, quiz_count DESC, u.username ASC
      LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      leaderboard,
      period
    });
  })
);

// GET /api/user/activity - Obtenir l'activité récente des utilisateurs
router.get('/activity',
  optionalAuth,
  [
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

    const limit = parseInt(req.query.limit as string) || 20;

    // Activité récente : nouveaux quiz créés
    const recentQuizzes = await databaseService.all<{
      id: number;
      title: string;
      creator_username: string;
      creator_avatar?: string;
      created_at: string;
      question_count: number;
    }>(`
      SELECT 
        q.id,
        q.title,
        u.username as creator_username,
        u.avatar_url as creator_avatar,
        q.created_at,
        COUNT(questions.id) as question_count
      FROM quizzes q
      JOIN users u ON q.creator_id = u.id
      LEFT JOIN questions ON q.id = questions.quiz_id
      WHERE q.is_public = 1 AND q.is_active = 1
      GROUP BY q.id, q.title, u.username, u.avatar_url, q.created_at
      ORDER BY q.created_at DESC
      LIMIT ?
    `, [limit]);

    // Sessions récemment complétées
    const recentSessions = await databaseService.all<{
      session_code: string;
      quiz_title: string;
      host_username: string;
      ended_at: string;
      participant_count: number;
    }>(`
      SELECT 
        qs.session_code,
        q.title as quiz_title,
        u.username as host_username,
        qs.ended_at,
        COUNT(p.id) as participant_count
      FROM quiz_sessions qs
      JOIN quizzes q ON qs.quiz_id = q.id AND q.is_public = 1
      JOIN users u ON qs.host_id = u.id
      LEFT JOIN participants p ON qs.id = p.session_id
      WHERE qs.status = 'completed' AND qs.ended_at IS NOT NULL
      GROUP BY qs.id, qs.session_code, q.title, u.username, qs.ended_at
      ORDER BY qs.ended_at DESC
      LIMIT ?
    `, [Math.floor(limit / 2)]);

    res.json({
      success: true,
      activity: {
        recentQuizzes,
        recentSessions
      }
    });
  })
);

export { router as userRoutes };