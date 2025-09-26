import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ScoringService } from '../scoring/scoring.service';
import { PrismaService } from '../database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RateLimiter } from './rate-limiter';
import { ClockService } from './clock.service';
import { MetricsService } from './metrics.service';

interface SessionPlayer {
  id: string; // socket.id courant
  nickname: string;
  score: number;
  streak: number;
  userId?: string; // stable si utilisateur authentifié pour reconnexion
}

interface SessionQuestion {
  id: string;
  timeLimitMs: number;
  options: { id: string; isCorrect: boolean }[];
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
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private sessions = new Map<string, SessionState>();
  private logger = new Logger('RealtimeGateway');
  private limiter = new RateLimiter({ windowMs: 1000, max: 5 });
  private reactionRule = { windowMs: 2000, max: 6 };
  private answerRule = { windowMs: 2000, max: 3 };
  private answerLatencyBuckets = [0.1,0.25,0.5,0.75,1,2,3,5]; // secondes
  private questionDurationBuckets = [0.25,0.5,0.75,1,1.5,2,3,5,10];
  private sessionDurationBuckets = [1,2,5,10,20,30,60,120,300];
  private getRevealDelayMs() { return parseInt(process.env.REVEAL_DELAY_MS || '2000', 10); }
  private getDetachedTtlMs() { return parseInt(process.env.DETACHED_TTL_MS || '600000', 10); }

  private emitReject(socket: Socket, event: string, code: string, message?: string, details?: any) {
    const payload: any = { code };
    if (message) payload.message = message;
    if (details) payload.details = details;
    socket.emit(event, payload);
  }

  constructor(
    private scoring: ScoringService,
    private prisma: PrismaService,
    private jwt: JwtService,
    private clock: ClockService,
    private metrics: MetricsService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token = (socket.handshake.auth?.token || (socket.handshake.query?.token as string) || '').replace('Bearer ', '');
      if (!token) throw new UnauthorizedException('missing_token');
      const payload = await this.jwt.verifyAsync(token).catch(() => { throw new UnauthorizedException('invalid_token'); });
      (socket.data as any).userId = payload.sub;
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
  async handleJoin(@MessageBody() data: { code?: string; quizId: string; nickname?: string; spectator?: boolean }, @ConnectedSocket() socket: Socket) {
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
        questions: questions.map(q => ({ id: q.id, timeLimitMs: q.timeLimitMs, options: q.options })),
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
    const isSpectator = !!data.spectator;
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
      // Clear detached à la fin
      if (session.detached) session.detached.clear();
      this.server.to(code).emit('session_finished', { final: this.buildLeaderboardEntries(session) });
      return;
    }
    session.questionIndex += 1;
    session.activeQuestionStartedAt = undefined;
    session.phase = 'lobby';
  this.server.to(code).emit('session_state', { status: 'lobby', questionIndex: session.questionIndex, remainingMs: 0, totalQuestions: session.questions.length, autoNext: session.autoNext, hostId: session.hostId, players: this.buildPlayersList(session), spectators: this.buildSpectatorsList(session), allowSpectatorReactions: !!session.allowSpectatorReactions });
    if (session.autoNext) {
      session.timer = this.clock.setTimeout(() => {
        if (session.phase === 'lobby') {
          this.metrics.inc('question.auto_start');
            this.startQuestionInternal(code, session);
        }
      }, 150); // petit délai pour permettre aux clients d'afficher lobby
    }
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
    @MessageBody() data: { questionId: string; optionId: string; clientTs: number; code?: string },
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
    const option = currentQuestion.options.find(o => o.id === data.optionId);
    if (!option) {
      socket.emit('answer_ack', { questionId: data.questionId, accepted: false, reason: 'unknown_option' });
      return;
    }
  const now = this.clock.now();
    const startedAt = session.activeQuestionStartedAt ?? now; // fallback si pas initialisé
    const elapsed = now - startedAt;
    const correct = option.isCorrect;
    if (correct) player.streak += 1; else player.streak = 0;
    const scoreDelta = this.scoring.computeScore({
      correct,
      timeMs: elapsed,
      limitMs: currentQuestion.timeLimitMs || 5000,
      streak: player.streak,
    });
    player.score += scoreDelta;
    socket.emit('answer_ack', { questionId: data.questionId, accepted: true, correct, scoreDelta });
  this.broadcastLeaderboard(code);
  this.metrics.inc('answer.received');
  this.metrics.observe('answer.latency_seconds', elapsed/1000, this.answerLatencyBuckets);
    // Émettre un session_state de progression (score side-effect côté clients potentiels) sans remainingMs recalcul si lobby/reveal
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
              update: { optionId: option.id, correct, timeMs: elapsed },
              create: { playerId: gamePlayer.id, questionId: currentQuestion.id, optionId: option.id, correct, timeMs: elapsed, uniqueKey: paUnique },
            });
            await (this.prisma.gamePlayer as any).update({ where: { id: gamePlayer.id }, data: { score: player.score } });
        }
      }
    } catch (e) {
      this.logger.warn(`Persist answer failed: ${e}`);
    }
    // Auto reveal if everyone answered or all players responded
    const q = session.questions[session.questionIndex];
    const answeredCount = session.answers.get(q.id)?.size || 0;
    if (answeredCount >= session.players.size) {
      this.metrics.inc('question.autoreveal');
      this.forceReveal(code);
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
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({ playerId: p.id, nickname: p.nickname, score: p.score, rank: idx + 1 }));
  }

  private buildPlayersList(session: SessionState) {
    return Array.from(session.players.entries()).map(([id, p]) => ({ id, nickname: p.nickname }));
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
    } catch (e: any) {
      // Conflit unique -> récupérer
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return; // déjà existante
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
      // Charger questions minimalistes
      const questions = await this.prisma.question.findMany({ where: { quizId }, orderBy: { order: 'asc' }, include: { options: { select: { id: true, isCorrect: true } } } });
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
        questions: questions.map(q => ({ id: q.id, timeLimitMs: q.timeLimitMs, options: q.options })),
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

  // Support hook Nest (si jamais enregistré via OnModuleDestroy dans le futur)
  async onModuleDestroy() {
    this.dispose();
  }

  private cleanupDetached(s: SessionState) {
    if (!s.detached || s.detached.size === 0) return;
    const now = this.clock.now();
    for (const [uid, snap] of [...s.detached.entries()]) {
      if (snap.expiresAt <= now) s.detached.delete(uid);
    }
  }
}
