import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ScoringService } from '../scoring/scoring.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, Logger, OnModuleDestroy, Inject, forwardRef, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RateLimiter } from './rate-limiter';
import { ClockService } from './clock.service';
import { MetricsService } from './metrics.service';
import { GameHistoryService } from '../history/game-history.service';
import { BadgeService } from '../gamification/badge.service';
import { XPService, XP_SOURCES } from '../gamification/xp.service';
import { StreakService } from '../gamification/streak.service';
import { TwitchBotService } from '../twitch-bot/twitch-bot.service';
import { 
  WSJoinSessionSchema, 
  WSSubmitAnswerSchema, 
  WSReactionSchema,
  validatePayload 
} from './ws-validation';
import { QUESTION_TYPES, QuestionType } from '../quiz/question-types';

interface SessionPlayer {
  id: string; // socket.id courant
  nickname: string;
  score: number;
  streak: number;
  userId?: string; // stable si utilisateur authentifié pour reconnexion
}

interface SessionQuestion {
  id: string;
  type: QuestionType;
  timeLimitMs: number;
  options: { id: string; isCorrect: boolean; orderIndex?: number | null }[];
  // Pour text_input
  correctAnswers?: string[];
  caseSensitive?: boolean;
}

interface SessionState {
  id: string;
  players: Map<string, SessionPlayer>;
  detached?: Map<string, { nickname: string; score: number; streak: number; userId: string; expiresAt: number }>; // userId -> snapshot TTL
  viewers?: Set<string>; // sockets spectateurs
  questionIndex: number;
  questions: SessionQuestion[];
  answers: Map<string, Set<string>>; // questionId -> set(userSocketIds) pour double réponses
  activeQuestionStartedAt?: number;
  phase?: 'lobby' | 'question' | 'reveal' | 'finished';
  timer?: NodeJS.Timeout;
  hostId?: string; // socket.id du host
  autoNext?: boolean; // démarrage automatique des questions suivantes
  allowSpectatorReactions?: boolean; // spectateurs peuvent envoyer des réactions
  createdAt: number; // pour métrique durée session
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i=0;i<len;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer() server!: Server;

  private sessions = new Map<string, SessionState>();
  private logger = new Logger('RealtimeGateway');
  private limiter = new RateLimiter({ windowMs: 1000, max: 5 });
  private reactionRule = { windowMs: 2000, max: 6 };
  private answerRule = { windowMs: 2000, max: 3 };
  private answerLatencyBuckets = [0.1,0.25,0.5,0.75,1,2,3,5]; // secondes
  private questionDurationBuckets = [0.25,0.5,0.75,1,1.5,2,3,5,10];
  private sessionDurationBuckets = [1,2,5,10,20,30,60,120,300];
  private sessionCleanupInterval?: NodeJS.Timeout;
  private sessionCreationLocks = new Map<string, Promise<void>>(); // Mutex pour création de session
  private getRevealDelayMs() { return parseInt(process.env.REVEAL_DELAY_MS || '2000', 10); }
  private getDetachedTtlMs() { return parseInt(process.env.DETACHED_TTL_MS || '600000', 10); }
  private getFinishedSessionTtlMs() { return parseInt(process.env.FINISHED_SESSION_TTL_MS || '3600000', 10); } // 1h par défaut

  private emitReject(socket: Socket, event: string, code: string, message?: string, details?: Record<string, unknown>) {
    const payload: { code: string; message?: string; details?: Record<string, unknown> } = { code };
    if (message) payload.message = message;
    if (details) payload.details = details;
    socket.emit(event, payload);
  }

  /**
   * Construit le payload session_state de manière centralisée
   * Évite la duplication de code et assure la cohérence
   */
  private buildSessionStatePayload(
    session: SessionState,
    options: {
      code?: string;
      socketId?: string;
      isSpectator?: boolean;
      reconnected?: boolean;
      remainingMs?: number;
    } = {}
  ) {
    const { code, socketId, isSpectator = false, reconnected = false } = options;
    let remainingMs = options.remainingMs ?? 0;
    
    // Calculer remainingMs si en phase question
    if (remainingMs === 0 && session.phase === 'question' && session.activeQuestionStartedAt) {
      const activeQ = session.questions[session.questionIndex];
      if (activeQ) {
        const elapsed = this.clock.now() - session.activeQuestionStartedAt;
        remainingMs = Math.max(0, (activeQ.timeLimitMs || 0) - elapsed);
      }
    }

    return {
      code,
      status: session.phase || 'lobby',
      questionIndex: session.questionIndex,
      remainingMs,
      totalQuestions: session.questions.length,
      isHost: socketId ? session.hostId === socketId : false,
      isSpectator,
      autoNext: session.autoNext,
      reconnected: reconnected || undefined,
      hostId: session.hostId,
      players: this.buildPlayersList(session),
      spectators: this.buildSpectatorsList(session),
      allowSpectatorReactions: !!session.allowSpectatorReactions,
    };
  }

  /**
   * Émet session_state à un socket spécifique
   */
  private emitSessionState(socket: Socket, session: SessionState, options: Parameters<typeof this.buildSessionStatePayload>[1] = {}) {
    socket.emit('session_state', this.buildSessionStatePayload(session, { ...options, socketId: socket.id }));
  }

  /**
   * Émet session_state à tous les participants d'une session
   */
  private broadcastSessionState(code: string, session: SessionState, remainingMs = 0) {
    // Émettre à chaque joueur avec son isHost personnalisé
    for (const [pid] of session.players) {
      const sock = this.server.sockets.sockets.get(pid);
      if (sock) {
        this.emitSessionState(sock, session, { code, remainingMs });
      }
    }
    // Émettre aux spectateurs
    if (session.viewers) {
      for (const vid of session.viewers) {
        const sock = this.server.sockets.sockets.get(vid);
        if (sock) {
          this.emitSessionState(sock, session, { code, isSpectator: true, remainingMs });
        }
      }
    }
  }

  constructor(
    private scoring: ScoringService,
    private prisma: PrismaService,
    private jwt: JwtService,
    private clock: ClockService,
    private metrics: MetricsService,
    @Inject(forwardRef(() => GameHistoryService))
    private gameHistoryService: GameHistoryService,
    @Inject(forwardRef(() => BadgeService))
    private badgeService: BadgeService,
    @Inject(forwardRef(() => XPService))
    private xpService: XPService,
    @Inject(forwardRef(() => StreakService))
    private streakService: StreakService,
    @Optional() @Inject(forwardRef(() => TwitchBotService))
    private twitchBotService?: TwitchBotService,
  ) {
    // Nettoyage périodique des sessions terminées pour libérer la mémoire
    this.sessionCleanupInterval = setInterval(() => this.cleanupFinishedSessions(), 60000);
    
    // Configurer les handlers du bot Twitch si disponible
    if (this.twitchBotService) {
      this.twitchBotService.setAnswerHandler(this.handleTwitchAnswer.bind(this));
      this.twitchBotService.setTextAnswerHandler(this.handleTwitchTextAnswer.bind(this));
    }
  }

  onModuleDestroy() {
    // Nettoyage propre à l'arrêt du module
    if (this.sessionCleanupInterval) {
      clearInterval(this.sessionCleanupInterval);
    }
    // Appeler dispose() pour nettoyer tous les timers et états
    this.dispose();
  }

  /** Nettoie les sessions terminées qui sont inactives depuis trop longtemps */
  private cleanupFinishedSessions() {
    const now = this.clock.now();
    const ttl = this.getFinishedSessionTtlMs();
    let cleaned = 0;
    
    for (const [code, session] of this.sessions) {
      if (session.phase === 'finished' && session.players.size === 0) {
        const age = now - session.createdAt;
        if (age > ttl) {
          if (session.timer) clearTimeout(session.timer);
          this.sessions.delete(code);
          this.metrics.dec('sessions.active');
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} finished sessions`);
    }
  }

  async handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth?.token || (socket.handshake.query?.token as string) || '').replace('Bearer ', '');
      if (token) {
        // Authentification avec token
        const payload = await this.jwt.verifyAsync(token).catch(() => { throw new UnauthorizedException('invalid_token'); });
        (socket.data as any).userId = payload.sub;
        (socket.data as any).authenticated = true;
      } else {
        // Connexion anonyme (spectateur uniquement)
        (socket.data as any).userId = null;
        (socket.data as any).authenticated = false;
        this.logger.log(`Connexion anonyme acceptée: ${socket.id}`);
      }
    } catch (e) {
      this.logger.warn(`Refus connexion socket: ${e}`);
      socket.emit('error_generic', { code: 'auth_failed' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    // Retirer joueur des sessions
    for (const [code, s] of this.sessions.entries()) {
      if (s.viewers && s.viewers.has(socket.id)) {
        s.viewers.delete(socket.id);
        this.metrics.dec('viewers.active');
      }
      const existing = s.players.get(socket.id);
      if (existing && s.players.delete(socket.id)) {
        this.metrics.inc('player.disconnect');
        this.metrics.dec('players.active');
        if (existing.userId && s.detached) {
          // cleanup préalable
          this.cleanupDetached(s);
          s.detached.set(existing.userId, { nickname: existing.nickname, score: existing.score, streak: existing.streak, userId: existing.userId, expiresAt: this.clock.now() + this.getDetachedTtlMs() });
        }
        let hostChanged = false;
        if (s.hostId === socket.id) {
          // Réassigner host au premier joueur restant si dispo
            const first = s.players.values().next();
            if (!first.done) {
              s.hostId = first.value.id;
            } else {
              s.hostId = undefined;
            }
            hostChanged = true;
        }
        if (s.players.size === 0) {
          this.metrics.dec('sessions.active');
        }
        this.broadcastLeaderboard(code);
        if (hostChanged) {
          this.server.to(code).emit('host_changed', { hostId: s.hostId });
          // Rafraîchir l’état pour chaque joueur afin de refléter isHost
          for (const pid of s.players.keys()) {
            const sock = this.server.sockets.sockets.get(pid);
            if (sock) {
              sock.emit('session_state', { status: s.phase || 'lobby', questionIndex: s.questionIndex, remainingMs: 0, totalQuestions: s.questions.length, isHost: s.hostId === pid, hostId: s.hostId, players: this.buildPlayersList(s), spectators: this.buildSpectatorsList(s), allowSpectatorReactions: !!s.allowSpectatorReactions });
            }
          }
        }
      }
    }
  }

  /** Join session (creates ephemeral session with quiz questions loaded) */
  @SubscribeMessage('join_session')
  async handleJoin(@MessageBody() rawData: unknown, @ConnectedSocket() socket: Socket) {
    // Validation Zod du payload
    const validation = validatePayload(WSJoinSessionSchema, rawData);
    if (!validation.success) {
      this.emitReject(socket, 'join_rejected', 'invalid_payload', validation.error);
      return;
    }
    const data = validation.data;
    let { code, quizId } = data;
    if (!code) {
      // Générer code session alphanum 6 chars non collision
      let generated = randomCode();
      while (this.sessions.has(generated) || await this.prisma.gameSession.findUnique({ where: { code: generated } })) {
        generated = randomCode();
      }
      code = generated;
      socket.emit('session_code_assigned', { code });
    }
  if (!this.sessions.has(code!)) {
      // Charger questions minimalistes (id, timeLimitMs, options avec corrections)
      const questions = await this.prisma.question.findMany({
        where: { quizId },
        orderBy: { order: 'asc' },
        include: { options: { select: { id: true, isCorrect: true } } },
      });
      // Créer ou récupérer la session DB de façon race-safe
      await this.createOrGetSession(code!, quizId);
      // Lire le flag persistant si disponible
      let allowSpectator = true;
      try {
        const db = await this.prisma.gameSession.findUnique({ where: { code: code! } });
        if (db && typeof (db as any).allowSpectatorReactions === 'boolean') {
          allowSpectator = (db as any).allowSpectatorReactions as boolean;
        }
      } catch {}
      this.sessions.set(code!, {
        id: code,
        players: new Map(),
    detached: new Map(),
        viewers: new Set(),
        questionIndex: 0,
        questions: questions.map((q: any) => ({
          id: q.id,
          type: (q.type || 'multiple_choice') as QuestionType,
          timeLimitMs: q.timeLimitMs,
          options: q.options.map((o: any) => ({ 
            id: o.id, 
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex ?? null 
          })),
          correctAnswers: q.correctAnswers ? JSON.parse(q.correctAnswers) : undefined,
          caseSensitive: q.caseSensitive ?? false,
        })),
        answers: new Map(),
        phase: 'lobby',
        autoNext: false,
        allowSpectatorReactions: allowSpectator,
        createdAt: this.clock.now(),
      });
      this.metrics.inc('sessions.active');
      this.metrics.inc('session.create');
    }
  const state = this.sessions.get(code!)!;
    // Protection: empêcher un client de ré-utiliser le même code avec un autre quiz
    const existingDb = await this.prisma.gameSession.findUnique({ where: { code } });
    if (existingDb && existingDb.quizId !== quizId) {
      this.emitReject(socket, 'join_rejected', 'quiz_mismatch');
      return;
    }
  const nickname = data.nickname || 'Player-' + socket.id.slice(0, 4);
  (socket.data as any).nickname = nickname;
    const isAuthenticated = !!(socket.data as any).authenticated;
    // Les utilisateurs non authentifiés sont forcés en spectateur
    const isSpectator = !!data.spectator || !isAuthenticated;
    if (isSpectator) {
      state.viewers?.add(socket.id);
      this.metrics.inc('viewers.active');
  socket.join(code!);
  (socket.data as any).nickname = data.nickname || (socket.data as any).nickname || 'Spectator-' + socket.id.slice(0,4);
      let remainingMs = 0;
      if (state.phase === 'question' && state.activeQuestionStartedAt) {
        const qNow = this.clock.now();
        const activeQ = state.questions[state.questionIndex];
        const elapsed = qNow - state.activeQuestionStartedAt;
        remainingMs = Math.max(0, (activeQ.timeLimitMs || 0) - elapsed);
      }
  socket.emit('session_state', { code, status: state.phase || 'lobby', questionIndex: state.questionIndex, remainingMs, totalQuestions: state.questions.length, isHost: false, isSpectator: true, autoNext: state.autoNext, hostId: state.hostId, players: this.buildPlayersList(state), spectators: this.buildSpectatorsList(state), allowSpectatorReactions: !!state.allowSpectatorReactions });
      this.broadcastLeaderboard(code);
      return;
    }
  const userId = (socket.data as any).userId as string | undefined;
  const player: SessionPlayer = { id: socket.id, nickname, score: 0, streak: 0, userId };

  // Reconnexion: uniquement si userId détaché ou ancien socket inactif
  let reconnectedFromId: string | undefined;
  if (userId) {
    this.cleanupDetached(state);
    // Cas 1: joueur détaché connu
    if (state.detached?.has(userId)) {
      const snapshot = state.detached.get(userId)!;
      player.score = snapshot.score;
      player.streak = snapshot.streak;
      player.nickname = snapshot.nickname;
      state.detached.delete(userId);
      reconnectedFromId = 'detached';
    } else {
      // Cas 2: ancien socket encore dans players mais plus connecté -> reconnexion
      for (const [sid, existing] of state.players.entries()) {
        if (existing.userId && existing.userId === userId) {
          const stillConnected = this.server.sockets.sockets.has(sid);
          if (!stillConnected) {
            reconnectedFromId = sid;
            player.score = existing.score;
            player.streak = existing.streak;
            player.nickname = existing.nickname;
            state.players.delete(sid);
            for (const set of state.answers.values()) {
              if (set.has(sid)) { set.delete(sid); set.add(socket.id); }
            }
          }
          break;
        }
      }
    }
  }
    state.players.set(socket.id, player);
    if (reconnectedFromId) {
      if (state.hostId === reconnectedFromId) state.hostId = socket.id; // transférer host automatiquement
      this.metrics.inc('player.reconnect');
    } else {
      if (!state.hostId) state.hostId = socket.id; // premier arrivé devient host
      this.metrics.inc('player.join');
      this.metrics.inc('players.active');
    }
  socket.join(code!);
    try {
      const sessionDb = await this.prisma.gameSession.findUnique({ where: { code } });
      if (sessionDb) {
        const uniqueKey = `${sessionDb.id}:${nickname}`;
        await (this.prisma.gamePlayer as any).upsert({
          where: { uniqueKey },
          update: {},
          create: { sessionId: sessionDb.id, nickname, userId, uniqueKey },
        });
      }
    } catch (e) {
      this.logger.warn(`Persist player failed: ${e}`);
    }
  let remainingMs = 0;
  if (state.phase === 'question' && state.activeQuestionStartedAt) {
    const qNow = this.clock.now();
    const activeQ = state.questions[state.questionIndex];
    const elapsed = qNow - state.activeQuestionStartedAt;
    remainingMs = Math.max(0, (activeQ.timeLimitMs || 0) - elapsed);
  }
  socket.emit('session_state', { code, status: state.phase || 'lobby', questionIndex: state.questionIndex, remainingMs, totalQuestions: state.questions.length, isHost: state.hostId === socket.id, isSpectator: false, autoNext: state.autoNext, reconnected: !!reconnectedFromId, hostId: state.hostId, players: this.buildPlayersList(state), spectators: this.buildSpectatorsList(state), allowSpectatorReactions: !!state.allowSpectatorReactions });
    if (reconnectedFromId) {
      // Forcer envoi leaderboard tout de suite pour refléter score restauré côté nouveau socket
      const entries = this.buildLeaderboardEntries(state);
      socket.emit('leaderboard_update', { entries });
    }
    // Informer les autres joueurs de leur statut isHost mis à jour (si un host vient d'être défini)
    if (state.hostId === socket.id) {
      for (const [pid] of state.players.entries()) {
        if (pid === socket.id) continue;
        const other = this.server.sockets.sockets.get(pid);
        if (other) {
          let rMs = 0;
          if (state.phase === 'question' && state.activeQuestionStartedAt) {
            const qNow2 = this.clock.now();
            const activeQ2 = state.questions[state.questionIndex];
            const elapsed2 = qNow2 - state.activeQuestionStartedAt;
            rMs = Math.max(0, (activeQ2.timeLimitMs || 0) - elapsed2);
          }
          other.emit('session_state', { code, status: state.phase || 'lobby', questionIndex: state.questionIndex, remainingMs: rMs, totalQuestions: state.questions.length, isHost: state.hostId === pid, autoNext: state.autoNext, hostId: state.hostId, players: this.buildPlayersList(state), spectators: this.buildSpectatorsList(state), allowSpectatorReactions: !!state.allowSpectatorReactions });
        }
      }
    }
    this.broadcastLeaderboard(code);
  }

  /** Host triggers start of current question */
  @SubscribeMessage('start_question')
  handleStartQuestion(@MessageBody() data: { code: string }, @ConnectedSocket() socket: Socket) {
    const code = data.code || this.findSessionForSocket(socket.id);
    if (!code) { this.emitReject(socket, 'start_question_rejected', 'unknown_session'); return; }
    const session = this.sessions.get(code);
    if (!session) { this.emitReject(socket, 'start_question_rejected', 'unknown_session'); return; }
    if (session.hostId && session.hostId !== socket.id) {
      this.emitReject(socket, 'start_question_rejected', 'not_host');
      return;
    }
    if (session.phase !== 'lobby' && session.phase !== 'reveal') { this.emitReject(socket, 'start_question_rejected', 'invalid_phase'); return; } // only from lobby or after reveal
    const q = session.questions[session.questionIndex];
    if (!q) { this.emitReject(socket, 'start_question_rejected', 'unknown_question'); return; }
    this.startQuestionInternal(code, session);
  }

  private forceReveal(code: string) {
    const session = this.sessions.get(code);
    if (!session) return;
    if (session.phase !== 'question') return;
    session.phase = 'reveal';
    this.clearTimer(session);
    this.metrics.inc('question.reveal');
    const q = session.questions[session.questionIndex];
    if (session.activeQuestionStartedAt) {
      const dur = this.clock.now() - session.activeQuestionStartedAt;
      this.metrics.observe('question.duration_seconds', dur/1000, this.questionDurationBuckets);
    }
    const correctOptionIds = q.options.filter(o => o.isCorrect).map(o => o.id);
    this.server.to(code).emit('question_reveal', { questionId: q.id, correctOptionIds });
    // Schedule next question or finish
  session.timer = this.clock.setTimeout(() => this.advanceOrFinish(code), this.getRevealDelayMs()); // configurable reveal delay
  }

  @SubscribeMessage('force_reveal')
  handleForceReveal(@MessageBody() data: { code: string }, @ConnectedSocket() socket: Socket) {
    const { code } = data;
    const session = this.sessions.get(code);
    if (!session) { this.emitReject(socket, 'force_reveal_rejected', 'unknown_session'); return; }
    if (session.hostId !== socket.id) { this.emitReject(socket, 'force_reveal_rejected', 'not_host'); return; }
    if (session.phase !== 'question') { this.emitReject(socket, 'force_reveal_rejected', 'invalid_phase'); return; }
    this.forceReveal(code);
  }

  @SubscribeMessage('advance_next')
  handleAdvanceNext(@MessageBody() data: { code: string }, @ConnectedSocket() socket: Socket) {
    const { code } = data;
    const session = this.sessions.get(code);
    if (!session) { this.emitReject(socket, 'advance_next_rejected', 'unknown_session'); return; }
    if (session.hostId !== socket.id) { this.emitReject(socket, 'advance_next_rejected', 'not_host'); return; }
    // Autorisé depuis reveal ou lobby (pour passer à la suivante ou finir)
    if (session.phase !== 'reveal' && session.phase !== 'lobby') { this.emitReject(socket, 'advance_next_rejected', 'invalid_phase'); return; }
    this.advanceOrFinish(code);
  }

  private advanceOrFinish(code: string) {
    const session = this.sessions.get(code);
    if (!session) return;
    this.clearTimer(session);
    this.metrics.inc('session.advance');
    if (session.questionIndex + 1 >= session.questions.length) {
      session.phase = 'finished';
      // Observer durée session
      if (session.createdAt) {
        const sessionDur = this.clock.now() - session.createdAt;
        this.metrics.observe('session.duration_seconds', sessionDur/1000, this.sessionDurationBuckets);
      }
      // Enregistrer l'historique des joueurs authentifiés
      this.recordGameHistory(code, session).catch(err => {
        this.logger.error('Failed to record game history', err);
      });
      // Clear detached à la fin
      if (session.detached) session.detached.clear();
      this.server.to(code).emit('session_finished', { final: this.buildLeaderboardEntries(session) });
      return;
    }
    session.questionIndex += 1;
    session.activeQuestionStartedAt = undefined;
    session.phase = 'lobby';
    this.broadcastSessionState(code, session, 0);
    if (session.autoNext) {
      session.timer = this.clock.setTimeout(() => {
        if (session.phase === 'lobby') {
          this.metrics.inc('question.auto_start');
            this.startQuestionInternal(code, session);
        }
      }, 150); // petit délai pour permettre aux clients d'afficher lobby
    }
  }

  /**
   * Enregistre l'historique de jeu pour tous les joueurs authentifiés
   * et met à jour les stats de gamification (XP, badges, streaks)
   */
  private async recordGameHistory(code: string, session: SessionState) {
    // Récupérer les infos du quiz depuis la DB
    const dbSession = await this.prisma.gameSession.findUnique({
      where: { code },
      include: { quiz: { select: { id: true, title: true } } },
    });
    
    if (!dbSession) return;

    const leaderboard = this.buildLeaderboardEntries(session);
    const totalPlayers = leaderboard.length;
    const totalQuestions = session.questions.length;

    // Récupérer les réponses des joueurs pour calculer les stats
    const playerAnswers = await this.prisma.playerAnswer.findMany({
      where: {
        player: {
          session: { code },
        },
      },
      include: {
        player: true,
      },
    });

    // Grouper par playerId
    const answersByPlayer = new Map<string, typeof playerAnswers>();
    for (const answer of playerAnswers) {
      const arr = answersByPlayer.get(answer.playerId) || [];
      arr.push(answer);
      answersByPlayer.set(answer.playerId, arr);
    }

    // Pour chaque joueur authentifié, enregistrer dans l'historique et mettre à jour la gamification
    for (const entry of leaderboard) {
      const player = Array.from(session.players.values()).find(p => p.nickname === entry.nickname);
      if (!player?.userId) continue; // Skip joueurs non authentifiés

      const playerDbRecord = await this.prisma.gamePlayer.findFirst({
        where: { sessionId: dbSession.id, nickname: player.nickname },
      });

      const answers = playerDbRecord ? answersByPlayer.get(playerDbRecord.id) || [] : [];
      const correctCount = answers.filter(a => a.correct).length;
      const correctTimes = answers.filter(a => a.correct && a.timeMs > 0).map(a => a.timeMs);
      const avgTimeMs = correctTimes.length > 0
        ? Math.round(correctTimes.reduce((a, b) => a + b, 0) / correctTimes.length)
        : undefined;

      // Enregistrer l'historique de jeu
      await this.gameHistoryService.recordGame({
        userId: player.userId,
        sessionCode: code,
        quizId: dbSession.quiz.id,
        quizTitle: dbSession.quiz.title,
        score: entry.score,
        rank: entry.rank,
        totalPlayers,
        correctCount,
        totalQuestions,
        avgTimeMs,
      });

      // === GAMIFICATION ===
      try {
        // 1. Calculer et attribuer l'XP
        let totalXp = XP_SOURCES.GAME_COMPLETE; // 25 XP pour avoir terminé

        // XP pour les bonnes réponses
        totalXp += correctCount * XP_SOURCES.CORRECT_ANSWER; // 10 XP par bonne réponse

        // XP bonus selon le classement
        if (entry.rank === 1 && totalPlayers > 1) {
          totalXp += XP_SOURCES.GAME_WIN; // 100 XP pour la victoire
          totalXp += XP_SOURCES.FIRST_PLACE; // 75 XP pour la 1ère place
        } else if (entry.rank === 2 && totalPlayers > 2) {
          totalXp += XP_SOURCES.SECOND_PLACE; // 50 XP pour la 2ème place
        } else if (entry.rank === 3 && totalPlayers > 3) {
          totalXp += XP_SOURCES.THIRD_PLACE; // 25 XP pour la 3ème place
        }

        // Partie parfaite ?
        if (correctCount === totalQuestions && totalQuestions > 0) {
          totalXp += XP_SOURCES.PERFECT_GAME; // 50 XP bonus
        }

        // Bonus de streak (séries de bonnes réponses)
        const maxStreak = this.calculateMaxAnswerStreak(answers);
        if (maxStreak >= 3) {
          totalXp += XP_SOURCES.STREAK_BONUS * Math.floor(maxStreak / 3); // 5 XP par série de 3
        }

        await this.xpService.addXP(player.userId, totalXp, 'game_complete');

        // 2. Mettre à jour le streak journalier
        await this.streakService.updateStreak(player.userId);

        // 3. Vérifier et attribuer les badges de jeu
        const isWin = entry.rank === 1 && totalPlayers > 1;
        const correctRate = totalQuestions > 0 ? correctCount / totalQuestions : 0;
        const fastestAnswerMs = answers.filter(a => a.correct).reduce((min, a) => Math.min(min, a.timeMs || Infinity), Infinity);
        
        await this.badgeService.checkAndAwardBadges(player.userId, {
          rank: entry.rank,
          totalPlayers,
          correctRate,
          isWin,
          fastestAnswerMs: fastestAnswerMs !== Infinity ? fastestAnswerMs : undefined,
        });

        // 4. Vérifier les badges de streak
        await this.badgeService.checkStreakBadges(player.userId);

        this.logger.debug(`Gamification updated for user ${player.userId}: +${totalXp} XP`);
      } catch (err) {
        this.logger.error(`Failed to update gamification for user ${player.userId}`, err);
      }
    }

    this.logger.log(`Recorded game history for session ${code}`);
  }

  /**
   * Calcule la plus longue série de bonnes réponses consécutives
   */
  private calculateMaxAnswerStreak(answers: Array<{ correct: boolean }>): number {
    let maxStreak = 0;
    let currentStreak = 0;
    for (const answer of answers) {
      if (answer.correct) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }
    return maxStreak;
  }

  private startQuestionInternal(code: string, session: SessionState) {
    const q = session.questions[session.questionIndex];
    if (!q) return;
    session.phase = 'question';
    session.activeQuestionStartedAt = this.clock.now();
    this.clearTimer(session);
    session.timer = this.clock.setTimeout(() => this.forceReveal(code), q.timeLimitMs || 5000);
    this.metrics.inc('question.start');
    this.server.to(code).emit('question_started', { questionId: q.id, index: session.questionIndex, timeLimitMs: q.timeLimitMs });
  }

  @SubscribeMessage('submit_answer')
  async handleAnswer(
    @MessageBody() data: { 
      questionId: string; 
      optionId?: string; 
      textAnswer?: string;
      orderedOptionIds?: string[];
      clientTs: number; 
      code?: string 
    },
    @ConnectedSocket() socket: Socket,
  ) {
  const code = data.code || this.findSessionForSocket(socket.id);
  if (!code) { socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'unknown_session' }); return; }
  const session = this.sessions.get(code);
  if (!session) { socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'unknown_session' }); return; }
    const player = session.players.get(socket.id);
    if (!player) {
      socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'spectator' });
      return;
    }
    if (!this.limiter.allow(socket.id + ':answer', this.answerRule)) {
      socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'rate_limited' });
      return;
    }
    // Double réponse ?
    if (!session.answers.has(data.questionId)) session.answers.set(data.questionId, new Set());
    const answeredSet = session.answers.get(data.questionId)!;
    if (answeredSet.has(socket.id)) {
      socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'already_answered' });
      return;
    }
    answeredSet.add(socket.id);

    const currentQuestion = session.questions.find(q => q.id === data.questionId);
    if (!currentQuestion) {
      socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'unknown_question' });
      return;
    }

    const now = this.clock.now();
    const startedAt = session.activeQuestionStartedAt ?? now;
    const elapsed = now - startedAt;

    // Vérifier la réponse selon le type de question
    const { correct, partialScore } = this.checkAnswerByType(currentQuestion, data);

    if (correct) player.streak += 1; else player.streak = 0;
    
    // Calculer le score (avec bonus partiel pour ordering)
    let scoreDelta = this.scoring.computeScore({
      correct,
      timeMs: elapsed,
      limitMs: currentQuestion.timeLimitMs || 5000,
      streak: player.streak,
    });

    // Bonus de score partiel pour les questions d'ordre
    if (partialScore !== undefined && partialScore > 0 && !correct) {
      scoreDelta = Math.floor(scoreDelta * partialScore * 0.5); // 50% du score max × score partiel
    }

    player.score += scoreDelta;
    socket.emit('answer_ack', { 
      questionId: data.questionId, 
      accepted: true, 
      correct, 
      scoreDelta,
      partialScore 
    });
  this.broadcastLeaderboard(code);
  this.metrics.inc('answer.received');
  this.metrics.observe('answer.latency_seconds', elapsed/1000, this.answerLatencyBuckets);
    // Émettre un session_state de progression
    let rem = 0;
    if (session.phase === 'question' && session.activeQuestionStartedAt) {
      const now2 = this.clock.now();
      rem = Math.max(0, (currentQuestion.timeLimitMs || 0) - (now2 - session.activeQuestionStartedAt));
    }
  socket.emit('session_state', { status: session.phase || 'lobby', questionIndex: session.questionIndex, remainingMs: rem, totalQuestions: session.questions.length, isHost: session.hostId === socket.id, autoNext: session.autoNext, hostId: session.hostId, players: this.buildPlayersList(session), spectators: this.buildSpectatorsList(session), allowSpectatorReactions: !!session.allowSpectatorReactions });
    // Persister réponse
    try {
      const sessionDb = await this.prisma.gameSession.findUnique({ where: { code } });
      if (sessionDb) {
        const gpUniqueKey = `${sessionDb.id}:${player.nickname}`;
        const gamePlayer = await (this.prisma.gamePlayer as any).findUnique({ where: { uniqueKey: gpUniqueKey } });
        if (gamePlayer) {
          const paUnique = `${gamePlayer.id}:${currentQuestion.id}`;
            await (this.prisma.playerAnswer as any).upsert({
              where: { uniqueKey: paUnique },
              update: { 
                optionId: data.optionId || null, 
                textAnswer: data.textAnswer || null,
                orderingAnswer: data.orderedOptionIds ? JSON.stringify(data.orderedOptionIds) : null,
                correct, 
                timeMs: elapsed 
              },
              create: { 
                playerId: gamePlayer.id, 
                questionId: currentQuestion.id, 
                optionId: data.optionId || null, 
                textAnswer: data.textAnswer || null,
                orderingAnswer: data.orderedOptionIds ? JSON.stringify(data.orderedOptionIds) : null,
                correct, 
                timeMs: elapsed, 
                uniqueKey: paUnique 
              },
            });
            await (this.prisma.gamePlayer as any).update({ where: { id: gamePlayer.id }, data: { score: player.score } });
        }
      }
    } catch (e) {
      this.logger.warn(`Persist answer failed: ${e}`);
    }
    // Auto reveal if everyone answered
    const q = session.questions[session.questionIndex];
    const answeredCount = session.answers.get(q.id)?.size || 0;
    if (answeredCount >= session.players.size) {
      this.metrics.inc('question.autoreveal');
      this.forceReveal(code);
    }
  }

  /**
   * Vérifie une réponse selon le type de question
   */
  private checkAnswerByType(
    question: SessionQuestion,
    answer: { optionId?: string; textAnswer?: string; orderedOptionIds?: string[] }
  ): { correct: boolean; partialScore?: number } {
    switch (question.type) {
      case QUESTION_TYPES.MULTIPLE_CHOICE:
      case QUESTION_TYPES.TRUE_FALSE:
        if (!answer.optionId) return { correct: false };
        const option = question.options.find(o => o.id === answer.optionId);
        return { correct: option?.isCorrect ?? false };

      case QUESTION_TYPES.TEXT_INPUT:
        if (!answer.textAnswer || !question.correctAnswers) return { correct: false };
        const normalize = (s: string) => {
          let n = s.trim();
          if (!question.caseSensitive) n = n.toLowerCase();
          return n;
        };
        const normalizedAnswer = normalize(answer.textAnswer);
        const isCorrect = question.correctAnswers.some(ca => normalize(ca) === normalizedAnswer);
        return { correct: isCorrect };

      case QUESTION_TYPES.ORDERING:
        if (!answer.orderedOptionIds || answer.orderedOptionIds.length === 0) {
          return { correct: false, partialScore: 0 };
        }
        const sortedOptions = [...question.options]
          .filter(o => o.orderIndex !== undefined && o.orderIndex !== null)
          .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
        const correctOrder = sortedOptions.map(o => o.id);
        
        const isFullyCorrect =
          answer.orderedOptionIds.length === correctOrder.length &&
          answer.orderedOptionIds.every((id, idx) => id === correctOrder[idx]);

        let correctPositions = 0;
        for (let i = 0; i < Math.min(answer.orderedOptionIds.length, correctOrder.length); i++) {
          if (answer.orderedOptionIds[i] === correctOrder[i]) {
            correctPositions++;
          }
        }
        const partialScore = correctOrder.length > 0 ? correctPositions / correctOrder.length : 0;
        
        return { correct: isFullyCorrect, partialScore };

      default:
        // Fallback pour les anciens types
        if (answer.optionId) {
          const opt = question.options.find(o => o.id === answer.optionId);
          return { correct: opt?.isCorrect ?? false };
        }
        return { correct: false };
    }
  }

  @SubscribeMessage('reaction')
  handleReaction(@MessageBody() data: { emoji: string; code?: string }, @ConnectedSocket() socket: Socket) {
    const code = data.code || this.findSessionForSocket(socket.id);
    if (!code) { this.emitReject(socket, 'reaction_rejected', 'unknown_session'); return; }
    // Si spectator et non autorisé
    const s = this.sessions.get(code);
    if (s && s.viewers?.has(socket.id) && !s.allowSpectatorReactions) {
      this.emitReject(socket, 'reaction_rejected', 'spectator_disabled');
      return;
    }
    if (!this.limiter.allow(socket.id + ':reaction', this.reactionRule)) {
      this.emitReject(socket, 'reaction_rejected', 'rate_limited');
      return;
    }
    this.server.to(code).emit('reaction_broadcast', { playerId: socket.id, emoji: data.emoji });
    this.metrics.inc('reaction.broadcast');
  }

  @SubscribeMessage('toggle_spectator_reactions')
  handleToggleSpectatorReactions(@MessageBody() data: { code: string; enabled: boolean }, @ConnectedSocket() socket: Socket) {
    const { code, enabled } = data;
    const session = this.sessions.get(code);
    if (!session) { this.emitReject(socket, 'toggle_spectator_reactions_rejected', 'unknown_session'); return; }
    if (session.hostId !== socket.id) { this.emitReject(socket, 'toggle_spectator_reactions_rejected', 'not_host'); return; }
  session.allowSpectatorReactions = !!enabled;
  // Persistance best-effort
  (this.prisma.gameSession as any).update({ where: { code }, data: { allowSpectatorReactions: session.allowSpectatorReactions } }).catch(()=>{});
    this.server.to(code).emit('spectator_reactions_toggled', { enabled: session.allowSpectatorReactions });
    for (const pid of session.players.keys()) {
      const sock = this.server.sockets.sockets.get(pid);
      if (sock) {
        sock.emit('session_state', { status: session.phase || 'lobby', questionIndex: session.questionIndex, remainingMs: 0, totalQuestions: session.questions.length, isHost: session.hostId === pid, autoNext: session.autoNext, hostId: session.hostId, players: this.buildPlayersList(session), spectators: this.buildSpectatorsList(session), allowSpectatorReactions: !!session.allowSpectatorReactions });
      }
    }
  }

  @SubscribeMessage('transfer_host')
  handleTransferHost(@MessageBody() data: { code: string; targetPlayerId: string }, @ConnectedSocket() socket: Socket) {
    const { code, targetPlayerId } = data;
    const session = this.sessions.get(code);
    if (!session) { this.emitReject(socket, 'transfer_host_rejected', 'unknown_session'); return; }
    if (session.hostId !== socket.id) {
      this.emitReject(socket, 'transfer_host_rejected', 'not_host');
      return;
    }
    if (!session.players.has(targetPlayerId)) {
      this.emitReject(socket, 'transfer_host_rejected', 'unknown_target');
      return;
    }
    session.hostId = targetPlayerId;
    this.server.to(code).emit('host_changed', { hostId: session.hostId });
    this.metrics.inc('host.transfer');
    for (const pid of session.players.keys()) {
      const sock = this.server.sockets.sockets.get(pid);
      if (sock) {
  sock.emit('session_state', { status: session.phase || 'lobby', questionIndex: session.questionIndex, remainingMs: 0, totalQuestions: session.questions.length, isHost: session.hostId === pid, autoNext: session.autoNext, hostId: session.hostId, players: this.buildPlayersList(session), spectators: this.buildSpectatorsList(session), allowSpectatorReactions: !!session.allowSpectatorReactions });
      }
    }
  }

  @SubscribeMessage('toggle_auto_next')
  handleToggleAutoNext(@MessageBody() data: { code: string; enabled: boolean }, @ConnectedSocket() socket: Socket) {
    const { code, enabled } = data;
    const session = this.sessions.get(code);
    if (!session) { this.emitReject(socket, 'toggle_auto_next_rejected', 'unknown_session'); return; }
    if (session.hostId !== socket.id) {
      this.emitReject(socket, 'toggle_auto_next_rejected', 'not_host');
      return;
    }
    session.autoNext = !!enabled;
    this.server.to(code).emit('auto_next_toggled', { enabled: session.autoNext });
    for (const pid of session.players.keys()) {
      const sock = this.server.sockets.sockets.get(pid);
      if (sock) {
  sock.emit('session_state', { status: session.phase || 'lobby', questionIndex: session.questionIndex, remainingMs: 0, totalQuestions: session.questions.length, isHost: session.hostId === pid, autoNext: session.autoNext, hostId: session.hostId, players: this.buildPlayersList(session), spectators: this.buildSpectatorsList(session), allowSpectatorReactions: !!session.allowSpectatorReactions });
      }
    }
  }

  private broadcastLeaderboard(code: string) {
    const session = this.sessions.get(code);
    if (!session) return;
    const entries = this.buildLeaderboardEntries(session);
    this.server.to(code).emit('leaderboard_update', { entries });
  }

  private buildLeaderboardEntries(session: SessionState) {
    return Array.from(session.players.values())
      .filter(p => p.id !== session.hostId) // Exclure l'hôte du leaderboard
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({ playerId: p.id, nickname: p.nickname, score: p.score, rank: idx + 1 }));
  }

  private buildPlayersList(session: SessionState) {
    return Array.from(session.players.entries())
      .filter(([id]) => id !== session.hostId) // Exclure l'hôte de la liste des joueurs
      .map(([id, p]) => ({ id, nickname: p.nickname }));
  }

  private buildSpectatorsList(session: SessionState) {
    if (!session.viewers || session.viewers.size === 0) return [] as { id: string; nickname: string }[];
    const out: { id: string; nickname: string }[] = [];
    for (const vid of session.viewers.values()) {
      const sock = this.server.sockets.sockets.get(vid);
      const nn = (sock?.data as any)?.nickname || 'Spectator-' + vid.slice(0,4);
      out.push({ id: vid, nickname: nn });
    }
    return out;
  }

  private clearTimer(session: SessionState) {
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = undefined;
    }
  }

  private findSessionForSocket(socketId: string): string | undefined {
    for (const [code, session] of this.sessions.entries()) {
      if (session.players.has(socketId)) return code;
    }
    return undefined;
  }

  private async createOrGetSession(code: string, quizId: string) {
    // Essayer create direct (chemin optimiste)
    try {
      await this.prisma.gameSession.create({ data: { code, quizId } });
      return;
    } catch (e: unknown) {
      // Conflit unique -> recuperer
      const prismaError = e as { code?: string };
      if (prismaError?.code === 'P2002') {
        return; // deja existante
      }
      // Toute autre erreur : on re-tente findUnique pour log utile
      const existing = await this.prisma.gameSession.findUnique({ where: { code } });
      if (existing) return;
      this.logger.error(`createOrGetSession failed for code ${code}: ${e}`);
    }
  }

  // Exposés à d'autres couches (HTTP) pour initialiser une session et lire son état
  public async ensureSession(code: string | undefined, quizId: string): Promise<{ code: string; created: boolean }>
  {
    let c = code || randomCode();
    if (!this.sessions.has(c)) {
      // si collision code généré, on régénère
      while (this.sessions.has(c) || await this.prisma.gameSession.findUnique({ where: { code: c } })) {
        c = randomCode();
      }
      // Charger questions avec tous les champs nécessaires
      const questions = await this.prisma.question.findMany({ 
        where: { quizId }, 
        orderBy: { order: 'asc' }, 
        include: { options: { select: { id: true, isCorrect: true, orderIndex: true } } } 
      });
      await this.createOrGetSession(c, quizId);
      // Lire flag persistant
      let allowSpectator = true;
      try {
        const db = await this.prisma.gameSession.findUnique({ where: { code: c } });
        if (db && typeof (db as any).allowSpectatorReactions === 'boolean') {
          allowSpectator = (db as any).allowSpectatorReactions as boolean;
        }
      } catch {}
      this.sessions.set(c, {
        id: c,
        players: new Map(),
        detached: new Map(),
        questionIndex: 0,
        questions: questions.map((q: any) => ({
          id: q.id,
          type: (q.type || 'multiple_choice') as QuestionType,
          timeLimitMs: q.timeLimitMs,
          options: q.options.map((o: any) => ({ 
            id: o.id, 
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex ?? null 
          })),
          correctAnswers: q.correctAnswers ? JSON.parse(q.correctAnswers) : undefined,
          caseSensitive: q.caseSensitive ?? false,
        })),
        answers: new Map(),
        phase: 'lobby',
        autoNext: false,
        allowSpectatorReactions: allowSpectator,
        createdAt: this.clock.now(),
      });
      this.metrics.inc('sessions.active');
      this.metrics.inc('session.create');
      return { code: c, created: true };
    }
    return { code: c, created: false };
  }

  public getPublicState(code: string) {
    const s = this.sessions.get(code);
    if (!s) return undefined;
    const remainingMs = s.phase === 'question' && s.activeQuestionStartedAt
      ? Math.max(0, (s.questions[s.questionIndex]?.timeLimitMs || 0) - (this.clock.now() - s.activeQuestionStartedAt))
      : 0;
    return {
      code,
      status: s.phase || 'lobby',
      questionIndex: s.questionIndex,
      totalQuestions: s.questions.length,
      playersCount: s.players.size,
      autoNext: !!s.autoNext,
      remainingMs,
    };
  }

  /** Ferme une session (déconnecte tous les joueurs et nettoie) */
  public closeSession(code: string) {
    const session = this.sessions.get(code);
    if (!session) return;

    // Notifier tous les joueurs et spectateurs
    this.server.to(code).emit('session_closed', { reason: 'deleted' });
    
    // Déconnecter tous les sockets de la room
    this.server.in(code).socketsLeave(code);
    
    // Nettoyer les timers et la session
    this.clearTimer(session);
    if (session.detached) session.detached.clear();
    this.sessions.delete(code);
    
    this.logger.log(`Session ${code} closed and deleted`);
  }

  // Donne l'identifiant de la question courante dans une session (ou undefined)
  public getCurrentQuestionId(code: string): string | undefined {
    const s = this.sessions.get(code);
    if (!s) return undefined;
    return s.questions[s.questionIndex]?.id;
  }

  /** Libère toutes les sessions et timers (utilisé pour tests / shutdown) */
  public dispose() {
    for (const session of this.sessions.values()) {
      this.clearTimer(session);
      if (session.detached) session.detached.clear();
    }
    this.sessions.clear();
    this.limiter.clear();
  }

  private cleanupDetached(s: SessionState) {
    if (!s.detached || s.detached.size === 0) return;
    const now = this.clock.now();
    for (const [uid, snap] of [...s.detached.entries()]) {
      if (snap.expiresAt <= now) s.detached.delete(uid);
    }
  }

  // ========================================
  // Twitch Bot Integration
  // ========================================

  /**
   * Handler pour les réponses venant du chat Twitch
   */
  private async handleTwitchAnswer(sessionCode: string, playerId: string, optionId: string) {
    const session = this.sessions.get(sessionCode);
    if (!session || session.phase !== 'question') return;

    const question = session.questions[session.questionIndex];
    if (!question) return;

    // Vérifier si le joueur a déjà répondu
    const answered = session.answers.get(question.id);
    if (answered?.has(playerId)) return;

    // Marquer comme répondu
    if (!answered) {
      session.answers.set(question.id, new Set([playerId]));
    } else {
      answered.add(playerId);
    }

    // Calculer le temps de réponse
    const elapsed = session.activeQuestionStartedAt
      ? this.clock.now() - session.activeQuestionStartedAt
      : question.timeLimitMs;

    // Vérifier si la réponse est correcte
    const opt = question.options.find(o => o.id === optionId);
    const isCorrect = opt?.isCorrect ?? false;

    // Calculer les points
    const points = this.scoring.computeScore({
      correct: isCorrect,
      timeMs: elapsed,
      limitMs: question.timeLimitMs,
      streak: 0,
    });

    // Récupérer le joueur depuis la DB
    const dbPlayer = await this.prisma.gamePlayer.findUnique({
      where: { id: playerId },
    });

    if (!dbPlayer) return;

    // Mettre à jour le score
    if (points > 0) {
      await this.prisma.gamePlayer.update({
        where: { id: playerId },
        data: { score: { increment: points } },
      });
    }

    // Enregistrer la réponse
    const answerKey = `${playerId}:${question.id}`;
    await this.prisma.playerAnswer.upsert({
      where: { uniqueKey: answerKey },
      create: {
        player: { connect: { id: playerId } },
        question: { connect: { id: question.id } },
        option: { connect: { id: optionId } },
        correct: isCorrect,
        timeMs: elapsed,
        uniqueKey: answerKey,
      },
      update: {},
    });

    // Émettre le résultat à la room
    this.server.to(sessionCode).emit('answer_result', {
      playerId,
      nickname: dbPlayer.nickname,
      correct: isCorrect,
      points,
    });

    this.logger.debug(`Twitch answer from ${dbPlayer.nickname}: ${isCorrect ? 'correct' : 'incorrect'} (+${points})`);
  }

  /**
   * Handler pour les réponses texte venant du chat Twitch
   */
  private async handleTwitchTextAnswer(sessionCode: string, playerId: string, textAnswer: string) {
    const session = this.sessions.get(sessionCode);
    if (!session || session.phase !== 'question') return;

    const question = session.questions[session.questionIndex];
    if (!question || question.type !== 'text_input') return;

    // Vérifier si le joueur a déjà répondu
    const answered = session.answers.get(question.id);
    if (answered?.has(playerId)) return;

    // Marquer comme répondu
    if (!answered) {
      session.answers.set(question.id, new Set([playerId]));
    } else {
      answered.add(playerId);
    }

    // Calculer le temps de réponse
    const elapsed = session.activeQuestionStartedAt
      ? this.clock.now() - session.activeQuestionStartedAt
      : question.timeLimitMs;

    // Vérifier la réponse
    const correctAnswers = question.correctAnswers || [];
    const caseSensitive = question.caseSensitive ?? false;
    
    const normalizedAnswer = caseSensitive ? textAnswer.trim() : textAnswer.trim().toLowerCase();
    const isCorrect = correctAnswers.some(ca => {
      const normalizedCorrect = caseSensitive ? ca.trim() : ca.trim().toLowerCase();
      return normalizedAnswer === normalizedCorrect;
    });

    // Calculer les points
    const points = this.scoring.computeScore({
      correct: isCorrect,
      timeMs: elapsed,
      limitMs: question.timeLimitMs,
      streak: 0,
    });

    // Récupérer le joueur
    const dbPlayer = await this.prisma.gamePlayer.findUnique({
      where: { id: playerId },
    });

    if (!dbPlayer) return;

    // Mettre à jour le score
    if (points > 0) {
      await this.prisma.gamePlayer.update({
        where: { id: playerId },
        data: { score: { increment: points } },
      });
    }

    // Enregistrer la réponse
    const answerKey = `${playerId}:${question.id}`;
    await this.prisma.playerAnswer.upsert({
      where: { uniqueKey: answerKey },
      create: {
        player: { connect: { id: playerId } },
        question: { connect: { id: question.id } },
        textAnswer,
        correct: isCorrect,
        timeMs: elapsed,
        uniqueKey: answerKey,
      },
      update: {},
    });

    // Émettre le résultat
    this.server.to(sessionCode).emit('answer_result', {
      playerId,
      nickname: dbPlayer.nickname,
      correct: isCorrect,
      points,
    });
  }

  /**
   * Notifier le bot Twitch d'une nouvelle question
   */
  public notifyTwitchQuestion(
    sessionCode: string,
    questionIndex: number,
    prompt: string,
    options: Array<{ id: string; label: string }>,
    timeLimitMs: number,
  ) {
    if (this.twitchBotService?.isSessionActive(sessionCode)) {
      this.twitchBotService.sendQuestion(sessionCode, questionIndex, prompt, options, timeLimitMs);
    }
  }

  /**
   * Notifier le bot Twitch de la fin d'une question
   */
  public notifyTwitchQuestionEnd(
    sessionCode: string,
    correctOptionLabel: string,
    topAnswers: Array<{ nickname: string; points: number }>,
  ) {
    if (this.twitchBotService?.isSessionActive(sessionCode)) {
      this.twitchBotService.endQuestion(sessionCode, correctOptionLabel, topAnswers);
    }
  }

  /**
   * Notifier le bot Twitch du classement final
   */
  public notifyTwitchFinalLeaderboard(
    sessionCode: string,
    leaderboard: Array<{ nickname: string; score: number }>,
  ) {
    if (this.twitchBotService?.isSessionActive(sessionCode)) {
      this.twitchBotService.sendFinalLeaderboard(sessionCode, leaderboard);
    }
  }
}
