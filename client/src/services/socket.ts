import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  QuizStartedEvent,
  NextQuestionEvent,
  AnswerSubmittedEvent,
  LeaderboardUpdatedEvent,
  QuizEndedEvent,
  SessionJoinedEvent,
  ChatMessage,
  Participant
} from '../types';

export interface SocketEvents {
  // Session events
  'session-joined': (data: SessionJoinedEvent) => void;
  'participant-joined': (data: { participant: Participant }) => void;
  'participant-left': (data: { participantId: number }) => void;
  'participants-updated': (data: { participants: Participant[] }) => void;
  
  // Quiz events
  'quiz-started': (data: QuizStartedEvent) => void;
  'next-question': (data: NextQuestionEvent) => void;
  'answer-submitted': (data: AnswerSubmittedEvent) => void;
  'leaderboard-updated': (data: LeaderboardUpdatedEvent) => void;
  'quiz-paused': () => void;
  'quiz-resumed': () => void;
  'quiz-ended': (data: QuizEndedEvent) => void;
  
  // Chat events
  'chat-message': (data: ChatMessage) => void;
  
  // System events
  'error': (data: { message: string }) => void;
  'pong': (data: { timestamp: number }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Function[]> = new Map();

  connect(token?: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    const auth: any = {};
    if (token) {
      auth.token = token;
    }

    this.socket = io('/', {
      auth,
      transports: ['websocket', 'polling'],
      timeout: 20000,
      retries: 3
    });

    this.setupEventHandlers();
    return this.socket;
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('🔌 Connexion WebSocket établie');
      this.reconnectAttempts = 0;
      toast.success('Connexion temps réel établie');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Connexion WebSocket fermée:', reason);
      
      if (reason === 'io server disconnect') {
        // Déconnexion forcée par le serveur
        toast.error('Déconnecté par le serveur');
      } else {
        // Reconnexion automatique
        toast.error('Connexion perdue, tentative de reconnexion...');
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Erreur de connexion WebSocket:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        toast.error('Impossible de se connecter au serveur');
      }
    });

    this.socket.on('error', (data: { message: string }) => {
      console.error('❌ Erreur WebSocket:', data.message);
      toast.error(data.message);
    });

    // Restaurer les listeners existants
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach(callback => {
        this.socket?.on(event, callback);
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
      console.log('🔌 Connexion WebSocket fermée');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Event listeners avec type safety
  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off<K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]): void {
    if (callback) {
      const callbacks = this.listeners.get(event) || [];
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
      
      if (this.socket) {
        this.socket.off(event, callback);
      }
    } else {
      this.listeners.delete(event);
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  // Session methods
  joinSession(sessionCode: string, nickname?: string): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('🎮 Rejoindre la session:', sessionCode);
    this.socket.emit('join-session', { sessionCode, nickname });
  }

  leaveSession(): void {
    if (!this.socket) return;
    
    console.log('🎮 Quitter la session');
    this.socket.emit('leave-session');
  }

  // Quiz control methods (host only)
  startQuiz(sessionId: number): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('🚀 Démarrer le quiz');
    this.socket.emit('start-quiz', { sessionId });
  }

  nextQuestion(sessionId: number): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('➡️ Question suivante');
    this.socket.emit('next-question', { sessionId });
  }

  pauseQuiz(sessionId: number): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('⏸️ Pause du quiz');
    this.socket.emit('pause-quiz', { sessionId });
  }

  resumeQuiz(sessionId: number): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('▶️ Reprise du quiz');
    this.socket.emit('resume-quiz', { sessionId });
  }

  endQuiz(sessionId: number): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('🏁 Fin du quiz');
    this.socket.emit('end-quiz', { sessionId });
  }

  // Participant methods
  submitAnswer(questionId: number, answer: string): void {
    if (!this.socket) {
      throw new Error('Socket non connecté');
    }
    
    console.log('📝 Soumission de réponse:', { questionId, answer });
    this.socket.emit('submit-answer', { questionId, answer });
  }

  // Chat methods
  sendChatMessage(message: string): void {
    if (!this.socket || !message.trim()) return;
    
    console.log('💬 Message chat:', message);
    this.socket.emit('chat-message', { message: message.trim() });
  }

  // Utility methods
  ping(): void {
    if (!this.socket) return;
    
    this.socket.emit('ping');
  }

  // Cleanup method for React components
  removeAllListeners(): void {
    this.listeners.clear();
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}

export const socketService = new SocketService();
export default socketService;