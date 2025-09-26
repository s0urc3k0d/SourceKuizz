import { useAuthStore } from '../store/auth';

// Si NEXT_PUBLIC_API_BASE_URL est défini, on l'utilise (ex: https://api.example.com)
// Sinon, on passe par le proxy Next.js sous /api (voir next.config.mjs -> rewrites)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const API_PREFIX = API_BASE || '/api';

let refreshing: Promise<void> | null = null;

async function doRefresh(): Promise<void> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) { clear(); return; }
  const p = (async () => {
    const res = await fetch(`${API_PREFIX}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken })
    });
    if (!res.ok) { clear(); return; }
    const json = await res.json();
    setTokens(json.accessToken, json.refreshToken);
  })();
  try { await p; } finally { refreshing = null; }
}

export function refreshNow(): Promise<void> {
  if (!refreshing) refreshing = doRefresh();
  return refreshing;
}

export async function apiFetch(input: string, init?: RequestInit & { auth?: boolean }): Promise<Response> {
  const st = useAuthStore.getState();
  const withAuth = init?.auth ?? true;
  const headers: Record<string, string> = { ...(init?.headers as any) };
  if (withAuth && st.accessToken) headers['Authorization'] = 'Bearer ' + st.accessToken;
  const res = await fetch(input.startsWith('http') ? input : `${API_PREFIX}${input}`, { ...init, headers });
  if (res.status !== 401) return res;
  // try refresh once
  if (!withAuth) return res;
  if (!refreshing) refreshing = doRefresh();
  await refreshing;
  const st2 = useAuthStore.getState();
  if (!st2.accessToken) return res;
  const headers2: Record<string, string> = { ...(init?.headers as any) };
  headers2['Authorization'] = 'Bearer ' + st2.accessToken;
  return fetch(input.startsWith('http') ? input : `${API_PREFIX}${input}`, { ...init, headers: headers2 });
}

export async function loginApi(username: string, password: string) {
  const res = await fetch(`${API_PREFIX}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!res.ok) {
    let msg = 'login_failed';
    try { const j = await res.json(); msg = j?.message || msg; } catch {}
    throw new Error(Array.isArray(msg) ? msg.map((m:any)=>m?.message||m).join(', ') : msg);
  }
  const json = await res.json();
  useAuthStore.getState().setTokens(json.accessToken, json.refreshToken);
}

export async function registerApi(username: string, password: string) {
  const res = await fetch(`${API_PREFIX}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!res.ok) {
    let msg = 'register_failed';
    try { const j = await res.json(); msg = j?.message || msg; } catch {}
    throw new Error(Array.isArray(msg) ? msg.map((m:any)=>m?.message||m).join(', ') : msg);
  }
  const json = await res.json();
  useAuthStore.getState().setTokens(json.accessToken, json.refreshToken);
}

export function logout() { useAuthStore.getState().clear(); }
