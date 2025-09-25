import { DatabaseService, Quiz, Question, QuizSession, Participant, Answer } from './DatabaseService';
import { logger, logWithContext } from '../utils/logger';
import { CustomError } from '../middleware/errorHandler';

export interface CreateQuizData {
  title: string;
  description?: string;
  isPublic?: boolean;
  maxParticipants?: number;
  timeLimit?: number;
}

export interface CreateQuestionData {
  questionText: string;
  questionType: 'multiple_choice' | 'true_false' | 'text';
  correctAnswer: string;
  options?: string[];
  points?: number;
  timeLimit?: number;
}

export interface QuizStats {
  totalQuizzes: number;
  activeQuizzes: number;
  totalSessions: number;
  activeSessions: number;
  totalParticipants: number;
  averageScore: number;
}

export interface SessionStats {
  sessionCode: string;
  quizTitle: string;
  participantCount: number;
  currentQuestion: number;
  totalQuestions: number;
  averageScore: number;
  topScores: Array<{ nickname: string; score: number }>;
}

export class QuizService {
  private databaseService: DatabaseService;

  constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
  }

  // Quiz Management
  public async createQuiz(creatorId: number, quizData: CreateQuizData): Promise<Quiz> {
    try {
      await this.databaseService.run(
        `INSERT INTO quizzes (title, description, creator_id, is_public, max_participants, time_limit)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          quizData.title,
          quizData.description || null,
          creatorId,
          quizData.isPublic !== false,
          quizData.maxParticipants || null,
          quizData.timeLimit || null
        ]
      );

      const quiz = await this.databaseService.get<Quiz>(
        'SELECT * FROM quizzes WHERE creator_id = ? ORDER BY id DESC LIMIT 1',
        [creatorId]
      );

      if (!quiz) {
        throw new CustomError('Échec de la création du quiz', 500);
      }

      logWithContext.quiz('Quiz créé', quiz.id, undefined, creatorId, { title: quiz.title });
      return quiz;
    } catch (error) {
      logger.error('Erreur lors de la création du quiz:', error);
      throw error;
    }
  }

  public async addQuestion(quizId: number, questionData: CreateQuestionData): Promise<Question> {
    try {
      // Vérifier que le quiz existe
      const quiz = await this.getQuizById(quizId);
      if (!quiz) {
        throw new CustomError('Quiz non trouvé', 404);
      }

      // Obtenir l'index de l'ordre
      const maxOrder = await this.databaseService.get<{ max_order: number }>(
        'SELECT MAX(order_index) as max_order FROM questions WHERE quiz_id = ?',
        [quizId]
      );
      const orderIndex = (maxOrder?.max_order || 0) + 1;

      // Préparer les options JSON
      const optionsJson = questionData.options ? JSON.stringify(questionData.options) : null;

      await this.databaseService.run(
        `INSERT INTO questions (quiz_id, question_text, question_type, correct_answer, options, points, time_limit, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quizId,
          questionData.questionText,
          questionData.questionType,
          questionData.correctAnswer,
          optionsJson,
          questionData.points || 10,
          questionData.timeLimit || null,
          orderIndex
        ]
      );

      const question = await this.databaseService.get<Question>(
        'SELECT * FROM questions WHERE quiz_id = ? ORDER BY id DESC LIMIT 1',
        [quizId]
      );

      if (!question) {
        throw new CustomError('Échec de l\'ajout de la question', 500);
      }

      logWithContext.quiz('Question ajoutée', quizId, undefined, undefined, { 
        questionId: question.id,
        type: question.question_type 
      });

      return question;
    } catch (error) {
      logger.error('Erreur lors de l\'ajout de la question:', error);
      throw error;
    }
  }

  public async getQuizById(quizId: number): Promise<Quiz | undefined> {
    return this.databaseService.get<Quiz>(
      'SELECT * FROM quizzes WHERE id = ? AND is_active = 1',
      [quizId]
    );
  }

  public async getQuizWithQuestions(quizId: number): Promise<Quiz & { questions: Question[] } | null> {
    try {
      const quiz = await this.getQuizById(quizId);
      if (!quiz) {
        return null;
      }

      const questions = await this.databaseService.all<Question>(
        'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index ASC',
        [quizId]
      );

      return { ...quiz, questions };
    } catch (error) {
      logger.error('Erreur lors de la récupération du quiz avec questions:', error);
      throw error;
    }
  }

  public async getUserQuizzes(userId: number): Promise<Quiz[]> {
    return this.databaseService.all<Quiz>(
      'SELECT * FROM quizzes WHERE creator_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [userId]
    );
  }

  public async getPublicQuizzes(limit: number = 20, offset: number = 0): Promise<Quiz[]> {
    return this.databaseService.all<Quiz>(
      'SELECT * FROM quizzes WHERE is_public = 1 AND is_active = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
  }

  // Session Management
  public async createSession(quizId: number, hostId: number): Promise<QuizSession> {
    try {
      const quiz = await this.getQuizById(quizId);
      if (!quiz) {
        throw new CustomError('Quiz non trouvé', 404);
      }

      const sessionCode = this.generateSessionCode();
      
      await this.databaseService.run(
        'INSERT INTO quiz_sessions (quiz_id, session_code, host_id) VALUES (?, ?, ?)',
        [quizId, sessionCode, hostId]
      );

      const session = await this.databaseService.get<QuizSession>(
        'SELECT * FROM quiz_sessions WHERE session_code = ?',
        [sessionCode]
      );

      if (!session) {
        throw new CustomError('Échec de la création de la session', 500);
      }

      logWithContext.quiz('Session créée', quizId, session.id, hostId, { sessionCode });
      return session;
    } catch (error) {
      logger.error('Erreur lors de la création de la session:', error);
      throw error;
    }
  }

  public async joinSession(sessionCode: string, nickname: string, userId?: number): Promise<{ session: QuizSession; participant: Participant }> {
    try {
      const session = await this.getSessionByCode(sessionCode);
      if (!session) {
        throw new CustomError('Session non trouvée', 404);
      }

      if (session.status === 'completed') {
        throw new CustomError('Cette session est terminée', 400);
      }

      // Vérifier le nombre maximum de participants
      if (session.max_participants) {
        const participantCount = await this.getSessionParticipantCount(session.id);
        if (participantCount >= session.max_participants) {
          throw new CustomError('Session complète', 400);
        }
      }

      // Vérifier si le participant existe déjà
      let participant = await this.databaseService.get<Participant>(
        'SELECT * FROM participants WHERE session_id = ? AND (user_id = ? OR nickname = ?)',
        [session.id, userId || null, nickname]
      );

      if (participant) {
        // Réactiver le participant
        await this.databaseService.run(
          'UPDATE participants SET is_connected = 1, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
          [participant.id]
        );
      } else {
        // Créer un nouveau participant
        await this.databaseService.run(
          'INSERT INTO participants (session_id, user_id, nickname) VALUES (?, ?, ?)',
          [session.id, userId || null, nickname]
        );

        participant = await this.databaseService.get<Participant>(
          'SELECT * FROM participants WHERE session_id = ? AND nickname = ? ORDER BY id DESC LIMIT 1',
          [session.id, nickname]
        );

        if (!participant) {
          throw new CustomError('Échec de la participation à la session', 500);
        }
      }

      logWithContext.quiz('Participant joint', session.quiz_id, session.id, userId, { 
        nickname,
        participantId: participant.id 
      });

      return { session, participant };
    } catch (error) {
      logger.error('Erreur lors de la participation à la session:', error);
      throw error;
    }
  }

  public async startSession(sessionId: number, hostId: number): Promise<QuizSession> {
    try {
      const session = await this.getSessionById(sessionId);
      if (!session) {
        throw new CustomError('Session non trouvée', 404);
      }

      if (session.host_id !== hostId) {
        throw new CustomError('Non autorisé à démarrer cette session', 403);
      }

      if (session.status !== 'waiting') {
        throw new CustomError('La session ne peut pas être démarrée', 400);
      }

      // Obtenir la première question
      const firstQuestion = await this.databaseService.get<Question>(
        'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index ASC LIMIT 1',
        [session.quiz_id]
      );

      if (!firstQuestion) {
        throw new CustomError('Aucune question trouvée pour ce quiz', 400);
      }

      await this.databaseService.run(
        'UPDATE quiz_sessions SET status = ?, current_question_id = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['active', firstQuestion.id, sessionId]
      );

      const updatedSession = await this.getSessionById(sessionId);
      if (!updatedSession) {
        throw new CustomError('Erreur lors de la mise à jour de la session', 500);
      }

      logWithContext.quiz('Session démarrée', session.quiz_id, sessionId, hostId);
      return updatedSession;
    } catch (error) {
      logger.error('Erreur lors du démarrage de la session:', error);
      throw error;
    }
  }

  public async submitAnswer(sessionId: number, questionId: number, participantId: number, answer: string): Promise<{ isCorrect: boolean; pointsEarned: number }> {
    try {
      const session = await this.getSessionById(sessionId);
      if (!session || session.status !== 'active') {
        throw new CustomError('Session non active', 400);
      }

      const question = await this.databaseService.get<Question>(
        'SELECT * FROM questions WHERE id = ? AND quiz_id = ?',
        [questionId, session.quiz_id]
      );

      if (!question) {
        throw new CustomError('Question non trouvée', 404);
      }

      // Vérifier si la réponse a déjà été soumise
      const existingAnswer = await this.databaseService.get<Answer>(
        'SELECT * FROM answers WHERE session_id = ? AND question_id = ? AND participant_id = ?',
        [sessionId, questionId, participantId]
      );

      if (existingAnswer) {
        throw new CustomError('Réponse déjà soumise pour cette question', 400);
      }

      // Évaluer la réponse
      const isCorrect = this.evaluateAnswer(question, answer);
      const pointsEarned = isCorrect ? question.points : 0;

      // Enregistrer la réponse
      await this.databaseService.run(
        'INSERT INTO answers (session_id, question_id, participant_id, answer, is_correct, points_earned) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, questionId, participantId, answer, isCorrect, pointsEarned]
      );

      // Mettre à jour le score du participant
      await this.databaseService.run(
        'UPDATE participants SET score = score + ?, last_activity = CURRENT_TIMESTAMP WHERE id = ?',
        [pointsEarned, participantId]
      );

      logWithContext.quiz('Réponse soumise', session.quiz_id, sessionId, undefined, {
        participantId,
        questionId,
        isCorrect,
        pointsEarned
      });

      return { isCorrect, pointsEarned };
    } catch (error) {
      logger.error('Erreur lors de la soumission de réponse:', error);
      throw error;
    }
  }

  private evaluateAnswer(question: Question, answer: string): boolean {
    const normalizedAnswer = answer.trim().toLowerCase();
    const normalizedCorrect = question.correct_answer.trim().toLowerCase();

    switch (question.question_type) {
      case 'multiple_choice':
      case 'true_false':
        return normalizedAnswer === normalizedCorrect;
      case 'text':
        // Pour les réponses texte, on peut implémenter une logique plus flexible
        return normalizedAnswer === normalizedCorrect || 
               normalizedAnswer.includes(normalizedCorrect) ||
               normalizedCorrect.includes(normalizedAnswer);
      default:
        return false;
    }
  }

  // Utility methods
  private generateSessionCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  public async getSessionByCode(sessionCode: string): Promise<QuizSession | undefined> {
    return this.databaseService.get<QuizSession>(
      'SELECT * FROM quiz_sessions WHERE session_code = ?',
      [sessionCode]
    );
  }

  public async getSessionById(sessionId: number): Promise<QuizSession | undefined> {
    return this.databaseService.get<QuizSession>(
      'SELECT * FROM quiz_sessions WHERE id = ?',
      [sessionId]
    );
  }

  public async getSessionParticipants(sessionId: number): Promise<Participant[]> {
    return this.databaseService.all<Participant>(
      'SELECT * FROM participants WHERE session_id = ? ORDER BY score DESC, joined_at ASC',
      [sessionId]
    );
  }

  private async getSessionParticipantCount(sessionId: number): Promise<number> {
    const result = await this.databaseService.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM participants WHERE session_id = ? AND is_connected = 1',
      [sessionId]
    );
    return result?.count || 0;
  }

  public async getQuizStats(): Promise<QuizStats> {
    try {
      const [totalQuizzes, activeQuizzes, totalSessions, activeSessions, totalParticipants, avgScore] = await Promise.all([
        this.databaseService.get<{ count: number }>('SELECT COUNT(*) as count FROM quizzes WHERE is_active = 1'),
        this.databaseService.get<{ count: number }>('SELECT COUNT(*) as count FROM quizzes WHERE is_active = 1 AND is_public = 1'),
        this.databaseService.get<{ count: number }>('SELECT COUNT(*) as count FROM quiz_sessions'),
        this.databaseService.get<{ count: number }>('SELECT COUNT(*) as count FROM quiz_sessions WHERE status IN (\'waiting\', \'active\', \'paused\')'),
        this.databaseService.get<{ count: number }>('SELECT COUNT(*) as count FROM participants'),
        this.databaseService.get<{ avg: number }>('SELECT AVG(score) as avg FROM participants WHERE score > 0')
      ]);

      return {
        totalQuizzes: totalQuizzes?.count || 0,
        activeQuizzes: activeQuizzes?.count || 0,
        totalSessions: totalSessions?.count || 0,
        activeSessions: activeSessions?.count || 0,
        totalParticipants: totalParticipants?.count || 0,
        averageScore: Math.round(avgScore?.avg || 0)
      };
    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }
}