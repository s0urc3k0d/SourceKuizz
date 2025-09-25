// Types partagés pour le protocole temps réel (MVP minimal)

export type ClientToServerMessage =
  | { t: 'join_session'; code: string; nickname?: string; authToken?: string }
  | { t: 'submit_answer'; questionId: string; answer: unknown; clientTs: number }
  | { t: 'reaction'; emoji: string }
  | { t: 'ping'; ts: number };

export type LeaderboardEntry = {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
};

export type ServerToClientMessage =
  | { t: 'session_state'; status: string; questionIndex: number; remainingMs: number }
  | { t: 'question'; id: string; prompt: string; type: string; options?: string[]; timeLimitMs: number }
  | { t: 'answer_ack'; questionId: string; accepted: boolean; serverLatencyMs?: number }
  | { t: 'reveal'; questionId: string; correct: unknown; leaderboardSlice: LeaderboardEntry[] }
  | { t: 'leaderboard_update'; entries: LeaderboardEntry[] }
  | { t: 'reaction_broadcast'; playerId: string; emoji: string }
  | { t: 'pong'; ts: number }
  | { t: 'end_session'; finalLeaderboard: LeaderboardEntry[] };

export type AnyMessage = ClientToServerMessage | ServerToClientMessage;
