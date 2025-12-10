import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as tmi from 'tmi.js';

export interface TwitchBotConfig {
  username: string;
  oauth: string;
  channels: string[];
}

interface ChatPlayer {
  twitchUsername: string;
  sessionCode: string;
  playerId: string;
  joinedAt: Date;
}

interface ActiveSession {
  code: string;
  channel: string;
  quizId: string;
  hostUserId: string;
  currentQuestionIndex: number;
  chatPlayers: Map<string, ChatPlayer>;
  questionOptions?: Map<number, string>; // number -> optionId mapping
  acceptingAnswers: boolean;
}

@Injectable()
export class TwitchBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchBotService.name);
  private client: tmi.Client | null = null;
  private activeSessions: Map<string, ActiveSession> = new Map(); // sessionCode -> session
  private channelToSession: Map<string, string> = new Map(); // channel -> sessionCode

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // Le bot ne démarre que si les variables d'environnement sont configurées
    const username = process.env.TWITCH_BOT_USERNAME;
    const oauth = process.env.TWITCH_BOT_OAUTH;

    if (!username || !oauth) {
      this.logger.warn('Twitch bot credentials not configured. Bot disabled.');
      return;
    }

    await this.initialize({ username, oauth, channels: [] });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  private async initialize(config: TwitchBotConfig) {
    this.client = new tmi.Client({
      options: { debug: process.env.NODE_ENV === 'development' },
      identity: {
        username: config.username,
        password: config.oauth,
      },
      channels: config.channels,
    });

    this.client.on('message', this.handleMessage.bind(this));
    this.client.on('connected', () => {
      this.logger.log('Twitch bot connected');
    });
    this.client.on('disconnected', (reason) => {
      this.logger.warn(`Twitch bot disconnected: ${reason}`);
    });

    try {
      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to connect Twitch bot:', error);
    }
  }

  /**
   * Rejoindre un canal Twitch pour une session
   */
  async joinChannel(channel: string, sessionCode: string, quizId: string, hostUserId: string): Promise<boolean> {
    if (!this.client) {
      this.logger.warn('Twitch bot not initialized');
      return false;
    }

    const normalizedChannel = channel.toLowerCase().replace('#', '');

    try {
      await this.client.join(normalizedChannel);
      
      const session: ActiveSession = {
        code: sessionCode,
        channel: normalizedChannel,
        quizId,
        hostUserId,
        currentQuestionIndex: -1,
        chatPlayers: new Map(),
        acceptingAnswers: false,
      };

      this.activeSessions.set(sessionCode, session);
      this.channelToSession.set(normalizedChannel, sessionCode);

      this.logger.log(`Joined channel #${normalizedChannel} for session ${sessionCode}`);
      
      // Annoncer dans le chat
      await this.client.say(normalizedChannel, 
        `🎮 SourceKuizz est actif ! Tapez !join pour participer au quiz. Code: ${sessionCode}`
      );

      return true;
    } catch (error) {
      this.logger.error(`Failed to join channel #${normalizedChannel}:`, error);
      return false;
    }
  }

  /**
   * Quitter un canal
   */
  async leaveChannel(sessionCode: string): Promise<void> {
    const session = this.activeSessions.get(sessionCode);
    if (!session || !this.client) return;

    try {
      await this.client.say(session.channel, '🎮 Le quiz est terminé ! Merci d\'avoir joué !');
      await this.client.part(session.channel);
    } catch (error) {
      this.logger.error(`Error leaving channel:`, error);
    }

    this.channelToSession.delete(session.channel);
    this.activeSessions.delete(sessionCode);
  }

  /**
   * Envoyer une nouvelle question dans le chat
   */
  async sendQuestion(
    sessionCode: string,
    questionIndex: number,
    prompt: string,
    options: Array<{ id: string; label: string }>,
    timeLimitMs: number,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionCode);
    if (!session || !this.client) return;

    session.currentQuestionIndex = questionIndex;
    session.acceptingAnswers = true;
    session.questionOptions = new Map();

    // Mapper les numéros aux options
    options.forEach((opt, index) => {
      session.questionOptions!.set(index + 1, opt.id);
    });

    // Construire le message de question
    const optionsText = options
      .map((opt, i) => `${i + 1}️⃣ ${opt.label}`)
      .join(' | ');

    try {
      await this.client.say(
        session.channel,
        `❓ Q${questionIndex + 1}: ${prompt}`
      );
      await this.client.say(
        session.channel,
        `${optionsText} ⏱️ ${Math.round(timeLimitMs / 1000)}s - Répondez avec !1, !2, !3 ou !4`
      );
    } catch (error) {
      this.logger.error('Error sending question to chat:', error);
    }
  }

  /**
   * Fin d'une question - annoncer la bonne réponse
   */
  async endQuestion(
    sessionCode: string,
    correctOptionLabel: string,
    topAnswers: Array<{ nickname: string; points: number }>,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionCode);
    if (!session || !this.client) return;

    session.acceptingAnswers = false;

    try {
      await this.client.say(
        session.channel,
        `✅ Bonne réponse: ${correctOptionLabel}`
      );

      if (topAnswers.length > 0) {
        const topText = topAnswers
          .slice(0, 3)
          .map((a, i) => `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} ${a.nickname} (+${a.points})`)
          .join(' ');
        await this.client.say(session.channel, topText);
      }
    } catch (error) {
      this.logger.error('Error sending results to chat:', error);
    }
  }

  /**
   * Annoncer le leaderboard final
   */
  async sendFinalLeaderboard(
    sessionCode: string,
    leaderboard: Array<{ nickname: string; score: number }>,
  ): Promise<void> {
    const session = this.activeSessions.get(sessionCode);
    if (!session || !this.client) return;

    try {
      await this.client.say(session.channel, '🏆 CLASSEMENT FINAL 🏆');
      
      const top5 = leaderboard.slice(0, 5);
      for (let i = 0; i < top5.length; i++) {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
        await this.client.say(
          session.channel,
          `${medal} ${top5[i].nickname} - ${top5[i].score} points`
        );
      }
    } catch (error) {
      this.logger.error('Error sending leaderboard:', error);
    }
  }

  /**
   * Traiter les messages du chat
   */
  private async handleMessage(
    channel: string,
    tags: tmi.ChatUserstate,
    message: string,
    self: boolean,
  ) {
    if (self) return; // Ignorer nos propres messages

    const normalizedChannel = channel.replace('#', '').toLowerCase();
    const sessionCode = this.channelToSession.get(normalizedChannel);
    if (!sessionCode) return;

    const session = this.activeSessions.get(sessionCode);
    if (!session) return;

    const username = tags.username?.toLowerCase() || '';
    const displayName = tags['display-name'] || username;
    const trimmedMessage = message.trim().toLowerCase();

    // Commande !join
    if (trimmedMessage === '!join' || trimmedMessage === '!rejoindre') {
      await this.handleJoinCommand(session, username, displayName);
      return;
    }

    // Commande !leave
    if (trimmedMessage === '!leave' || trimmedMessage === '!quitter') {
      await this.handleLeaveCommand(session, username);
      return;
    }

    // Commande !score
    if (trimmedMessage === '!score' || trimmedMessage === '!points') {
      await this.handleScoreCommand(session, username, displayName);
      return;
    }

    // Réponses (!1, !2, !3, !4, !a, !b, !c, !d)
    const answerMatch = trimmedMessage.match(/^!([1-4]|[a-d])$/);
    if (answerMatch && session.acceptingAnswers) {
      let optionNumber: number;
      const answer = answerMatch[1];
      
      if (['a', 'b', 'c', 'd'].includes(answer)) {
        optionNumber = answer.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
      } else {
        optionNumber = parseInt(answer);
      }

      await this.handleAnswerCommand(session, username, displayName, optionNumber);
      return;
    }

    // Réponse texte libre (si la question l'accepte)
    if (trimmedMessage.startsWith('!r ') || trimmedMessage.startsWith('!reponse ')) {
      const textAnswer = message.replace(/^!(r|reponse)\s+/i, '').trim();
      await this.handleTextAnswer(session, username, displayName, textAnswer);
      return;
    }
  }

  /**
   * Gérer la commande !join
   */
  private async handleJoinCommand(
    session: ActiveSession,
    username: string,
    displayName: string,
  ) {
    if (!this.client) return;

    // Vérifier si déjà inscrit
    if (session.chatPlayers.has(username)) {
      return; // Silencieusement ignorer les doublons
    }

    try {
      // Créer le joueur dans la DB
      const uniqueKey = `${session.code}:twitch_${username}`;
      
      const player = await this.prisma.gamePlayer.upsert({
        where: { uniqueKey },
        create: {
          session: { connect: { code: session.code } },
          nickname: `🎮${displayName}`,
          score: 0,
          uniqueKey,
        },
        update: {},
      });

      session.chatPlayers.set(username, {
        twitchUsername: username,
        sessionCode: session.code,
        playerId: player.id,
        joinedAt: new Date(),
      });

      this.logger.log(`Twitch user ${displayName} joined session ${session.code}`);
      
      // Confirmation discrète (pas de spam)
      const playerCount = session.chatPlayers.size;
      if (playerCount % 5 === 0 || playerCount <= 3) {
        await this.client.say(
          session.channel,
          `✅ ${displayName} a rejoint ! (${playerCount} joueurs Twitch)`
        );
      }
    } catch (error) {
      this.logger.error(`Error joining player ${username}:`, error);
    }
  }

  /**
   * Gérer la commande !leave
   */
  private async handleLeaveCommand(session: ActiveSession, username: string) {
    session.chatPlayers.delete(username);
  }

  /**
   * Gérer la commande !score
   */
  private async handleScoreCommand(
    session: ActiveSession,
    username: string,
    displayName: string,
  ) {
    if (!this.client) return;

    const player = session.chatPlayers.get(username);
    if (!player) {
      await this.client.say(
        session.channel,
        `@${displayName} Tu n'as pas encore rejoint ! Tape !join`
      );
      return;
    }

    try {
      const dbPlayer = await this.prisma.gamePlayer.findUnique({
        where: { id: player.playerId },
      });

      if (dbPlayer) {
        await this.client.say(
          session.channel,
          `@${displayName} Tu as ${dbPlayer.score} points !`
        );
      }
    } catch (error) {
      this.logger.error('Error getting score:', error);
    }
  }

  /**
   * Gérer une réponse numérique
   */
  private async handleAnswerCommand(
    session: ActiveSession,
    username: string,
    displayName: string,
    optionNumber: number,
  ) {
    const player = session.chatPlayers.get(username);
    if (!player) return; // Joueur non inscrit

    const optionId = session.questionOptions?.get(optionNumber);
    if (!optionId) return; // Option invalide

    // Émettre la réponse via le système existant
    // On va utiliser un événement interne
    this.emitAnswer(session.code, player.playerId, optionId, username);
  }

  /**
   * Gérer une réponse texte
   */
  private async handleTextAnswer(
    session: ActiveSession,
    username: string,
    displayName: string,
    textAnswer: string,
  ) {
    const player = session.chatPlayers.get(username);
    if (!player) return;

    this.emitTextAnswer(session.code, player.playerId, textAnswer, username);
  }

  /**
   * Émettre une réponse (sera interceptée par le RealtimeGateway)
   */
  private emitAnswer(
    sessionCode: string,
    playerId: string,
    optionId: string,
    twitchUsername: string,
  ) {
    // Cette méthode sera remplacée par une injection du RealtimeGateway
    // ou un EventEmitter
    this.logger.debug(`Answer from ${twitchUsername}: ${optionId}`);
  }

  private emitTextAnswer(
    sessionCode: string,
    playerId: string,
    textAnswer: string,
    twitchUsername: string,
  ) {
    this.logger.debug(`Text answer from ${twitchUsername}: ${textAnswer}`);
  }

  /**
   * Callback pour injecter le handler de réponses
   */
  onAnswer: ((sessionCode: string, playerId: string, optionId: string) => void) | null = null;
  onTextAnswer: ((sessionCode: string, playerId: string, text: string) => void) | null = null;

  setAnswerHandler(handler: (sessionCode: string, playerId: string, optionId: string) => void) {
    this.onAnswer = handler;
  }

  setTextAnswerHandler(handler: (sessionCode: string, playerId: string, text: string) => void) {
    this.onTextAnswer = handler;
  }

  /**
   * Obtenir le nombre de joueurs Twitch dans une session
   */
  getChatPlayerCount(sessionCode: string): number {
    const session = this.activeSessions.get(sessionCode);
    return session?.chatPlayers.size || 0;
  }

  /**
   * Vérifier si une session est active
   */
  isSessionActive(sessionCode: string): boolean {
    return this.activeSessions.has(sessionCode);
  }
}
