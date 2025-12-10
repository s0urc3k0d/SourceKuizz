import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents, WSJoinSession, WSSubmitAnswer, WSToggleAutoNext, WSReaction, WSTransferHost, WSStartQuestion, WSForceReveal, WSAdvanceNext } from '@sourcekuizz/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Message en attente pendant une déconnexion */
interface QueuedMessage {
  event: keyof ClientToServerEvents;
  payload: unknown;
  timestamp: number;
}

/** État de connexion */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'offline';

export interface CreateSocketOptions {
  token?: string;
  /** Activer la reconnexion automatique (défaut: true) */
  autoReconnect?: boolean;
  /** Délai max de reconnexion en ms (défaut: 10000) */
  reconnectionDelayMax?: number;
  /** Nombre max de tentatives (défaut: 10) */
  reconnectionAttempts?: number;
  /** Callback appelé à chaque tentative de reconnexion */
  onReconnectAttempt?: (attempt: number) => void;
  /** Callback appelé après reconnexion réussie */
  onReconnect?: () => void;
  /** Callback appelé si la reconnexion échoue définitivement */
  onReconnectFailed?: () => void;
  /** Callback appelé quand le statut de connexion change */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Callback appelé quand on passe en mode hors-ligne */
  onOffline?: () => void;
  /** Callback appelé quand on repasse en ligne */
  onOnline?: () => void;
}

/** Gestionnaire de socket avec mode hors-ligne */
export class SocketManager {
  private socket: TypedSocket | null = null;
  private messageQueue: QueuedMessage[] = [];
  private status: ConnectionStatus = 'disconnected';
  private options: CreateSocketOptions;
  private baseUrl: string;
  private sessionCode?: string;
  private nickname?: string;
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private offlineHandler?: () => void;
  private onlineHandler?: () => void;

  constructor(baseUrl: string, options: CreateSocketOptions = {}) {
    this.baseUrl = baseUrl;
    this.options = {
      autoReconnect: true,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 10,
      ...options,
    };

    // Écouter les événements réseau
    if (typeof window !== 'undefined') {
      this.offlineHandler = () => this.handleOffline();
      this.onlineHandler = () => this.handleOnline();
      window.addEventListener('offline', this.offlineHandler);
      window.addEventListener('online', this.onlineHandler);
    }
  }

  /** Crée et connecte le socket */
  connect(): TypedSocket {
    if (this.socket?.connected) return this.socket;

    this.setStatus('connecting');

    const {
      token,
      autoReconnect = true,
      reconnectionDelayMax = 10000,
      reconnectionAttempts = 10,
      onReconnectAttempt,
      onReconnect,
      onReconnectFailed,
    } = this.options;

    this.socket = io(this.baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      auth: token ? { token } as any : undefined,
      reconnection: autoReconnect,
      reconnectionDelay: 1000,
      reconnectionDelayMax,
      reconnectionAttempts,
    });

    // Listeners de connexion
    this.socket.on('connect', () => {
      console.log('[WS] Connected');
      this.setStatus('connected');
      // Vider la queue
      this.flushQueue();
    });

    this.socket.on('disconnect', (reason) => {
      console.warn(`[WS] Disconnected: ${reason}`);
      if (reason === 'io server disconnect') {
        this.socket?.connect();
      }
      this.setStatus(this.isOnline ? 'reconnecting' : 'offline');
    });

    // Listeners de reconnexion
    if (autoReconnect) {
      this.socket.io.on('reconnect_attempt', (attempt) => {
        console.log(`[WS] Reconnection attempt ${attempt}/${reconnectionAttempts}`);
        this.setStatus('reconnecting');
        onReconnectAttempt?.(attempt);
      });

      this.socket.io.on('reconnect', () => {
        console.log('[WS] Reconnected successfully');
        this.setStatus('connected');
        onReconnect?.();
        // Re-rejoindre la session si on en avait une
        this.rejoinSessionIfNeeded();
        // Vider la queue
        this.flushQueue();
      });

      this.socket.io.on('reconnect_failed', () => {
        console.error('[WS] Reconnection failed after all attempts');
        this.setStatus('disconnected');
        onReconnectFailed?.();
      });
    }

    return this.socket;
  }

  /** Déconnecte proprement */
  disconnect() {
    if (typeof window !== 'undefined') {
      if (this.offlineHandler) window.removeEventListener('offline', this.offlineHandler);
      if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
    }
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('disconnected');
    this.messageQueue = [];
  }

  /** Retourne le socket actuel */
  getSocket(): TypedSocket | null {
    return this.socket;
  }

  /** Retourne le statut de connexion */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Définit la session courante pour reconnexion auto */
  setCurrentSession(code: string, nickname: string) {
    this.sessionCode = code;
    this.nickname = nickname;
    // Stocker dans localStorage pour persistence
    try {
      localStorage.setItem('ws_session_code', code);
      localStorage.setItem('ws_nickname', nickname);
    } catch {}
  }

  /** Efface la session courante */
  clearCurrentSession() {
    this.sessionCode = undefined;
    this.nickname = undefined;
    try {
      localStorage.removeItem('ws_session_code');
      localStorage.removeItem('ws_nickname');
    } catch {}
  }

  /** Envoie un message (ou l'ajoute à la queue si hors-ligne) */
  emit<K extends keyof ClientToServerEvents>(
    event: K,
    payload: Parameters<ClientToServerEvents[K]>[0]
  ) {
    if (this.socket?.connected) {
      (this.socket.emit as any)(event, payload);
    } else if (this.options.autoReconnect) {
      // Ajouter à la queue
      this.messageQueue.push({
        event,
        payload,
        timestamp: Date.now(),
      });
      console.log(`[WS] Message queued (offline): ${event}`);
    }
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status !== status) {
      this.status = status;
      this.options.onStatusChange?.(status);
    }
  }

  private handleOffline() {
    console.log('[WS] Browser went offline');
    this.isOnline = false;
    this.setStatus('offline');
    this.options.onOffline?.();
  }

  private handleOnline() {
    console.log('[WS] Browser went online');
    this.isOnline = true;
    this.options.onOnline?.();
    // Tenter de reconnecter
    if (this.socket && !this.socket.connected) {
      this.setStatus('reconnecting');
      this.socket.connect();
    }
  }

  private rejoinSessionIfNeeded() {
    // Récupérer depuis localStorage si pas en mémoire
    if (!this.sessionCode || !this.nickname) {
      try {
        this.sessionCode = localStorage.getItem('ws_session_code') || undefined;
        this.nickname = localStorage.getItem('ws_nickname') || undefined;
      } catch {}
    }

    if (this.sessionCode && this.nickname && this.socket) {
      console.log(`[WS] Rejoining session ${this.sessionCode} as ${this.nickname}`);
      this.socket.emit('join_session', {
        code: this.sessionCode,
        nickname: this.nickname,
      });
    }
  }

  private flushQueue() {
    if (!this.socket?.connected || this.messageQueue.length === 0) return;

    const maxAge = 30000; // 30 secondes max pour les messages en queue
    const now = Date.now();

    // Filtrer les messages trop vieux
    const validMessages = this.messageQueue.filter(m => now - m.timestamp < maxAge);
    this.messageQueue = [];

    for (const msg of validMessages) {
      console.log(`[WS] Flushing queued message: ${msg.event}`);
      (this.socket.emit as any)(msg.event, msg.payload);
    }
  }
}

// API legacy pour compatibilité
export function createSocket(baseUrl: string, tokenOrOptions?: string | CreateSocketOptions): TypedSocket {
  const opts: CreateSocketOptions = typeof tokenOrOptions === 'string' 
    ? { token: tokenOrOptions } 
    : (tokenOrOptions ?? {});
  
  const {
    token,
    autoReconnect = true,
    reconnectionDelayMax = 10000,
    reconnectionAttempts = 10,
    onReconnectAttempt,
    onReconnect,
    onReconnectFailed,
  } = opts;

  const s: TypedSocket = io(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    auth: token ? { token } as any : undefined,
    // Options de reconnexion
    reconnection: autoReconnect,
    reconnectionDelay: 1000,
    reconnectionDelayMax,
    reconnectionAttempts,
  });

  // Listeners de reconnexion
  if (autoReconnect) {
    s.io.on('reconnect_attempt', (attempt) => {
      console.log(`[WS] Reconnection attempt ${attempt}/${reconnectionAttempts}`);
      onReconnectAttempt?.(attempt);
    });

    s.io.on('reconnect', () => {
      console.log('[WS] Reconnected successfully');
      onReconnect?.();
    });

    s.io.on('reconnect_failed', () => {
      console.error('[WS] Reconnection failed after all attempts');
      onReconnectFailed?.();
    });

    s.on('disconnect', (reason) => {
      console.warn(`[WS] Disconnected: ${reason}`);
      // Si déconnexion initiée par le serveur, tenter de reconnecter
      if (reason === 'io server disconnect') {
        s.connect();
      }
    });
  }

  return s;
}

export const wsApi = (socket: TypedSocket) => ({
  joinSession(payload: WSJoinSession) { socket.emit('join_session', payload); },
  startQuestion(payload: WSStartQuestion) { socket.emit('start_question', payload); },
  toggleAutoNext(payload: WSToggleAutoNext) { socket.emit('toggle_auto_next', payload); },
  submitAnswer(payload: WSSubmitAnswer) { socket.emit('submit_answer', payload); },
  transferHost(payload: WSTransferHost) { socket.emit('transfer_host', payload); },
  reaction(payload: WSReaction) { socket.emit('reaction', payload); },
  forceReveal(payload: WSForceReveal) { socket.emit('force_reveal', payload); },
  advanceNext(payload: WSAdvanceNext) { socket.emit('advance_next', payload); },
  toggleSpectatorReactions(payload: { code: string; enabled: boolean }) { socket.emit('toggle_spectator_reactions', payload); },
});
