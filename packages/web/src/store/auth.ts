import { create } from 'zustand';

type User = { id?: string; username: string };

type AuthState = {
  accessToken?: string;
  refreshToken?: string;
  user?: User;
  setTokens: (access: string, refresh?: string) => void;
  clear: () => void;
  bootstrap: () => void;
};

function decodeJwt(token: string): any | undefined {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return undefined;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: undefined,
  refreshToken: undefined,
  user: undefined,
  setTokens: (access, refresh) => {
    const payload = decodeJwt(access);
    const username = payload?.username as string | undefined;
    set({ accessToken: access, refreshToken: refresh ?? get().refreshToken, user: username ? { username } : undefined });
    try {
      localStorage.setItem('accessToken', access);
      if (refresh) localStorage.setItem('refreshToken', refresh);
      // cleanup legacy
      localStorage.removeItem('token');
    } catch {}
  },
  clear: () => {
    set({ accessToken: undefined, refreshToken: undefined, user: undefined });
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('token');
    } catch {}
  },
  bootstrap: () => {
    try {
      const legacy = localStorage.getItem('token');
      const access = localStorage.getItem('accessToken') || legacy || undefined;
      const refresh = localStorage.getItem('refreshToken') || undefined;
      if (access) {
        const payload = decodeJwt(access);
        const username = payload?.username as string | undefined;
        set({ accessToken: access, refreshToken: refresh, user: username ? { username } : undefined });
      }
    } catch {}
  },
}));
