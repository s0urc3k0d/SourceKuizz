import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { loginApi, registerApi } from '../src/lib/api';
import { useUIStore } from '../src/store/ui';
import { useAuthStore } from '../src/store/auth';
import Link from 'next/link';
import Header from '../src/components/Header';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

export default function LoginPage() {
  const router = useRouter();
  const addToast = useUIStore(s => s.addToast);
  const access = useAuthStore(s => s.accessToken);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Afficher l'erreur OAuth si presente dans l'URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      addToast({ type: 'error', message: decodeURIComponent(error) });
      router.replace('/login', undefined, { shallow: true });
    }
  }, [addToast, router]);

  useEffect(() => {
    if (access) router.replace('/quizzes');
  }, [access, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') {
        await loginApi(username, password);
        addToast({ type: 'success', message: 'Connecte !' });
      } else {
        await registerApi(username, password);
        addToast({ type: 'success', message: 'Compte cree !' });
      }
      router.push('/quizzes');
    } catch (e: any) {
      const msg = e?.message || (mode === 'login' ? 'Echec de connexion' : 'Echec d\'inscription');
      addToast({ type: 'error', message: msg });
    } finally {
      setBusy(false);
    }
  }

  function handleTwitchLogin() {
    localStorage.setItem('authReturnTo', '/quizzes');
    window.location.href = `${API_BASE}/api/auth/twitch`;
  }

  return (
    <>
      <Header />
      <div className="page flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minHeight: '100vh' }}>
      <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        {/* Logo */}
        <div className="text-center mb-4">
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎯</div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>SourceKuizz</h1>
          <p className="text-muted">La plateforme de quiz en temps reel</p>
        </div>

        {/* Bouton Twitch */}
        <button
          onClick={handleTwitchLogin}
          className="btn-twitch btn-lg"
          style={{ width: '100%', marginBottom: 24 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
          </svg>
          Continuer avec Twitch
        </button>

        {/* Separateur */}
        <div className="flex items-center gap-3" style={{ marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span className="text-muted text-sm">ou</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Toggle Login/Register */}
        <div className="flex gap-2 mb-4" style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 4 }}>
          <button
            type="button"
            onClick={() => setMode('login')}
            className={mode === 'login' ? '' : 'btn-ghost'}
            style={{
              flex: 1,
              background: mode === 'login' ? 'var(--bg-card)' : 'transparent',
              boxShadow: mode === 'login' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={mode === 'register' ? '' : 'btn-ghost'}
            style={{
              flex: 1,
              background: mode === 'register' ? 'var(--bg-card)' : 'transparent',
              boxShadow: mode === 'register' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            Inscription
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
              Nom d'utilisateur
            </label>
            <input
              type="text"
              placeholder="Entrez votre pseudo"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
              Mot de passe
            </label>
            <input
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            className="btn-lg"
            disabled={busy || !username || !password}
            style={{ width: '100%', marginTop: 8 }}
          >
            {busy ? (
              <span className="animate-pulse">Chargement...</span>
            ) : mode === 'login' ? (
              'Se connecter'
            ) : (
              'Creer un compte'
            )}
          </button>
        </form>

        {/* Lien retour */}
        <div className="text-center mt-6">
          <Link href="/" className="text-muted text-sm" style={{ textDecoration: 'none' }}>
            Retour a l'accueil
          </Link>
        </div>
      </div>
    </div>
    </>
  );
}
