import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSocket, wsApi } from '../../src/lib/ws';
import { bindSocketHandlers, useSessionStore } from '../../src/store/session';
import { useUIStore } from '../../src/store/ui';
import { useCountdownSync } from '../../src/lib/useCountdown';
import { useAuthStore } from '../../src/store/auth';
import { apiFetch, loginApi, registerApi } from '../../src/lib/api';
import { ReactionBar } from '../../src/components/ReactionBar';
import { FloatingReactions } from '../../src/components/FloatingReactions';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

type CurrentQuestion = { id: string; prompt: string; timeLimitMs: number; options: { id: string; label: string }[] };

export default function PlayPage() {
  const router = useRouter();
  const { query } = router;
  const code = typeof query.code === 'string' ? query.code : '';
  const access = useAuthStore(s => s.accessToken);
  const [quizId, setQuizId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('Guest');
  const session = useSessionStore();
  const [currentQ, setCurrentQ] = useState<CurrentQuestion | null>(null);
  const [answeredQ, setAnsweredQ] = useState<string | null>(null);
  const addToast = useUIStore((s) => s.addToast);
  const socket = useMemo(()=> access ? createSocket(WS_URL, access) : null, [access]);
  useCountdownSync();
  const lastJoinKey = useRef<string>('');

  useEffect(()=>{ if (!socket) return; bindSocketHandlers(socket); return ()=>{ try { socket.disconnect(); } catch {} }; }, [socket]);

  async function register(username: string, password: string) { await registerApi(username, password); }
  async function login(username: string, password: string) { await loginApi(username, password); }

  function join() {
    if (socket && code && quizId) {
      wsApi(socket).joinSession({ code, quizId, nickname });
      addToast({ type: 'info', message: 'Requête de jonction envoyée…' });
      localStorage.setItem('code', code);
      localStorage.setItem('quizId', quizId);
      localStorage.setItem('nickname', nickname);
    }
  }
  function answer(optionId: string) {
    if (socket && session && session.status === 'question' && currentQ && answeredQ !== currentQ.id) {
      wsApi(socket).submitAnswer({ questionId: currentQ.id, optionId, clientTs: Date.now(), code });
      setAnsweredQ(currentQ.id);
    }
  }

  // Charger la question courante via HTTP quand phase passe à question
  useEffect(()=>{
    if (!code || !session) return;
    if (session.status !== 'question') { setCurrentQ(null); return; }
    (async ()=>{
      try {
        const res = await apiFetch(`/sessions/${code}/current-question`, { auth: false });
        if (res.ok) {
          const q = await res.json(); setCurrentQ(q); setAnsweredQ(null);
        } else { setCurrentQ(null); }
      } catch { setCurrentQ(null); }
    })();
  }, [code, session.status, session.questionIndex]);

  // Restore persisted auth/session info
  useEffect(() => {
    try {
      const qz = localStorage.getItem('quizId'); if (qz) setQuizId(qz);
      const nn = localStorage.getItem('nickname'); if (nn) setNickname(nn);
    } catch {}
  }, []);

  // Auto-join on socket connect when we have stored code/quiz/nickname
  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => {
      const key = `${code}|${quizId}|${nickname}`;
      if (code && quizId && nickname && key !== lastJoinKey.current) {
        lastJoinKey.current = key;
        wsApi(socket).joinSession({ code, quizId, nickname });
        addToast({ type: 'info', message: 'Rejoint automatiquement la session…' });
      }
    };
    socket.on('connect', handleConnect);
    return () => { socket.off('connect', handleConnect); };
  }, [socket, code, quizId, nickname, addToast]);

  // Redirection auto vers le résumé quand la session se termine
  useEffect(() => {
    if (session.status === 'finished' && code) {
      const t = setTimeout(() => { router.push(`/summary/${code}`); }, 800);
      return () => clearTimeout(t);
    }
  }, [session.status, code, router]);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <ReactionBar socket={socket} code={code} />
      <FloatingReactions />
      <h1>Joueur – Session {code}</h1>
      {!access && (
        <section style={{ display: 'flex', gap: 8 }}>
          <button onClick={()=>register('player', 'secret123')}>Register (dev)</button>
          <button onClick={()=>login('player', 'secret123')}>Login (dev)</button>
        </section>
      )}
      <section>
        <input placeholder="Quiz ID" value={quizId} onChange={(e)=>setQuizId(e.target.value)} />
        <input placeholder="Pseudo" value={nickname} onChange={(e)=>setNickname(e.target.value)} />
        <button disabled={!access || !quizId} onClick={join}>Rejoindre</button>
      </section>
      <section>
        <div>Phase: {session.status} – Q{session.questionIndex+1}/{session.totalQuestions} – Temps restant: {Math.max(0, Math.round(session.remainingMs/100)/10)}s</div>
        {session.status === 'finished' && (
          <div style={{ marginTop: 8, padding: 8, background: '#fffbe6', border: '1px solid #eee', borderRadius: 6 }}>
            <b>Session terminée.</b>
            <div><button onClick={() => router.push(`/summary/${code}`)}>Voir le résumé</button></div>
          </div>
        )}
        {session.status === 'question' && currentQ && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>{currentQ.prompt}</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              {currentQ.options.map(opt => (
                <button key={opt.id} onClick={()=>answer(opt.id)} disabled={answeredQ === currentQ.id}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <h3>Leaderboard</h3>
        <ol>
          {session.leaderboard.map(e => (<li key={e.playerId}>{e.rank}. {e.nickname} – {e.score}</li>))}
        </ol>
      </section>
    </main>
  );
}
