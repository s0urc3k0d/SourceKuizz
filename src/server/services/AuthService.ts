import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as TwitchStrategy } from 'passport-twitch';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseService, User } from './DatabaseService';
import { logger } from '../utils/logger';

export interface JwtPayload {
  id: number;
  username: string;
  iat?: number;
  exp?: number;
}

export interface TwitchProfile {
  id: string;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  email?: string;
}

export class AuthService {
  private databaseService: DatabaseService;
  private jwtSecret: string;
  private jwtExpire: string;

  constructor() {
    this.databaseService = new DatabaseService();
    this.jwtSecret = process.env.JWT_SECRET || 'fallback-secret-key';
    this.jwtExpire = process.env.JWT_EXPIRE || '7d';

    if (this.jwtSecret === 'fallback-secret-key') {
      logger.warn('⚠️  JWT_SECRET non défini, utilisation d\'une clé par défaut (non sécurisé)');
    }
  }

  public configurePassport(): void {
    // JWT Strategy
    passport.use(new JwtStrategy({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: this.jwtSecret,
      algorithms: ['HS256']
    }, async (payload: JwtPayload, done) => {
      try {
        const user = await this.findUserById(payload.id);
        if (user && user.is_active) {
          return done(null, user);
        }
        return done(null, false);
      } catch (error) {
        logger.error('Erreur lors de la vérification JWT:', error);
        return done(error, false);
      }
    }));

    // Twitch Strategy
    if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
      passport.use(new TwitchStrategy({
        clientID: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET,
        callbackURL: process.env.TWITCH_CALLBACK_URL || 'http://localhost:3000/auth/twitch/callback',
        scope: ['user:read:email']
      }, async (accessToken: string, refreshToken: string, profile: any, done) => {
        try {
          const twitchProfile: TwitchProfile = {
            id: profile.id,
            username: profile.login,
            displayName: profile.display_name,
            profileImageUrl: profile.profile_image_url,
            email: profile.email
          };

          const user = await this.handleTwitchAuth(twitchProfile);
          return done(null, user);
        } catch (error) {
          logger.error('Erreur lors de l\'authentification Twitch:', error);
          return done(error, null);
        }
      }));
    } else {
      logger.warn('⚠️  Configuration Twitch OAuth manquante');
    }
  }

  public async registerUser(username: string, password: string, email?: string): Promise<{ success: boolean; user?: User; token?: string; message?: string }> {
    try {
      // Vérifier si l'utilisateur existe déjà
      const existingUser = await this.findUserByUsername(username);
      if (existingUser) {
        return {
          success: false,
          message: 'Ce nom d\'utilisateur est déjà pris'
        };
      }

      if (email) {
        const existingEmail = await this.findUserByEmail(email);
        if (existingEmail) {
          return {
            success: false,
            message: 'Cette adresse email est déjà utilisée'
          };
        }
      }

      // Hacher le mot de passe
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Créer l'utilisateur
      await this.databaseService.run(
        `INSERT INTO users (username, email, password_hash) 
         VALUES (?, ?, ?)`,
        [username, email || null, passwordHash]
      );

      const user = await this.findUserByUsername(username);
      if (!user) {
        throw new Error('Échec de la création de l\'utilisateur');
      }

      // Générer le token JWT
      const token = this.generateJWT({
        id: user.id,
        username: user.username
      });

      logger.info(`Nouvel utilisateur enregistré: ${username}`);

      return {
        success: true,
        user: this.sanitizeUser(user),
        token
      };
    } catch (error) {
      logger.error('Erreur lors de l\'enregistrement:', error);
      return {
        success: false,
        message: 'Erreur lors de la création du compte'
      };
    }
  }

  public async loginUser(username: string, password: string): Promise<{ success: boolean; user?: User; token?: string; message?: string }> {
    try {
      const user = await this.findUserByUsername(username);
      if (!user || !user.password_hash) {
        return {
          success: false,
          message: 'Nom d\'utilisateur ou mot de passe incorrect'
        };
      }

      if (!user.is_active) {
        return {
          success: false,
          message: 'Compte désactivé'
        };
      }

      // Vérifier le mot de passe
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return {
          success: false,
          message: 'Nom d\'utilisateur ou mot de passe incorrect'
        };
      }

      // Mettre à jour la dernière activité
      await this.updateUserActivity(user.id);

      // Générer le token JWT
      const token = this.generateJWT({
        id: user.id,
        username: user.username
      });

      logger.info(`Utilisateur connecté: ${username}`);

      return {
        success: true,
        user: this.sanitizeUser(user),
        token
      };
    } catch (error) {
      logger.error('Erreur lors de la connexion:', error);
      return {
        success: false,
        message: 'Erreur lors de la connexion'
      };
    }
  }

  public async handleTwitchAuth(twitchProfile: TwitchProfile): Promise<User> {
    try {
      // Chercher un utilisateur existant avec cet ID Twitch
      let user = await this.databaseService.get<User>(
        'SELECT * FROM users WHERE twitch_id = ?',
        [twitchProfile.id]
      );

      if (user) {
        // Mettre à jour les informations Twitch
        await this.databaseService.run(
          `UPDATE users SET 
           twitch_username = ?, 
           avatar_url = ?, 
           updated_at = CURRENT_TIMESTAMP 
           WHERE twitch_id = ?`,
          [twitchProfile.username, twitchProfile.profileImageUrl || null, twitchProfile.id]
        );

        await this.updateUserActivity(user.id);
        return user;
      }

      // Créer un nouveau compte avec Twitch
      const username = await this.generateUniqueUsername(twitchProfile.username);
      
      await this.databaseService.run(
        `INSERT INTO users (username, email, twitch_id, twitch_username, avatar_url) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          username,
          twitchProfile.email || null,
          twitchProfile.id,
          twitchProfile.username,
          twitchProfile.profileImageUrl || null
        ]
      );

      user = await this.findUserByTwitchId(twitchProfile.id);
      if (!user) {
        throw new Error('Échec de la création du compte Twitch');
      }

      logger.info(`Nouveau compte Twitch créé: ${username} (${twitchProfile.username})`);
      return user;
    } catch (error) {
      logger.error('Erreur lors de l\'authentification Twitch:', error);
      throw error;
    }
  }

  private async generateUniqueUsername(baseUsername: string): Promise<string> {
    let username = baseUsername;
    let counter = 1;

    while (await this.findUserByUsername(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    return username;
  }

  public generateJWT(payload: JwtPayload): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpire,
      algorithm: 'HS256'
    });
  }

  public verifyJWT(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
    } catch (error) {
      logger.debug('Token JWT invalide:', error);
      return null;
    }
  }

  public async findUserById(id: number): Promise<User | undefined> {
    return this.databaseService.get<User>(
      'SELECT * FROM users WHERE id = ? AND is_active = 1',
      [id]
    );
  }

  public async findUserByUsername(username: string): Promise<User | undefined> {
    return this.databaseService.get<User>(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
  }

  public async findUserByEmail(email: string): Promise<User | undefined> {
    return this.databaseService.get<User>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
  }

  public async findUserByTwitchId(twitchId: string): Promise<User | undefined> {
    return this.databaseService.get<User>(
      'SELECT * FROM users WHERE twitch_id = ?',
      [twitchId]
    );
  }

  private async updateUserActivity(userId: number): Promise<void> {
    await this.databaseService.run(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [userId]
    );
  }

  private sanitizeUser(user: User): User {
    const sanitized = { ...user };
    delete (sanitized as any).password_hash;
    return sanitized;
  }

  public async deactivateUser(userId: number): Promise<boolean> {
    try {
      await this.databaseService.run(
        'UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [userId]
      );
      return true;
    } catch (error) {
      logger.error('Erreur lors de la désactivation:', error);
      return false;
    }
  }

  public async updateUserProfile(userId: number, updates: Partial<User>): Promise<boolean> {
    try {
      const allowedFields = ['email', 'avatar_url'];
      const fieldsToUpdate = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (fieldsToUpdate.length === 0) {
        return false;
      }

      const setClause = fieldsToUpdate.map(field => `${field} = ?`).join(', ');
      const values = fieldsToUpdate.map(field => (updates as any)[field]);
      values.push(userId);

      await this.databaseService.run(
        `UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        values
      );

      return true;
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du profil:', error);
      return false;
    }
  }
}