import { useEffect, useMemo, useRef, useState } from 'react';
import { createSocket, wsApi } from '../src/lib/ws';
import { bindSocketHandlers, useSessionStore } from '../src/store/session';
import { useUIStore } from '../src/store/ui';
import { useAuthStore } from '../src/store/auth';
import { apiFetch, loginApi, registerApi } from '../src/lib/api';
import QRCode from 'react-qr-code';
import { ReactionBar } from '../src/components/ReactionBar';
import { FloatingReactions } from '../src/components/FloatingReactions';
import { useRouter } from 'next/router';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export default function HostPage() {
  const router = useRouter();
  const access = useAuthStore(s => s.accessToken);
  const [quizId, setQuizId] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const session = useSessionStore();
  const socket = useMemo(()=> access ? createSocket(WS_URL, access) : null, [access]);
  const addToast = useUIStore((s)=>s.addToast);
  const lastJoinKeyRef = useRef('');
  const playersSorted = useMemo(() => {
    const ps = session.players ? [...session.players] : [];
    const scoreMap = new Map(session.leaderboard.map(e => [e.playerId, e.score] as const));
    ps.sort((a, b) => {
      // Hôte en premier
      if (session.hostId === a.id && session.hostId !== b.id) return -1;
      if (session.hostId === b.id && session.hostId !== a.id) return 1;
      // Score décroissant
      const sa = scoreMap.get(a.id) ?? -Infinity;
      const sb = scoreMap.get(b.id) ?? -Infinity;
      if (sb !== sa) return sb - sa;
      // Alpha
      return a.nickname.localeCompare(b.nickname);
    });
    return ps;
  }, [session.players, session.leaderboard, session.hostId]);

  useEffect(()=>{
    if (!socket) return;
    bindSocketHandlers(socket);
    return ()=>{ socket.disconnect(); };
  }, [socket]);

  async function login(username: string, password: string) { await loginApi(username, password); }
  async function register(username: string, password: string) { await registerApi(username, password); }
  async function ensureSession() {
    const res = await apiFetch('/sessions/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId, code: code || undefined }) });
    const json = await res.json(); setCode(json.code);
    localStorage.setItem('code', json.code);
    localStorage.setItem('quizId', quizId);
    if (socket) { wsApi(socket).joinSession({ code: json.code, quizId, nickname: 'Host' }); addToast({ type: 'info', message: 'Session assurée, jonction en cours…' }); }
  }

  // Restore persisted auth/session info & auto-join as host when possible
  useEffect(()=>{
    try {
      const qz = localStorage.getItem('quizId'); if (qz) setQuizId(qz);
      const c = localStorage.getItem('code'); if (c) setCode(c);
    } catch {}
  }, []);
  useEffect(()=>{
    if (!socket) return;
    const onConnect = () => {
      const key = `${code}|${quizId}`;
      if (code && quizId && key !== lastJoinKeyRef.current) {
        lastJoinKeyRef.current = key;
        wsApi(socket).joinSession({ code, quizId, nickname: 'Host' });
        addToast({ type: 'info', message: 'Rejoint en tant qu’hôte…' });
      }
    };
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, code, quizId, addToast]);

  function startQuestion() { if (socket && code) wsApi(socket).startQuestion({ code }); }
  function forceReveal() { if (socket && code) wsApi(socket).forceReveal({ code }); }
  function advanceNext() { if (socket && code) wsApi(socket).advanceNext({ code }); }
  function toggleAutoNext(e: any) { if (socket && code) wsApi(socket).toggleAutoNext({ code, enabled: e.target.checked }); }
  function transferHost(targetPlayerId: string) { if (socket && code) wsApi(socket).transferHost({ code, targetPlayerId }); }
  function toggleSpectatorReactions(e: any) { if (socket && code) wsApi(socket).toggleSpectatorReactions({ code, enabled: e.target.checked }); }
  function copy(text: string) { try { navigator.clipboard.writeText(text); addToast({ type: 'success', message: 'Copié dans le presse-papiers' }); } catch { addToast({ type: 'error', message: 'Copie échouée' }); } }
  async function replayQuiz() {
    if (!quizId) { addToast({ type: 'warning', message: 'Aucun quiz sélectionné' }); return; }
    try {
      const res = await apiFetch('/sessions/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      setCode(json.code);
      localStorage.setItem('code', json.code);
      if (socket) wsApi(socket).joinSession({ code: json.code, quizId, nickname: 'Host' });
      addToast({ type: 'success', message: 'Nouvelle session créée' });
    } catch { addToast({ type: 'error', message: 'Échec de la création' }); }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      {session.status === 'finished' && code && (
        <div style={{ padding: 12, border: '1px solid #e0e0e0', background: '#fffbe6', borderRadius: 6 }}>
          <b>Session terminée.</b>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={() => router.push(`/summary/${code}`)}>Voir le résumé</button>
            <a href={`/api/sessions/${code}/export.csv`} target="_blank" rel="noreferrer"><button>Exporter CSV</button></a>
            <button onClick={replayQuiz}>Rejouer ce quiz</button>
          </div>
        </div>
      )}
      <ReactionBar socket={socket} code={code} />
      <FloatingReactions />
      <h1>Mode Hôte</h1>
      {!access && (
        <section style={{ display: 'flex', gap: 8 }}>
          <button onClick={()=>register('host', 'secret123')}>Register (dev)</button>
          <button onClick={()=>login('host', 'secret123')}>Login (dev)</button>
        </section>
      )}
      <section style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Quiz ID" value={quizId} onChange={(e)=>setQuizId(e.target.value)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input placeholder="Code (optionnel)" value={code} onChange={(e)=>setCode(e.target.value)} />
          <button disabled={!access || !quizId} onClick={ensureSession}>Assurer la session</button>
        </div>
      </section>
      <section>
        <div>Code: <b>{code || '(pas encore)'} </b></div>
        <div>Phase: {session.status} – Q{session.questionIndex+1}/{session.totalQuestions} – AutoNext: {session.autoNext ? 'ON' : 'OFF'}</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={!!session.autoNext}
            onChange={toggleAutoNext}
            disabled={!session.isHost}
            title={!session.isHost ? 'Réservé à l’hôte' : 'Basculer l’auto-next'}
          />
          Auto-next
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={!!session.allowSpectatorReactions}
            onChange={toggleSpectatorReactions}
            disabled={!session.isHost}
            title={!session.isHost ? 'Réservé à l’hôte' : 'Autoriser les réactions des spectateurs'}
          />
          Réactions spectateurs
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={startQuestion}
            disabled={!code || !session.isHost || !(session.status === 'lobby' || session.status === 'reveal')}
            title={!session.isHost ? 'Réservé à l’hôte' : 'Démarrer la question'}
          >
            Démarrer question
          </button>
          <button
            onClick={forceReveal}
            disabled={!code || !session.isHost || session.status !== 'question'}
            title={!session.isHost ? 'Réservé à l’hôte' : 'Révéler maintenant'}
          >
            Révéler maintenant
          </button>
          <button
            onClick={advanceNext}
            disabled={!code || !session.isHost || !(session.status === 'reveal' || session.status === 'lobby')}
            title={!session.isHost ? 'Réservé à l’hôte' : 'Passer à la suivante'}
          >
            Question suivante
          </button>
        </div>
      </section>
      {code && (
        <section style={{ display: 'grid', gap: 8 }}>
          <h3>Partager</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {typeof window !== 'undefined' && (
              <>
                <div style={{ display: 'grid', gap: 6, placeItems: 'center' }}>
                  <div>Joueur</div>
                  <QRCode value={`${window.location.origin}/play/${code}`} size={96} />
                  <button onClick={()=>copy(`${window.location.origin}/play/${code}`)}>Copier lien</button>
                </div>
                <div style={{ display: 'grid', gap: 6, placeItems: 'center' }}>
                  <div>Spectateur</div>
                  <QRCode value={`${window.location.origin}/spectate/${code}`} size={96} />
                  <button onClick={()=>copy(`${window.location.origin}/spectate/${code}`)}>Copier lien</button>
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <a href={`/summary/${code}`}><button>Voir le résumé</button></a>
            <a href={`/api/sessions/${code}/export.csv`} target="_blank" rel="noreferrer"><button>Exporter CSV</button></a>
            <button onClick={replayQuiz}>Rejouer ce quiz</button>
          </div>
        </section>
      )}
      <section>
        <h3>Leaderboard</h3>
        <ol>
          {session.leaderboard.map(e => (<li key={e.playerId}>{e.rank}. {e.nickname} – {e.score}</li>))}
        </ol>
      </section>
      <section>
        <h3>Joueurs connectés ({session.players?.length ?? 0})</h3>
        {(!playersSorted || playersSorted.length === 0) ? <div>Aucun joueur.</div> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {playersSorted.map((pl)=> {
              const score = session.leaderboard.find(e=>e.playerId===pl.id)?.score;
              const isHost = session.hostId === pl.id;
              const isSelf = session.selfId === pl.id;
              return (
                <li key={pl.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #eee', padding: 8, borderRadius: 6, background: isHost ? '#fff9e6' : undefined }}>
                  <div>
                    <b>{pl.nickname}</b>
                    {typeof score === 'number' && <span style={{ color: '#666' }}> ({score} pts)</span>}
                    {isHost && <span style={{ marginLeft: 8, color: '#a67c00' }}>(HOST)</span>}
                    {isSelf && <span style={{ marginLeft: 8, color: '#1b5e20' }}>(vous)</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      disabled={!session.isHost || isHost || isSelf}
                      onClick={()=>transferHost(pl.id)}
                      title={!session.isHost ? 'Réservé à l’hôte' : isHost ? 'Déjà hôte' : isSelf ? 'Vous êtes déjà connecté ici' : 'Transférer l’hôte'}
                    >
                      Transférer l’hôte
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h3>Spectateurs ({session.spectators?.length ?? 0})</h3>
        {(!session.spectators || session.spectators.length === 0) ? <div>Aucun spectateur.</div> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
            {session.spectators.map((sp)=> (
              <li key={sp.id} style={{ border: '1px solid #eee', padding: 8, borderRadius: 6 }}>
                <b>{sp.nickname}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
