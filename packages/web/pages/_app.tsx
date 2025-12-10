import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Toasts from '../src/components/Toasts';
import { useAuthStore } from '../src/store/auth';
import '../styles/globals.css';

// Pages qui n'affichent pas le header global (car elles ont leur propre)
const pagesWithOwnHeader = ['/summary/', '/profile/', '/history', '/settings'];

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const bootstrap = useAuthStore(s => s.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Enregistrer le service worker pour les notifications push
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('[App] Service Worker registered:', registration.scope);
        },
        (error) => {
          console.warn('[App] Service Worker registration failed:', error);
        }
      );

      // Écouter les messages du service worker pour la navigation
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NAVIGATE' && event.data?.url) {
          router.push(event.data.url);
        }
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Component {...pageProps} />
      <Toasts />
    </>
  );
}
