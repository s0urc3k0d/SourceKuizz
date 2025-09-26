import { create } from 'zustand';
import type { EVLeaderboardUpdate, EVQuestionReveal, EVQuestionStarted, EVSessionFinished, EVSessionState, EVAutoNextToggled, EVHostChanged, EVAnswerAck, EVRejected } from '@sourcekuizz/shared';
import { useUIStore } from './ui';
import { useReactionsStore } from './reactions';

type Phase = EVSessionState['status'];

export type SessionState = {
  code?: string;
  status: Phase;
  questionIndex: number;
  totalQuestions: number;
  remainingMs: number;
  isHost?: boolean;
  isSpectator?: boolean;
  autoNext?: boolean;
  allowSpectatorReactions?: boolean;
  hostId?: string;
  selfId?: string;
  leaderboard: { playerId: string; nickname: string; score: number; rank: number }[];
  players?: { id: string; nickname: string }[];
  spectators?: { id: string; nickname: string }[];
};

export const useSessionStore = create<SessionState>(() => ({
  status: 'lobby',
  questionIndex: 0,
  totalQuestions: 0,
  remainingMs: 0,
  leaderboard: [],
}));

export function bindSocketHandlers(socket: any) {
  const set = useSessionStore.setState as (partial: Partial<SessionState> | ((state: SessionState) => SessionState)) => void;
  const addToast = useUIStore.getState().addToast;
  const addReaction = useReactionsStore.getState().addReaction;
  // Countdown timer: re-synchronize on every session_state and question_started
  let timer: any;
  // Save self socket id
  const setSelfId = () => { try { useSessionStore.setState({ selfId: socket.id }); } catch {} };
  socket.on('connect', setSelfId);
  const restartTimer = (remainingMs: number) => {
    if (timer) clearInterval(timer);
    if (remainingMs > 0) {
      timer = setInterval(() => {
        useSessionStore.setState((s) => ({ ...s, remainingMs: Math.max(0, s.remainingMs - 100) }));
      }, 100);
    }
  };
  socket.on('session_state', (p: EVSessionState) => {
    set({
      code: p.code ?? undefined,
      status: p.status,
      questionIndex: p.questionIndex,
      totalQuestions: p.totalQuestions,
      remainingMs: p.remainingMs,
      isHost: p.isHost,
      isSpectator: p.isSpectator,
      autoNext: p.autoNext,
      hostId: (p as any).hostId,
      players: (p as any).players,
      spectators: (p as any).spectators,
    });
    restartTimer(p.remainingMs);
    if (p.reconnected) addToast({ type: 'info', message: 'Reconnexion réussie. Synchronisation…' });
  });
  socket.on('question_started', (p: EVQuestionStarted) => {
    // Reset timer côté client avec timeLimitMs
    set((s: SessionState) => ({ ...s, status: 'question', questionIndex: p.index, remainingMs: p.timeLimitMs }));
    restartTimer(p.timeLimitMs);
  });
  socket.on('question_reveal', (_p: EVQuestionReveal) => {
    set((s: SessionState) => ({ ...s, status: 'reveal', remainingMs: 0 }));
    restartTimer(0);
  });
  socket.on('leaderboard_update', (p: EVLeaderboardUpdate) => {
    set({ leaderboard: p.entries });
  });
  socket.on('session_finished', (p: EVSessionFinished) => {
    set((s: SessionState) => ({ ...s, status: 'finished', remainingMs: 0, leaderboard: p.final }));
    restartTimer(0);
  });
  socket.on('auto_next_toggled', (p: EVAutoNextToggled) => {
    set((s: SessionState) => ({ ...s, autoNext: p.enabled }));
  });
  socket.on('spectator_reactions_toggled', (p: { enabled: boolean }) => {
    set((s: SessionState) => ({ ...s, allowSpectatorReactions: p.enabled }));
  });
  socket.on('host_changed', (_p: EVHostChanged) => {
    // Le serveur renverra des session_state pour rafraîchir isHost; on garde hostId quand dispo
    set((s)=> ({ ...s, hostId: _p.hostId } as any));
  });
  socket.on('answer_ack', (ack: EVAnswerAck) => {
    if (ack.accepted) {
      const delta = typeof ack.scoreDelta === 'number' ? ` (+${ack.scoreDelta})` : '';
      addToast({ type: ack.correct ? 'success' : 'info', message: ack.correct ? `Bonne réponse${delta}` : `Réponse enregistrée${delta}` });
    } else {
      addToast({ type: 'warning', message: ack.reason ? `Réponse refusée: ${ack.reason}` : 'Réponse refusée' });
    }
  });
  const showRej = (src: string) => (r: EVRejected) => addToast({ type: 'error', message: `${src} refusé: ${r.code}${r.message ? ' – ' + r.message : ''}` });
  socket.on('join_rejected', showRej('Join'));
  socket.on('start_question_rejected', showRej('Start question'));
  socket.on('toggle_auto_next_rejected', showRej('Auto-next'));
  socket.on('transfer_host_rejected', showRej('Transfer host'));
  socket.on('reaction_rejected', showRej('Reaction'));
  socket.on('force_reveal_rejected', showRej('Force reveal'));
  socket.on('advance_next_rejected', showRej('Next'));
  socket.on('error_generic', (r: any) => addToast({ type: 'error', message: `Erreur: ${r?.code || 'unknown'}` }));
  socket.on('reaction_broadcast', (p: { playerId: string; emoji: string }) => {
    addReaction({ playerId: p.playerId, emoji: p.emoji });
  });
}
