import { useEffect, useMemo, useRef, useState } from 'react';
import { createSocket, wsApi } from '../src/lib/ws';
import { bindSocketHandlers, useSessionStore } from '../src/store/session';
import { useUIStore } from '../src/store/ui';
import { useAuthStore } from '../src/store/auth';
import { apiFetch } from '../src/lib/api';
import QRCode from 'react-qr-code';
import { ReactionBar } from '../src/components/ReactionBar';
import { FloatingReactions } from '../src/components/FloatingReactions';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Header from '../src/components/Header';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export default function HostPage() {
  const router = useRouter();
  const access = useAuthStore(s => s.accessToken);
  const user = useAuthStore(s => s.user);
  const [quizId, setQuizId] = useState<string>('');
  const [quizzes, setQuizzes] = useState<{ id: string; title: string }[]>([]);
  const [code, setCode] = useState<string>('');
  const session = useSessionStore();
  const socket = useMemo(() => access ? createSocket(WS_URL, access) : null, [access]);
  const addToast = useUIStore((s) => s.addToast);
  const lastJoinKeyRef = useRef('');

  // Twitch Bot state
  const [botConnected, setBotConnected] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [botChannel, setBotChannel] = useState('');

  const playersSorted = useMemo(() => {
    const ps = session.players ? [...session.players] : [];
    const scoreMap = new Map(session.leaderboard.map(e => [e.playerId, e.score] as const));
    ps.sort((a, b) => {
      if (session.hostId === a.id && session.hostId !== b.id) return -1;
      if (session.hostId === b.id && session.hostId !== a.id) return 1;
      const sa = scoreMap.get(a.id) ?? -Infinity;
      const sb = scoreMap.get(b.id) ?? -Infinity;
      if (sb !== sa) return sb - sa;
      return a.nickname.localeCompare(b.nickname);
    });
    return ps;
  }, [session.players, session.leaderboard, session.hostId]);

  // Charger les quizzes de l'utilisateur
  useEffect(() => {
    if (!access) return;
    apiFetch('/quizzes').then(res => res.json()).then(result => {
      // L'API retourne { data: Quiz[], meta: {...} }
      if (result && Array.isArray(result.data)) {
        setQuizzes(result.data);
      } else if (Array.isArray(result)) {
        // Fallback si l'API retourne directement un tableau
        setQuizzes(result);
      }
    }).catch(() => {});
  }, [access]);

  useEffect(() => {
    if (!socket) return;
    bindSocketHandlers(socket);
    return () => { socket.disconnect(); };
  }, [socket]);

  async function ensureSession() {
    if (!quizId) {
      addToast({ type: 'warning', message: 'Selectionnez un quiz' });
      return;
    }
    const res = await apiFetch('/sessions/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quizId, code: code || undefined })
    });
    const json = await res.json();
    setCode(json.code);
    localStorage.setItem('code', json.code);
    localStorage.setItem('quizId', quizId);
    if (socket) {
      wsApi(socket).joinSession({ code: json.code, quizId, nickname: user?.username || 'Host' });
      addToast({ type: 'success', message: 'Session creee !' });
    }
  }

  useEffect(() => {
    try {
      const qz = localStorage.getItem('quizId');
      if (qz) setQuizId(qz);
      const c = localStorage.getItem('code');
      if (c) setCode(c);
    } catch {}
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => {
      const key = `${code}|${quizId}`;
      if (code && quizId && key !== lastJoinKeyRef.current) {
        lastJoinKeyRef.current = key;
        wsApi(socket).joinSession({ code, quizId, nickname: user?.username || 'Host' });
      }
    };
    socket.on('connect', onConnect);
    return () => { socket.off('connect', onConnect); };
  }, [socket, code, quizId, user?.username]);

  function startQuestion() { if (socket && code) wsApi(socket).startQuestion({ code }); }
  function forceReveal() { if (socket && code) wsApi(socket).forceReveal({ code }); }
  function advanceNext() { if (socket && code) wsApi(socket).advanceNext({ code }); }
  function toggleAutoNext(e: any) { if (socket && code) wsApi(socket).toggleAutoNext({ code, enabled: e.target.checked }); }
  function transferHost(targetPlayerId: string) { if (socket && code) wsApi(socket).transferHost({ code, targetPlayerId }); }
  function toggleSpectatorReactions(e: any) { if (socket && code) wsApi(socket).toggleSpectatorReactions({ code, enabled: e.target.checked }); }
  
  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Lien copie !' });
    } catch {
      addToast({ type: 'error', message: 'Echec de la copie' });
    }
  }

  // Twitch Bot functions
  async function connectTwitchBot() {
    if (!code || !botChannel.trim()) {
      addToast({ type: 'warning', message: 'Entrez le nom de la chaine Twitch' });
      return;
    }
    setBotLoading(true);
    try {
      const res = await apiFetch('/twitch-bot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: botChannel.trim().toLowerCase(), sessionCode: code })
      });
      if (!res.ok) throw new Error('Failed to connect bot');
      setBotConnected(true);
      addToast({ type: 'success', message: `Bot connecte a #${botChannel}` });
    } catch {
      addToast({ type: 'error', message: 'Echec de connexion du bot' });
    } finally {
      setBotLoading(false);
    }
  }

  async function disconnectTwitchBot() {
    if (!botChannel) return;
    setBotLoading(true);
    try {
      await apiFetch(`/twitch-bot/disconnect/${botChannel.trim().toLowerCase()}`, {
        method: 'DELETE'
      });
      setBotConnected(false);
      addToast({ type: 'info', message: 'Bot deconnecte' });
    } catch {
      addToast({ type: 'error', message: 'Echec de deconnexion' });
    } finally {
      setBotLoading(false);
    }
  }

  // Auto-set bot channel from user's Twitch username
  useEffect(() => {
    if (user?.username && !botChannel) {
      setBotChannel(user.username);
    }
  }, [user?.username, botChannel]);

  async function replayQuiz() {
    if (!quizId) return;
    try {
      const res = await apiFetch('/sessions/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId })
      });
      const json = await res.json();
      setCode(json.code);
      localStorage.setItem('code', json.code);
      if (socket) wsApi(socket).joinSession({ code: json.code, quizId, nickname: user?.username || 'Host' });
      addToast({ type: 'success', message: 'Nouvelle session creee' });
    } catch {
      addToast({ type: 'error', message: 'Echec de creation' });
    }
  }

  const joinUrl = typeof window !== 'undefined' && code ? `${window.location.origin}/play/${code}` : '';
  const spectateUrl = typeof window !== 'undefined' && code ? `${window.location.origin}/spectate/${code}` : '';

  // Rediriger vers login si pas connecte
  if (!access) {
    return (
      <>
        <Header />
        <div className="page flex flex-col items-center justify-center gap-4" style={{ minHeight: '60vh' }}>
          <div style={{ fontSize: 64 }}>🔒</div>
          <h1>Connexion requise</h1>
          <p className="text-muted">Connectez-vous pour heberger une session</p>
          <Link href="/login"><button className="btn-lg">Se connecter</button></Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page container" style={{ maxWidth: 1000 }}>
      <ReactionBar socket={socket} code={code} />
      <FloatingReactions />

      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Mode Hote</h1>
          <p className="text-muted">Creez et gerez votre session de quiz</p>
        </div>
        {code && (
          <div className="badge badge-primary" style={{ fontSize: 18, padding: '8px 16px' }}>
            Code: {code}
          </div>
        )}
      </div>

      {/* Session terminee */}
      {session.status === 'finished' && code && (
        <div className="card mb-4" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: 'none' }}>
          <div className="flex items-center gap-3 mb-4">
            <span style={{ fontSize: 32 }}>🎉</span>
            <div>
              <h3 style={{ fontWeight: 600 }}>Session terminee !</h3>
              <p className="text-muted">Consultez les resultats ou relancez une partie</p>
            </div>
          </div>
          <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
            <button onClick={() => router.push(`/summary/${code}`)}>Voir le resume</button>
            <button className="btn-secondary" onClick={replayQuiz}>Rejouer ce quiz</button>
          </div>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: code ? '1fr 320px' : '1fr', gap: 24 }}>
        {/* Main Content */}
        <div className="flex flex-col gap-4">
          {/* Configuration */}
          {!code && (
            <div className="card">
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Configuration</h2>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
                    Selectionnez un quiz
                  </label>
                  <select
                    value={quizId}
                    onChange={(e) => setQuizId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">-- Choisir un quiz --</option>
                    {quizzes.map(q => (
                      <option key={q.id} value={q.id}>{q.title}</option>
                    ))}
                  </select>
                </div>
                <button className="btn-lg" disabled={!quizId} onClick={ensureSession}>
                  Creer la session
                </button>
              </div>
            </div>
          )}

          {/* Controles de jeu */}
          {code && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>Controles</h2>
                <div className="badge">
                  {session.status === 'lobby' && 'En attente'}
                  {session.status === 'question' && 'Question en cours'}
                  {session.status === 'reveal' && 'Correction'}
                  {session.status === 'finished' && 'Termine'}
                </div>
              </div>

              {/* Progress */}
              <div style={{ marginBottom: 16 }}>
                <div className="flex justify-between text-sm mb-2">
                  <span>Question {session.questionIndex + 1} / {session.totalQuestions}</span>
                  <span>{Math.round((session.questionIndex / Math.max(session.totalQuestions, 1)) * 100)}%</span>
                </div>
                <div className="progress-bar">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${(session.questionIndex / Math.max(session.totalQuestions, 1)) * 100}%` }}
                  />
                </div>
              </div>

              {/* Boutons */}
              <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                <button
                  onClick={startQuestion}
                  disabled={!session.isHost || !(session.status === 'lobby' || session.status === 'reveal')}
                  className="btn-success"
                >
                  ▶ Demarrer
                </button>
                <button
                  onClick={forceReveal}
                  disabled={!session.isHost || session.status !== 'question'}
                  className="btn-secondary"
                >
                  Reveler
                </button>
                <button
                  onClick={advanceNext}
                  disabled={!session.isHost || session.status !== 'reveal'}
                  className="btn-secondary"
                >
                  Suivante →
                </button>
              </div>

              {/* Options */}
              <div className="flex gap-4 mt-4" style={{ flexWrap: 'wrap' }}>
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!session.autoNext}
                    onChange={toggleAutoNext}
                    disabled={!session.isHost}
                  />
                  <span className="text-sm">Auto-next</span>
                </label>
                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!session.allowSpectatorReactions}
                    onChange={toggleSpectatorReactions}
                    disabled={!session.isHost}
                  />
                  <span className="text-sm">Reactions spectateurs</span>
                </label>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {code && session.leaderboard.length > 0 && (
            <div className="card">
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Classement</h2>
              <div className="flex flex-col gap-2">
                {session.leaderboard.slice(0, 10).map((entry, i) => (
                  <div key={entry.playerId} className="leaderboard-item">
                    <div className={`leaderboard-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
                      {entry.rank}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold">{entry.nickname}</div>
                    </div>
                    <div className="font-bold" style={{ color: 'var(--primary)' }}>{entry.score} pts</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Joueurs */}
          {code && (
            <div className="card">
              <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
                Joueurs ({playersSorted.length})
              </h2>
              {playersSorted.length === 0 ? (
                <p className="text-muted text-center" style={{ padding: 24 }}>
                  En attente de joueurs...
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {playersSorted.map((pl) => {
                    const score = session.leaderboard.find(e => e.playerId === pl.id)?.score;
                    const isHost = session.hostId === pl.id;
                    return (
                      <div
                        key={pl.id}
                        className="flex items-center gap-3"
                        style={{
                          padding: '10px 12px',
                          background: isHost ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg)',
                          borderRadius: 'var(--radius)',
                        }}
                      >
                        <div className="avatar" style={{ width: 36, height: 36 }}>
                          {pl.nickname.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="font-semibold">{pl.nickname}</div>
                          {typeof score === 'number' && (
                            <div className="text-sm text-muted">{score} pts</div>
                          )}
                        </div>
                        {isHost && <span className="badge badge-warning">HOST</span>}
                        {session.isHost && !isHost && (
                          <button
                            className="btn-sm btn-ghost"
                            onClick={() => transferHost(pl.id)}
                          >
                            Transferer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Partage */}
        {code && (
          <div className="flex flex-col gap-4">
            <div className="card text-center">
              <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Partager</h3>
              
              {/* QR Code Joueur */}
              <div style={{ marginBottom: 24 }}>
                <div className="text-sm text-muted mb-2">Lien joueur</div>
                <div style={{ background: 'white', padding: 16, borderRadius: 'var(--radius)', display: 'inline-block' }}>
                  <QRCode value={joinUrl} size={140} />
                </div>
                <div className="mt-3">
                  <button className="btn-sm" onClick={() => copy(joinUrl)} style={{ width: '100%' }}>
                    Copier le lien
                  </button>
                </div>
              </div>

              {/* QR Code Spectateur */}
              <div>
                <div className="text-sm text-muted mb-2">Lien spectateur</div>
                <div style={{ background: 'white', padding: 16, borderRadius: 'var(--radius)', display: 'inline-block' }}>
                  <QRCode value={spectateUrl} size={100} />
                </div>
                <div className="mt-3">
                  <button className="btn-sm btn-secondary" onClick={() => copy(spectateUrl)} style={{ width: '100%' }}>
                    Copier le lien
                  </button>
                </div>
              </div>
            </div>

            {/* Spectateurs */}
            {session.spectators && session.spectators.length > 0 && (
              <div className="card">
                <h3 style={{ fontWeight: 600, marginBottom: 12 }}>
                  Spectateurs ({session.spectators.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {session.spectators.map(sp => (
                    <div key={sp.id} className="text-sm text-muted">
                      {sp.nickname}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bot Twitch */}
            <div className="card">
              <h3 style={{ fontWeight: 600, marginBottom: 12 }}>
                <span style={{ marginRight: 8 }}>🤖</span>
                Bot Twitch
              </h3>
              <p className="text-sm text-muted mb-3">
                Permettez aux viewers de rejoindre et repondre via le chat Twitch
              </p>
              
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-sm" style={{ display: 'block', marginBottom: 4 }}>
                    Chaine Twitch
                  </label>
                  <input
                    type="text"
                    value={botChannel}
                    onChange={(e) => setBotChannel(e.target.value)}
                    placeholder="nom_de_la_chaine"
                    disabled={botConnected || botLoading}
                    style={{ width: '100%' }}
                  />
                </div>

                {!botConnected ? (
                  <button
                    onClick={connectTwitchBot}
                    disabled={botLoading || !botChannel.trim()}
                    className="btn-success"
                  >
                    {botLoading ? 'Connexion...' : 'Connecter le bot'}
                  </button>
                ) : (
                  <button
                    onClick={disconnectTwitchBot}
                    disabled={botLoading}
                    className="btn-secondary"
                  >
                    {botLoading ? 'Deconnexion...' : 'Deconnecter'}
                  </button>
                )}

                {botConnected && (
                  <div className="text-sm" style={{ 
                    background: 'rgba(34, 197, 94, 0.1)', 
                    color: '#22c55e',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)'
                  }}>
                    ✓ Bot connecte a #{botChannel}
                  </div>
                )}

                <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                  <strong>Commandes disponibles:</strong>
                  <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                    <li><code>!join</code> - Rejoindre le quiz</li>
                    <li><code>!1</code> <code>!2</code> <code>!3</code> <code>!4</code> - Repondre</li>
                    <li><code>!score</code> - Voir son score</li>
                    <li><code>!rank</code> - Voir son classement</li>
                    <li><code>!leave</code> - Quitter</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Overlay Link */}
            <div className="card">
              <h3 style={{ fontWeight: 600, marginBottom: 12 }}>
                <span style={{ marginRight: 8 }}>📺</span>
                Overlay OBS
              </h3>
              <p className="text-sm text-muted mb-3">
                Ajoutez l'overlay a votre stream OBS
              </p>
              <button 
                className="btn-sm" 
                onClick={() => copy(`${typeof window !== 'undefined' ? window.location.origin : ''}/overlay/${code}`)}
                style={{ width: '100%' }}
              >
                Copier le lien overlay
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
