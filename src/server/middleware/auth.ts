import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { User } from '../services/DatabaseService';
import { CustomError } from './errorHandler';

export interface AuthRequest extends Request {
  user?: User;
}

// Middleware pour vérifier l'authentification JWT
export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  passport.authenticate('jwt', { session: false }, (err: Error, user: User) => {
    if (err) {
      return next(new CustomError('Erreur d\'authentification', 500));
    }
    
    if (!user) {
      return next(new CustomError('Token invalide ou expiré', 401));
    }

    if (!user.is_active) {
      return next(new CustomError('Compte désactivé', 403));
    }

    req.user = user;
    next();
  })(req, res, next);
};

// Middleware optionnel - ajoute l'utilisateur s'il est authentifié
export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  passport.authenticate('jwt', { session: false }, (err: Error, user: User) => {
    if (!err && user && user.is_active) {
      req.user = user;
    }
    next();
  })(req, res, next);
};

// Middleware pour vérifier que l'utilisateur est propriétaire d'une ressource
export const requireOwnership = (resourceIdParam: string = 'id', userIdField: string = 'creator_id') => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        return next(new CustomError('Authentification requise', 401));
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        return next(new CustomError('ID de ressource manquant', 400));
      }

      // Cette vérification sera spécifique selon le contexte
      // Pour l'instant, on fait confiance au contrôleur pour vérifier
      next();
    } catch (error) {
      next(error);
    }
  };
};

// Middleware pour limiter l'accès aux administrateurs (futur)
export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    return next(new CustomError('Authentification requise', 401));
  }

  // Pour l'instant, pas de système d'admin - tous les utilisateurs sont égaux
  // Ceci pourrait être étendu avec un champ role dans la base de données
  next();
};