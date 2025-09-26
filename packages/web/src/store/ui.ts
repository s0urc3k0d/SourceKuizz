import { create } from 'zustand';

export type Toast = {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  ts: number;
};

type UIState = {
  toasts: Toast[];
  addToast: (t: Omit<Toast, 'id' | 'ts'> & { id?: string }) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  toasts: [],
  addToast: (t) => set((s) => ({
    toasts: [
      ...s.toasts,
      { id: t.id ?? Math.random().toString(36).slice(2), ts: Date.now(), type: t.type, message: t.message },
    ],
  })),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));
