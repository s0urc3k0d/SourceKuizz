import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSocket, wsApi } from '../../src/lib/ws';
import { bindSocketHandlers, useSessionStore } from '../../src/store/session';
import { useUIStore } from '../../src/store/ui';
import { useAuthStore } from '../../src/store/auth';
import { loginApi, registerApi } from '../../src/lib/api';
import { ReactionBar } from '../../src/components/ReactionBar';
import { FloatingReactions } from '../../src/components/FloatingReactions';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export default function SpectatePage() {
  const router = useRouter();
  const { query } = router;
  const code = typeof query.code === 'string' ? query.code : '';
  const access = useAuthStore(s => s.accessToken);
  const [quizId, setQuizId] = useState<string>('');
  const session = useSessionStore();
  const socket = useMemo(()=> access ? createSocket(WS_URL, access) : null, [access]);
  const addToast = useUIStore((s)=>s.addToast);
  const lastJoinKeyRef = useRef('');

  useEffect(()=>{ if (!socket) return; bindSocketHandlers(socket); return ()=>{ try { socket.disconnect(); } catch {} }; }, [socket]);

  async function register(username: string, password: string) { await registerApi(username, password); }
  async function login(username: string, password: string) { await loginApi(username, password); }

  function join() { if (socket && code && quizId) { wsApi(socket).joinSession({ code, quizId, spectator: true }); addToast({ type: 'info', message: 'Connexion spectateur…' }); localStorage.setItem('quizId', quizId); } }

  useEffect(()=>{ try { const q = localStorage.getItem('quizId'); if (q) setQuizId(q); } catch {} }, []);
  useEffect(()=>{
    if (!socket) return;
    const onConnect = () => {
      const key = `${code}|${quizId}`;
      if (code && quizId && key !== lastJoinKeyRef.current) {
        lastJoinKeyRef.current = key;
        wsApi(socket).joinSession({ code, quizId, spectator: true });
        addToast({ type: 'info', message: 'Rejoint comme spectateur…' });
      }
    };
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, code, quizId, addToast]);

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <ReactionBar socket={socket} code={code} />
      <FloatingReactions />
      <h1>Spectateur – Session {code}</h1>
      {!access && (
        <section style={{ display: 'flex', gap: 8 }}>
          <button onClick={()=>register('spectator', 'secret123')}>Register (dev)</button>
          <button onClick={()=>login('spectator', 'secret123')}>Login (dev)</button>
        </section>
      )}
      <section>
        <input placeholder="Quiz ID" value={quizId} onChange={(e)=>setQuizId(e.target.value)} />
        <button disabled={!access || !quizId} onClick={join}>Regarder</button>
      </section>
      <section>
        <div>Phase: {session.status} – Q{session.questionIndex+1}/{session.totalQuestions} – Temps restant: {Math.max(0, Math.round(session.remainingMs/100)/10)}s</div>
        {session.status === 'finished' && (
          <div style={{ marginTop: 8, padding: 8, background: '#fffbe6', border: '1px solid #eee', borderRadius: 6 }}>
            <b>Session terminée.</b>
            <div><button onClick={() => router.push(`/summary/${code}`)}>Voir le résumé</button></div>
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
