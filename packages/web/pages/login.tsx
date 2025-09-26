import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { loginApi, registerApi } from '../src/lib/api';
import { useUIStore } from '../src/store/ui';
import { useAuthStore } from '../src/store/auth';

export default function LoginPage() {
  const router = useRouter();
  const addToast = useUIStore(s => s.addToast);
  const access = useAuthStore(s => s.accessToken);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(()=>{ if (access) router.replace('/quizzes'); }, [access, router]);

  async function doLogin() {
    setBusy(true);
    try {
      await loginApi(username, password);
      addToast({ type: 'success', message: 'Connecté' });
      router.push('/quizzes');
    } catch (e: any) {
      const msg = e?.message || 'Login échoué';
      addToast({ type: 'error', message: msg });
    }
    finally { setBusy(false); }
  }
  async function doRegister() {
    setBusy(true);
    try {
      await registerApi(username, password);
      addToast({ type: 'success', message: 'Compte créé et connecté' });
      router.push('/quizzes');
    } catch (e: any) {
      const msg = e?.message || 'Register échoué';
      addToast({ type: 'error', message: msg });
    }
    finally { setBusy(false); }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 420 }}>
      <h1>Login / Register</h1>
      <input placeholder="Nom d’utilisateur" value={username} onChange={(e)=>setUsername(e.target.value)} />
      <input placeholder="Mot de passe" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doLogin} disabled={busy || !username || !password}>Login</button>
        <button onClick={doRegister} disabled={busy || !username || !password}>Register</button>
      </div>
    </main>
  );
}
