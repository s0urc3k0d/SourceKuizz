import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../../src/store/auth';

/**
 * Page callback pour OAuth Twitch
 * Récupère les tokens depuis les cookies httpOnly de manière sécurisée
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const setTokens = useAuthStore(s => s.setTokens);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const error = params.get('error');
      const authSuccess = params.get('authSuccess');
      const username = params.get('username');
      const avatarUrl = params.get('avatarUrl');

      if (error) {
        setErrorMessage(error);
        setStatus('error');
        return;
      }

      // Nouveau flux: tokens dans cookies httpOnly
      if (authSuccess === 'true') {
        try {
          const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
          const response = await fetch(`${backendUrl}/auth/me`, {
            method: 'GET',
            credentials: 'include', // Inclut les cookies httpOnly
          });

          if (response.ok) {
            const data = await response.json();
            if (data.accessToken) {
              setTokens(data.accessToken, data.refreshToken);
              if (avatarUrl) {
                try { localStorage.setItem('avatarUrl', avatarUrl); } catch {}
              }
              const returnTo = localStorage.getItem('authReturnTo') || '/';
              localStorage.removeItem('authReturnTo');
              router.replace(returnTo);
              return;
            }
          }
        } catch (err) {
          console.warn('Could not fetch tokens from httpOnly cookies:', err);
        }
      }

      // Fallback: ancien flux avec tokens en URL (pour rétrocompatibilité)
      const accessToken = params.get('accessToken');
      const refreshToken = params.get('refreshToken');

      if (accessToken) {
        setTokens(accessToken, refreshToken || undefined);
        const returnTo = localStorage.getItem('authReturnTo') || '/';
        localStorage.removeItem('authReturnTo');
        router.replace(returnTo);
      } else if (authSuccess === 'true') {
        // Les cookies n'ont pas pu être lus mais l'auth a réussi
        // Rediriger vers login pour réessayer
        router.replace('/login?error=cookie_error');
      } else {
        setErrorMessage('Token manquant');
        setStatus('error');
      }
    };

    handleAuth();
  }, [router, setTokens]);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black flex items-center justify-center">
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-8 max-w-md text-center backdrop-blur">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-white mb-2">Erreur de connexion</h1>
          <p className="text-red-200/80 mb-6">{errorMessage}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-gray-900 to-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-white/80">Connexion en cours...</p>
      </div>
    </div>
  );
}
