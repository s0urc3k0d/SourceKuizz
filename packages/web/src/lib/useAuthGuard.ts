import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { refreshNow } from './api';

export function useAuthGuard() {
  const router = useRouter();
  const access = useAuthStore(s => s.accessToken);
  const scheduleRef = useRef<number | null>(null);

  // redirect if not logged
  useEffect(() => {
    if (access === undefined) return; // wait bootstrap
    if (!access) router.replace('/login');
  }, [access, router]);

  // proactively refresh before expiry if exp claim exists
  useEffect(() => {
    if (!access) return;
    try {
      const [, payload] = access.split('.');
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      const expSec = json?.exp as number | undefined; // seconds since epoch
      if (!expSec) return;
      const expMs = expSec * 1000;
      const delay = Math.max(3_000, expMs - Date.now() - 30_000); // refresh 30s before expiry
      if (scheduleRef.current) window.clearTimeout(scheduleRef.current);
      scheduleRef.current = window.setTimeout(() => { refreshNow().catch(()=>{}); }, delay);
      return () => { if (scheduleRef.current) window.clearTimeout(scheduleRef.current); };
    } catch { /* ignore */ }
  }, [access]);
}
