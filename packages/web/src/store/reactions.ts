import { create } from 'zustand';

export type ReactionItem = {
  id: string;
  playerId: string;
  emoji: string;
  ts: number;
};

type ReactionsState = {
  reactions: ReactionItem[];
  addReaction: (r: { playerId: string; emoji: string; ttlMs?: number }) => void;
  removeReaction: (id: string) => void;
  clear: () => void;
};

export const useReactionsStore = create<ReactionsState>((set, get) => ({
  reactions: [],
  addReaction: ({ playerId, emoji, ttlMs = 4000 }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ts = Date.now();
    set((s) => ({ reactions: [...s.reactions, { id, playerId, emoji, ts }] }));
    // auto-clean after ttl
    setTimeout(() => {
      get().removeReaction(id);
    }, ttlMs);
  },
  removeReaction: (id: string) => set((s) => ({ reactions: s.reactions.filter(r => r.id !== id) })),
  clear: () => set({ reactions: [] }),
}));
