import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import Toasts from '../src/components/Toasts';
import Header from '../src/components/Header';
import { useAuthStore } from '../src/store/auth';

export default function MyApp({ Component, pageProps }: AppProps) {
  const bootstrap = useAuthStore(s => s.bootstrap);
  useEffect(()=>{ bootstrap(); }, [bootstrap]);
  return (
    <>
      <Header />
      <Component {...pageProps} />
      <Toasts />
    </>
  );
}
