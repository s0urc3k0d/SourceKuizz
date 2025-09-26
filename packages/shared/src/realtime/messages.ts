// Types partagés alignés sur le protocole WebSocket actuel

export type WSJoinSession = {
  code?: string;
  quizId: string;
  nickname?: string;
  spectator?: boolean;
};

export type WSStartQuestion = { code: string };
export type WSToggleAutoNext = { code: string; enabled: boolean };
export type WSSubmitAnswer = { questionId: string; optionId: string; clientTs: number; code?: string };
export type WSTransferHost = { code: string; targetPlayerId: string };
export type WSReaction = { emoji: string; code?: string };
export type WSForceReveal = { code: string };
export type WSAdvanceNext = { code: string };

export interface LeaderboardEntry { playerId: string; nickname: string; score: number; rank: number }

export type EVSessionState = {
  code?: string;
  status: 'lobby' | 'question' | 'reveal' | 'finished';
  questionIndex: number;
  totalQuestions: number;
  remainingMs: number;
  isHost?: boolean;
  isSpectator?: boolean;
  autoNext?: boolean;
  reconnected?: boolean;
  hostId?: string;
  players?: { id: string; nickname: string }[];
  spectators?: { id: string; nickname: string }[];
  allowSpectatorReactions?: boolean;
};

export type EVSessionCodeAssigned = { code: string };
export type EVQuestionStarted = { questionId: string; index: number; timeLimitMs: number };
export type EVAnswerAck = { questionId: string; accepted: boolean; correct?: boolean; scoreDelta?: number; reason?: string };
export type EVQuestionReveal = { questionId: string; correctOptionIds: string[] };
export type EVLeaderboardUpdate = { entries: LeaderboardEntry[] };
export type EVSessionFinished = { final: LeaderboardEntry[] };
export type EVHostChanged = { hostId?: string };
export type EVAutoNextToggled = { enabled: boolean };
export type EVSpectatorReactionsToggled = { enabled: boolean };
export type EVRejected = { code: string; message?: string; details?: any };

export type ServerToClientEvents = {
  session_state: (payload: EVSessionState) => void;
  session_code_assigned: (payload: EVSessionCodeAssigned) => void;
  question_started: (payload: EVQuestionStarted) => void;
  answer_ack: (payload: EVAnswerAck) => void;
  question_reveal: (payload: EVQuestionReveal) => void;
  leaderboard_update: (payload: EVLeaderboardUpdate) => void;
  session_finished: (payload: EVSessionFinished) => void;
  host_changed: (payload: EVHostChanged) => void;
  reaction_broadcast: (payload: { playerId: string; emoji: string }) => void;
  auto_next_toggled: (payload: EVAutoNextToggled) => void;
  spectator_reactions_toggled: (payload: EVSpectatorReactionsToggled) => void;
  // Error channels
  join_rejected: (payload: EVRejected) => void;
  start_question_rejected: (payload: EVRejected) => void;
  toggle_auto_next_rejected: (payload: EVRejected) => void;
  transfer_host_rejected: (payload: EVRejected) => void;
  reaction_rejected: (payload: EVRejected) => void;
  force_reveal_rejected: (payload: EVRejected) => void;
  advance_next_rejected: (payload: EVRejected) => void;
  toggle_spectator_reactions_rejected: (payload: EVRejected) => void;
  error_generic: (payload: EVRejected | { code: string }) => void;
};

export type ClientToServerEvents = {
  join_session: (payload: WSJoinSession) => void;
  start_question: (payload: WSStartQuestion) => void;
  toggle_auto_next: (payload: WSToggleAutoNext) => void;
  submit_answer: (payload: WSSubmitAnswer) => void;
  transfer_host: (payload: WSTransferHost) => void;
  reaction: (payload: WSReaction) => void;
  force_reveal: (payload: WSForceReveal) => void;
  advance_next: (payload: WSAdvanceNext) => void;
  toggle_spectator_reactions: (payload: { code: string; enabled: boolean }) => void;
};
