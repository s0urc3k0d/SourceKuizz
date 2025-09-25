import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { QuizService } from '../services/QuizService';
import { AuthService, JwtPayload } from '../services/AuthService';
import { logger, logWithContext } from '../utils/logger';

export interface SocketWithAuth extends Socket {
  userId?: number;
  username?: string;
  sessionId?: number;
  participantId?: number;
}

export interface QuizEvent {
  type: string;
  data: any;
  timestamp: string;
}

export interface ParticipantInfo {
  id: number;
  nickname: string;
  score: number;
  isConnected: boolean;
}

export class WebSocketService {
  private io: Server;
  private quizService: QuizService;
  private authService: AuthService;
  private activeSessions: Map<number, Set<string>> = new Map(); // sessionId -> Set of socketIds
  private socketSessions: Map<string, number> = new Map(); // socketId -> sessionId

  constructor(io: Server, quizService: QuizService) {
    this.io = io;
    this.quizService = quizService;
    this.authService = new AuthService();
  }

  public initialize(): void {
    // Middleware pour l'authentification WebSocket
    this.io.use(async (socket: SocketWithAuth, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
          const payload = this.authService.verifyJWT(token) as JwtPayload;
          if (payload) {
            const user = await this.authService.findUserById(payload.id);
            if (user) {
              socket.userId = user.id;
              socket.username = user.username;
            }
          }
        }
        
        next();
      } catch (error) {
        logger.warn('Erreur d\'authentification WebSocket:', error);
        next(); // Continuer sans authentification pour les utilisateurs anonymes
      }
    });

    this.io.on('connection', (socket: SocketWithAuth) => {
      this.handleConnection(socket);
    });

    logger.info('Service WebSocket initialisé');
  }

  private handleConnection(socket: SocketWithAuth): void {
    logWithContext.websocket('Connexion', socket.id, socket.userId);

    // Événements de gestion de session
    socket.on('join-session', (data) => this.handleJoinSession(socket, data));
    socket.on('leave-session', () => this.handleLeaveSession(socket));
    
    // Événements de quiz
    socket.on('start-quiz', (data) => this.handleStartQuiz(socket, data));
    socket.on('next-question', (data) => this.handleNextQuestion(socket, data));
    socket.on('submit-answer', (data) => this.handleSubmitAnswer(socket, data));
    socket.on('pause-quiz', (data) => this.handlePauseQuiz(socket, data));
    socket.on('resume-quiz', (data) => this.handleResumeQuiz(socket, data));
    socket.on('end-quiz', (data) => this.handleEndQuiz(socket, data));
    
    // Événements de chat (optionnel)
    socket.on('chat-message', (data) => this.handleChatMessage(socket, data));
    
    // Événements de système
    socket.on('ping', () => this.handlePing(socket));
    socket.on('disconnect', () => this.handleDisconnection(socket));
  }

  private async handleJoinSession(socket: SocketWithAuth, data: { sessionCode: string; nickname?: string }): Promise<void> {
    try {
      const { sessionCode, nickname } = data;

      if (!sessionCode) {
        socket.emit('error', { message: 'Code de session requis' });
        return;
      }

      // Obtenir la session
      const session = await this.quizService.getSessionByCode(sessionCode);
      if (!session) {
        socket.emit('error', { message: 'Session non trouvée' });
        return;
      }

      let participantNickname = nickname;
      if (!participantNickname) {
        participantNickname = socket.username || `Joueur_${Math.random().toString(36).substr(2, 6)}`;
      }

      // Rejoindre la session
      const { participant } = await this.quizService.joinSession(
        sessionCode, 
        participantNickname, 
        socket.userId
      );

      // Configurer le socket
      socket.sessionId = session.id;
      socket.participantId = participant.id;
      socket.join(`session_${session.id}`);

      // Suivre les sessions actives
      if (!this.activeSessions.has(session.id)) {
        this.activeSessions.set(session.id, new Set());
      }
      this.activeSessions.get(session.id)!.add(socket.id);
      this.socketSessions.set(socket.id, session.id);

      // Obtenir les informations de la session
      const participants = await this.quizService.getSessionParticipants(session.id);
      const quiz = await this.quizService.getQuizWithQuestions(session.quiz_id);

      // Confirmer la connexion
      socket.emit('session-joined', {
        session,
        participant,
        quiz: quiz ? {
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          questionCount: quiz.questions.length
        } : null
      });

      // Notifier les autres participants
      socket.to(`session_${session.id}`).emit('participant-joined', {
        participant: {
          id: participant.id,
          nickname: participant.nickname,
          score: participant.score,
          isConnected: true
        }
      });

      // Envoyer la liste des participants mise à jour
      this.io.to(`session_${session.id}`).emit('participants-updated', {
        participants: participants.map(p => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score,
          isConnected: p.is_connected
        }))
      });

      logWithContext.websocket('Session rejointe', socket.id, socket.userId, {
        sessionCode,
        sessionId: session.id,
        participantId: participant.id,
        nickname: participantNickname
      });

    } catch (error) {
      logger.error('Erreur lors de la connexion à la session:', error);
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Erreur lors de la connexion à la session'
      });
    }
  }

  private async handleLeaveSession(socket: SocketWithAuth): Promise<void> {
    if (!socket.sessionId) return;

    try {
      const sessionId = socket.sessionId;
      
      // Retirer de la session WebSocket
      socket.leave(`session_${sessionId}`);
      
      // Nettoyer les références
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.get(sessionId)!.delete(socket.id);
        if (this.activeSessions.get(sessionId)!.size === 0) {
          this.activeSessions.delete(sessionId);
        }
      }
      this.socketSessions.delete(socket.id);

      // Marquer le participant comme déconnecté
      if (socket.participantId) {
        // Note: En production, on pourrait vouloir garder une période de grâce
        // avant de marquer complètement déconnecté
        // Notifier les autres participants
        socket.to(`session_${sessionId}`).emit('participant-left', {
          participantId: socket.participantId
        });
      }

      socket.sessionId = undefined;
      socket.participantId = undefined;

      logWithContext.websocket('Session quittée', socket.id, socket.userId, { sessionId });

    } catch (error) {
      logger.error('Erreur lors de la déconnexion de la session:', error);
    }
  }

  private async handleStartQuiz(socket: SocketWithAuth, data: { sessionId: number }): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Authentification requise' });
        return;
      }

      const session = await this.quizService.startSession(data.sessionId, socket.userId);
      
      // Obtenir la première question
      const quiz = await this.quizService.getQuizWithQuestions(session.quiz_id);
      if (!quiz || quiz.questions.length === 0) {
        socket.emit('error', { message: 'Aucune question disponible' });
        return;
      }

      const firstQuestion = quiz.questions[0];
      
      // Notifier tous les participants
      this.io.to(`session_${session.id}`).emit('quiz-started', {
        session,
        currentQuestion: {
          id: firstQuestion.id,
          questionText: firstQuestion.question_text,
          questionType: firstQuestion.question_type,
          options: firstQuestion.options ? JSON.parse(firstQuestion.options) : null,
          points: firstQuestion.points,
          timeLimit: firstQuestion.time_limit,
          orderIndex: firstQuestion.order_index
        },
        totalQuestions: quiz.questions.length
      });

      logWithContext.quiz('Quiz démarré', session.quiz_id, session.id, socket.userId);

    } catch (error) {
      logger.error('Erreur lors du démarrage du quiz:', error);
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Erreur lors du démarrage du quiz'
      });
    }
  }

  private async handleNextQuestion(socket: SocketWithAuth, data: { sessionId: number }): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Authentification requise' });
        return;
      }

      const session = await this.quizService.getSessionById(data.sessionId);
      if (!session || session.host_id !== socket.userId) {
        socket.emit('error', { message: 'Non autorisé' });
        return;
      }

      const quiz = await this.quizService.getQuizWithQuestions(session.quiz_id);
      if (!quiz) {
        socket.emit('error', { message: 'Quiz non trouvé' });
        return;
      }

      // Trouver la question suivante
      const currentQuestionIndex = quiz.questions.findIndex(q => q.id === session.current_question_id);
      if (currentQuestionIndex === -1 || currentQuestionIndex >= quiz.questions.length - 1) {
        // Pas de question suivante, terminer le quiz
        await this.handleEndQuiz(socket, { sessionId: session.id });
        return;
      }

      const nextQuestion = quiz.questions[currentQuestionIndex + 1];
      
      // Mettre à jour la session
      await this.quizService['databaseService'].run(
        'UPDATE quiz_sessions SET current_question_id = ? WHERE id = ?',
        [nextQuestion.id, session.id]
      );

      // Envoyer la question suivante
      this.io.to(`session_${session.id}`).emit('next-question', {
        currentQuestion: {
          id: nextQuestion.id,
          questionText: nextQuestion.question_text,
          questionType: nextQuestion.question_type,
          options: nextQuestion.options ? JSON.parse(nextQuestion.options) : null,
          points: nextQuestion.points,
          timeLimit: nextQuestion.time_limit,
          orderIndex: nextQuestion.order_index
        },
        questionNumber: nextQuestion.order_index,
        totalQuestions: quiz.questions.length
      });

    } catch (error) {
      logger.error('Erreur lors de la question suivante:', error);
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Erreur lors de la question suivante'
      });
    }
  }

  private async handleSubmitAnswer(socket: SocketWithAuth, data: { questionId: number; answer: string }): Promise<void> {
    try {
      if (!socket.sessionId || !socket.participantId) {
        socket.emit('error', { message: 'Vous devez être dans une session' });
        return;
      }

      const result = await this.quizService.submitAnswer(
        socket.sessionId,
        data.questionId,
        socket.participantId,
        data.answer
      );

      // Confirmer la soumission au participant
      socket.emit('answer-submitted', {
        questionId: data.questionId,
        isCorrect: result.isCorrect,
        pointsEarned: result.pointsEarned
      });

      // Mettre à jour le score en temps réel
      const participants = await this.quizService.getSessionParticipants(socket.sessionId);
      this.io.to(`session_${socket.sessionId}`).emit('leaderboard-updated', {
        participants: participants.map(p => ({
          id: p.id,
          nickname: p.nickname,
          score: p.score,
          isConnected: p.is_connected
        })).sort((a, b) => b.score - a.score)
      });

    } catch (error) {
      logger.error('Erreur lors de la soumission de réponse:', error);
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Erreur lors de la soumission de réponse'
      });
    }
  }

  private async handlePauseQuiz(socket: SocketWithAuth, data: { sessionId: number }): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Authentification requise' });
        return;
      }

      const session = await this.quizService.getSessionById(data.sessionId);
      if (!session || session.host_id !== socket.userId) {
        socket.emit('error', { message: 'Non autorisé' });
        return;
      }

      await this.quizService['databaseService'].run(
        'UPDATE quiz_sessions SET status = ? WHERE id = ?',
        ['paused', session.id]
      );

      this.io.to(`session_${session.id}`).emit('quiz-paused');

    } catch (error) {
      logger.error('Erreur lors de la pause du quiz:', error);
      socket.emit('error', { message: 'Erreur lors de la pause du quiz' });
    }
  }

  private async handleResumeQuiz(socket: SocketWithAuth, data: { sessionId: number }): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Authentification requise' });
        return;
      }

      const session = await this.quizService.getSessionById(data.sessionId);
      if (!session || session.host_id !== socket.userId) {
        socket.emit('error', { message: 'Non autorisé' });
        return;
      }

      await this.quizService['databaseService'].run(
        'UPDATE quiz_sessions SET status = ? WHERE id = ?',
        ['active', session.id]
      );

      this.io.to(`session_${session.id}`).emit('quiz-resumed');

    } catch (error) {
      logger.error('Erreur lors de la reprise du quiz:', error);
      socket.emit('error', { message: 'Erreur lors de la reprise du quiz' });
    }
  }

  private async handleEndQuiz(socket: SocketWithAuth, data: { sessionId: number }): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { message: 'Authentification requise' });
        return;
      }

      const session = await this.quizService.getSessionById(data.sessionId);
      if (!session || session.host_id !== socket.userId) {
        socket.emit('error', { message: 'Non autorisé' });
        return;
      }

      await this.quizService['databaseService'].run(
        'UPDATE quiz_sessions SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['completed', session.id]
      );

      // Obtenir les résultats finaux
      const participants = await this.quizService.getSessionParticipants(session.id);
      const finalResults = participants.map(p => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        rank: 0 // Will be calculated
      })).sort((a, b) => b.score - a.score);

      // Calculer les rangs
      finalResults.forEach((participant, index) => {
        participant.rank = index + 1;
      });

      this.io.to(`session_${session.id}`).emit('quiz-ended', {
        results: finalResults,
        totalParticipants: participants.length
      });

      logWithContext.quiz('Quiz terminé', session.quiz_id, session.id, socket.userId, {
        participantCount: participants.length
      });

    } catch (error) {
      logger.error('Erreur lors de la fin du quiz:', error);
      socket.emit('error', { message: 'Erreur lors de la fin du quiz' });
    }
  }

  private handleChatMessage(socket: SocketWithAuth, data: { message: string }): void {
    if (!socket.sessionId || !data.message?.trim()) return;

    const chatMessage = {
      id: Date.now(),
      nickname: socket.username || 'Anonyme',
      message: data.message.trim(),
      timestamp: new Date().toISOString()
    };

    socket.to(`session_${socket.sessionId}`).emit('chat-message', chatMessage);
    
    logWithContext.websocket('Message chat', socket.id, socket.userId, {
      sessionId: socket.sessionId,
      messageLength: data.message.length
    });
  }

  private handlePing(socket: SocketWithAuth): void {
    socket.emit('pong', { timestamp: Date.now() });
  }

  private handleDisconnection(socket: SocketWithAuth): void {
    logWithContext.websocket('Déconnexion', socket.id, socket.userId, {
      sessionId: socket.sessionId
    });

    // Nettoyer la session si connecté
    if (socket.sessionId) {
      this.handleLeaveSession(socket);
    }
  }

  // Méthodes utilitaires publiques
  public async broadcastToSession(sessionId: number, event: string, data: any): Promise<void> {
    this.io.to(`session_${sessionId}`).emit(event, data);
  }

  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  public getConnectedParticipants(sessionId: number): number {
    return this.activeSessions.get(sessionId)?.size || 0;
  }
}