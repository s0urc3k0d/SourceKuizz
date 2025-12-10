import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createSocket, wsApi } from '../../src/lib/ws';
import { bindSocketHandlers, useSessionStore } from '../../src/store/session';
import { useUIStore } from '../../src/store/ui';
import { useCountdownSync } from '../../src/lib/useCountdown';
import { useAuthStore } from '../../src/store/auth';
import { apiFetch } from '../../src/lib/api';
import { ReactionBar } from '../../src/components/ReactionBar';
import { FloatingReactions } from '../../src/components/FloatingReactions';
import Link from 'next/link';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

type CurrentQuestion = {
  id: string;
  prompt: string;
  timeLimitMs: number;
  options: { id: string; label: string }[];
};

export default function PlayPage() {
  const router = useRouter();
  const { query } = router;
  const code = typeof query.code === 'string' ? query.code : '';
  const access = useAuthStore(s => s.accessToken);
  const user = useAuthStore(s => s.user);
  const [quizId, setQuizId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [joined, setJoined] = useState(false);
  const session = useSessionStore();
  const [currentQ, setCurrentQ] = useState<CurrentQuestion | null>(null);
  const [answeredQ, setAnsweredQ] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const addToast = useUIStore((s) => s.addToast);
  const socket = useMemo(() => access ? createSocket(WS_URL, access) : null, [access]);
  useCountdownSync();
  const lastJoinKey = useRef<string>('');

  useEffect(() => {
    if (!socket) return;
    bindSocketHandlers(socket);
    return () => { try { socket.disconnect(); } catch {} };
  }, [socket]);

  function join() {
    if (socket && code && quizId && nickname) {
      wsApi(socket).joinSession({ code, quizId, nickname });
      setJoined(true);
      localStorage.setItem('code', code);
      localStorage.setItem('quizId', quizId);
      localStorage.setItem('nickname', nickname);
      addToast({ type: 'success', message: 'Connexion en cours...' });
    }
  }

  function answer(optionId: string) {
    if (socket && session && session.status === 'question' && currentQ && answeredQ !== currentQ.id) {
      wsApi(socket).submitAnswer({ questionId: currentQ.id, optionId, clientTs: Date.now(), code });
      setAnsweredQ(currentQ.id);
      setSelectedOption(optionId);
    }
  }

  // Charger la question courante
  useEffect(() => {
    if (!code || !session) return;
    if (session.status !== 'question') {
      setCurrentQ(null);
      setSelectedOption(null);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`/sessions/${code}/current-question`, { auth: false });
        if (res.ok) {
          const q = await res.json();
          setCurrentQ(q);
          setAnsweredQ(null);
          setSelectedOption(null);
        } else {
          setCurrentQ(null);
        }
      } catch {
        setCurrentQ(null);
      }
    })();
  }, [code, session.status, session.questionIndex]);

  // Restore persisted info
  useEffect(() => {
    try {
      const qz = localStorage.getItem('quizId');
      if (qz) setQuizId(qz);
      const nn = localStorage.getItem('nickname');
      if (nn) setNickname(nn);
      else if (user?.username) setNickname(user.username);
    } catch {}
  }, [user?.username]);

  // Auto-fetch quizId from session code if not provided
  useEffect(() => {
    if (!code || quizId) return;
    (async () => {
      try {
        const res = await apiFetch(`/sessions/${code}/info`, { auth: false });
        if (res.ok) {
          const info = await res.json();
          if (info.quizId) {
            setQuizId(info.quizId);
            localStorage.setItem('quizId', info.quizId);
          }
        }
      } catch (e) {
        console.warn('Could not fetch session info:', e);
      }
    })();
  }, [code, quizId]);

  // Auto-join
  useEffect(() => {
    if (!socket) return;
    const handleConnect = () => {
      const key = `${code}|${quizId}|${nickname}`;
      if (code && quizId && nickname && key !== lastJoinKey.current) {
        lastJoinKey.current = key;
        wsApi(socket).joinSession({ code, quizId, nickname });
        setJoined(true);
      }
    };
    socket.on('connect', handleConnect);
    return () => { socket.off('connect', handleConnect); };
  }, [socket, code, quizId, nickname]);

  // Redirection auto vers le resume
  useEffect(() => {
    if (session.status === 'finished' && code) {
      const t = setTimeout(() => { router.push(`/summary/${code}`); }, 2000);
      return () => clearTimeout(t);
    }
  }, [session.status, code, router]);

  const timePercent = currentQ ? Math.max(0, (session.remainingMs / currentQ.timeLimitMs) * 100) : 0;
  const timeSeconds = Math.max(0, Math.ceil(session.remainingMs / 1000));

  // Ecran de connexion si pas d'access token
  if (!access) {
    return (
      <div className="page flex flex-col items-center justify-center gap-4" style={{ minHeight: '80vh' }}>
        <div style={{ fontSize: 64 }}>🎮</div>
        <h1 style={{ fontSize: 28 }}>Rejoindre la session</h1>
        <p className="text-muted">Code: <strong>{code}</strong></p>
        <p className="text-muted">Connectez-vous pour participer</p>
        <Link href={`/login?returnTo=/play/${code}`}>
          <button className="btn-lg">Se connecter</button>
        </Link>
      </div>
    );
  }

  // Ecran de join
  if (!joined || session.status === 'lobby' && !session.players?.length) {
    return (
      <div className="page flex items-center justify-center" style={{ minHeight: '80vh' }}>
        <div className="card animate-fade-in" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
          <div className="text-center mb-6">
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎮</div>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Rejoindre le quiz</h1>
            <div className="badge badge-primary mt-2" style={{ fontSize: 18, padding: '6px 16px' }}>
              {code}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
                Quiz ID
              </label>
              <input
                placeholder="ID du quiz"
                value={quizId}
                onChange={(e) => setQuizId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
                Votre pseudo
              </label>
              <input
                placeholder="Entrez votre pseudo"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
              />
            </div>
            <button
              className="btn-lg"
              disabled={!quizId || !nickname}
              onClick={join}
              style={{ width: '100%' }}
            >
              Rejoindre
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: 0, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <ReactionBar socket={socket} code={code} />
      <FloatingReactions />

      {/* Header compact */}
      <div style={{
        padding: '12px 24px',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 24 }}>🎮</span>
          <span className="font-semibold">{code}</span>
        </div>
        <div className="badge">
          Q{session.questionIndex + 1}/{session.totalQuestions}
        </div>
      </div>

      {/* Contenu principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Lobby */}
        {session.status === 'lobby' && (
          <div className="flex flex-col items-center justify-center gap-4" style={{ flex: 1, padding: 24 }}>
            <div style={{ fontSize: 64 }}>⏳</div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>En attente du demarrage...</h2>
            <p className="text-muted">L'hote va bientot lancer le quiz</p>
            <div className="card" style={{ width: '100%', maxWidth: 400 }}>
              <div className="text-sm text-muted mb-2">Joueurs connectes ({session.players?.length || 0})</div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {session.players?.map(p => (
                  <span key={p.id} className="badge">{p.nickname}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Question */}
        {session.status === 'question' && currentQ && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Timer */}
            <div style={{ padding: '16px 24px', background: timePercent < 20 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg)' }}>
              <div className="flex justify-between items-center mb-2">
                <span className={`timer ${timePercent < 20 ? 'timer-danger' : ''}`} style={{ fontSize: 36 }}>
                  {timeSeconds}s
                </span>
                {answeredQ === currentQ.id && (
                  <span className="badge badge-success">Repondu !</span>
                )}
              </div>
              <div className="progress-bar" style={{ height: 6 }}>
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${timePercent}%`,
                    background: timePercent < 20 ? 'var(--error)' : undefined,
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
            </div>

            {/* Question */}
            <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{
                fontSize: 22,
                fontWeight: 600,
                textAlign: 'center',
                marginBottom: 24,
                lineHeight: 1.4,
              }}>
                {currentQ.prompt}
              </h2>

              {/* Options */}
              <div className="grid" style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
                flex: 1,
                alignContent: 'center',
              }}>
                {currentQ.options.map((opt, i) => {
                  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'];
                  const isSelected = selectedOption === opt.id;
                  const isAnswered = answeredQ === currentQ.id;
                  
                  return (
                    <button
                      key={opt.id}
                      onClick={() => answer(opt.id)}
                      disabled={isAnswered}
                      className="quiz-option"
                      style={{
                        padding: '20px 24px',
                        fontSize: 16,
                        fontWeight: 500,
                        background: isSelected ? colors[i % 4] : 'var(--bg-card)',
                        color: isSelected ? 'white' : 'var(--text)',
                        border: `2px solid ${isSelected ? colors[i % 4] : 'var(--border)'}`,
                        borderRadius: 'var(--radius-lg)',
                        textAlign: 'left',
                        opacity: isAnswered && !isSelected ? 0.5 : 1,
                        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: isSelected ? 'rgba(255,255,255,0.2)' : colors[i % 4],
                        color: 'white',
                        fontWeight: 700,
                        fontSize: 14,
                        marginRight: 12,
                      }}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Reveal */}
        {session.status === 'reveal' && (
          <div className="flex flex-col items-center justify-center gap-4" style={{ flex: 1, padding: 24 }}>
            <div style={{ fontSize: 64 }}>📊</div>
            <h2 style={{ fontSize: 24, fontWeight: 600 }}>Resultats</h2>
            <p className="text-muted">En attente de la question suivante...</p>
            
            {/* Mini leaderboard */}
            <div className="card" style={{ width: '100%', maxWidth: 400 }}>
              <h3 className="font-semibold mb-3">Top 5</h3>
              <div className="flex flex-col gap-2">
                {session.leaderboard.slice(0, 5).map((entry, i) => (
                  <div key={entry.playerId} className="leaderboard-item" style={{ padding: '8px 12px' }}>
                    <div className={`leaderboard-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`} style={{ width: 24, height: 24, fontSize: 12 }}>
                      {entry.rank}
                    </div>
                    <div style={{ flex: 1, fontSize: 14 }}>{entry.nickname}</div>
                    <div className="font-bold text-sm" style={{ color: 'var(--primary)' }}>{entry.score}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Finished */}
        {session.status === 'finished' && (
          <div className="flex flex-col items-center justify-center gap-4" style={{ flex: 1, padding: 24 }}>
            <div style={{ fontSize: 80 }}>🎉</div>
            <h2 style={{ fontSize: 28, fontWeight: 700 }}>Quiz termine !</h2>
            <p className="text-muted">Redirection vers les resultats...</p>
          </div>
        )}
      </div>
    </div>
  );
}
