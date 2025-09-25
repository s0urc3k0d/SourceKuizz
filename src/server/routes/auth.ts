import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import passport from 'passport';
import { AuthService } from '../services/AuthService';
import { DatabaseService } from '../services/DatabaseService';
import { asyncHandler, CustomError, formatValidationErrors } from '../middleware/errorHandler';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logWithContext } from '../utils/logger';

const router = Router();
const authService = new AuthService();
const databaseService = new DatabaseService();

// Validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 50 })
    .withMessage('Le nom d\'utilisateur doit contenir entre 3 et 50 caractères')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Le nom d\'utilisateur ne peut contenir que des lettres, chiffres, tirets et underscores'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Adresse email invalide')
    .normalizeEmail()
];

const loginValidation = [
  body('username')
    .notEmpty()
    .withMessage('Nom d\'utilisateur requis'),
  body('password')
    .notEmpty()
    .withMessage('Mot de passe requis')
];

// POST /api/auth/register - Inscription avec pseudo/mot de passe
router.post('/register', registerValidation, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
  }

  const { username, password, email } = req.body;

  const result = await authService.registerUser(username, password, email);

  if (!result.success) {
    throw new CustomError(result.message || 'Erreur lors de l\'inscription', 400);
  }

  logWithContext.auth('Inscription réussie', username, true);

  res.status(201).json({
    success: true,
    message: 'Compte créé avec succès',
    user: result.user,
    token: result.token
  });
}));

// POST /api/auth/login - Connexion avec pseudo/mot de passe
router.post('/login', loginValidation, asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
  }

  const { username, password } = req.body;

  const result = await authService.loginUser(username, password);

  if (!result.success) {
    logWithContext.auth('Connexion échouée', username, false, result.message);
    throw new CustomError(result.message || 'Erreur lors de la connexion', 401);
  }

  logWithContext.auth('Connexion réussie', username, true);

  res.json({
    success: true,
    message: 'Connexion réussie',
    user: result.user,
    token: result.token
  });
}));

// GET /api/auth/twitch - Redirection vers Twitch OAuth
router.get('/twitch', passport.authenticate('twitch', { scope: ['user:read:email'] }));

// GET /api/auth/twitch/callback - Callback Twitch OAuth
router.get('/twitch/callback', 
  passport.authenticate('twitch', { session: false, failureRedirect: '/auth/failed' }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      throw new CustomError('Erreur d\'authentification Twitch', 401);
    }

    // Générer un JWT token
    const token = authService.generateJWT({
      id: req.user.id,
      username: req.user.username
    });

    logWithContext.auth('Connexion Twitch réussie', req.user.username, true);

    // Rediriger vers le frontend avec le token
    const frontendUrl = process.env.CORS_ORIGIN || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/auth/success?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: req.user.id,
      username: req.user.username,
      avatar_url: req.user.avatar_url
    }))}`);
  })
);

// GET /api/auth/failed - Page d'échec d'authentification
router.get('/failed', (req: Request, res: Response) => {
  res.status(401).json({
    success: false,
    message: 'Échec de l\'authentification'
  });
});

// GET /api/auth/me - Obtenir les informations de l'utilisateur connecté
router.get('/me', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('Utilisateur non trouvé', 404);
  }

  // Obtenir des statistiques utilisateur
  const userStats = await databaseService.get<{
    quiz_count: number;
    session_count: number;
    total_participants: number;
  }>(`
    SELECT 
      COUNT(DISTINCT q.id) as quiz_count,
      COUNT(DISTINCT qs.id) as session_count,
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
  `, [req.user.id]);

  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      avatar_url: req.user.avatar_url,
      twitch_username: req.user.twitch_username,
      created_at: req.user.created_at,
      stats: {
        quizCount: userStats?.quiz_count || 0,
        sessionCount: userStats?.session_count || 0,
        totalParticipants: userStats?.total_participants || 0
      }
    }
  });
}));

// PUT /api/auth/profile - Mettre à jour le profil
router.put('/profile', 
  requireAuth,
  [
    body('email')
      .optional()
      .isEmail()
      .withMessage('Adresse email invalide')
      .normalizeEmail(),
    body('avatar_url')
      .optional()
      .isURL()
      .withMessage('URL d\'avatar invalide')
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new CustomError(formatValidationErrors(errors.array()).join(', '), 400);
    }

    if (!req.user) {
      throw new CustomError('Utilisateur non trouvé', 404);
    }

    const { email, avatar_url } = req.body;
    const updates: any = {};

    if (email !== undefined) updates.email = email;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      throw new CustomError('Aucune modification fournie', 400);
    }

    const success = await authService.updateUserProfile(req.user.id, updates);
    if (!success) {
      throw new CustomError('Erreur lors de la mise à jour du profil', 500);
    }

    // Récupérer l'utilisateur mis à jour
    const updatedUser = await authService.findUserById(req.user.id);
    if (!updatedUser) {
      throw new CustomError('Utilisateur non trouvé après mise à jour', 500);
    }

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        avatar_url: updatedUser.avatar_url,
        twitch_username: updatedUser.twitch_username,
        created_at: updatedUser.created_at
      }
    });
  })
);

// POST /api/auth/verify-token - Vérifier la validité d'un token
router.post('/verify-token', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    throw new CustomError('Token requis', 400);
  }

  const payload = authService.verifyJWT(token);
  if (!payload) {
    throw new CustomError('Token invalide', 401);
  }

  const user = await authService.findUserById(payload.id);
  if (!user) {
    throw new CustomError('Utilisateur non trouvé', 404);
  }

  res.json({
    success: true,
    valid: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      twitch_username: user.twitch_username
    }
  });
}));

// DELETE /api/auth/account - Désactiver le compte
router.delete('/account', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('Utilisateur non trouvé', 404);
  }

  const success = await authService.deactivateUser(req.user.id);
  if (!success) {
    throw new CustomError('Erreur lors de la désactivation du compte', 500);
  }

  logWithContext.auth('Compte désactivé', req.user.username, true);

  res.json({
    success: true,
    message: 'Compte désactivé avec succès'
  });
}));

// POST /api/auth/refresh - Rafraîchir le token (optionnel)
router.post('/refresh', requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new CustomError('Utilisateur non trouvé', 404);
  }

  const newToken = authService.generateJWT({
    id: req.user.id,
    username: req.user.username
  });

  res.json({
    success: true,
    token: newToken,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      avatar_url: req.user.avatar_url
    }
  });
}));

export { router as authRoutes };