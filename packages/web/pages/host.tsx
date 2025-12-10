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

type Quiz = { id: string; title: string };
type Session = {
  id: string;
  code: string;
  quizId: string;
  quizTitle: string;
  createdAt: string;
  playerCount: number;
  status: string;
  isLive: boolean;
};

export default function HostPage() {
  const router = useRouter();
  const access = useAuthStore(s => s.accessToken);
  const user = useAuthStore(s => s.user);
  
  // Mode: 'hub' = liste des sessions, 'active' = session active
  const [mode, setMode] = useState<'hub' | 'active'>('hub');
  const [activeCode, setActiveCode] = useState<string>('');
  const [activeQuizId, setActiveQuizId] = useState<string>('');
  
  // Hub state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [creating, setCreating] = useState(false);

  // Active session state
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

  // Charger les sessions et quizzes
  useEffect(() => {
    if (!access) return;
    loadData();
  }, [access]);

  async function loadData() {
    setLoadingSessions(true);
    try {
      const [sessionsRes, quizzesRes] = await Promise.all([
        apiFetch('/sessions/my'),
        apiFetch('/quizzes'),
      ]);
      
      if (sessionsRes.ok) {
        const data = await sessionsRes.json();
        setSessions(Array.isArray(data) ? data : []);
      }
      
      if (quizzesRes.ok) {
        const result = await quizzesRes.json();
        const quizList = result?.data || result || [];
        setQuizzes(Array.isArray(quizList) ? quizList : []);
      }
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoadingSessions(false);
    }
  }

  // Socket handlers
  useEffect(() => {
    if (!socket) return;
    bindSocketHandlers(socket);
    return () => { socket.disconnect(); };
  }, [socket]);

  // Rejoindre automatiquement une session active
  useEffect(() => {
    if (!socket || mode !== 'active' || !activeCode || !activeQuizId) return;
    const onConnect = () => {
      const key = `${activeCode}|${activeQuizId}`;
      if (key !== lastJoinKeyRef.current) {
        lastJoinKeyRef.current = key;
        wsApi(socket).joinSession({ code: activeCode, quizId: activeQuizId, nickname: user?.username || 'Host' });
      }
    };
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    return () => { socket.off('connect', onConnect); };
  }, [socket, mode, activeCode, activeQuizId, user?.username]);

  // Auto-set bot channel
  useEffect(() => {
    if (user?.username && !botChannel) {
      setBotChannel(user.username);
    }
  }, [user?.username, botChannel]);

  // Créer une nouvelle session
  async function createSession() {
    if (!selectedQuizId) {
      addToast({ type: 'warning', message: 'Sélectionnez un quiz' });
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/sessions/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: selectedQuizId }),
      });
      const json = await res.json();
      if (json.code) {
        setShowCreateModal(false);
        setActiveCode(json.code);
        setActiveQuizId(selectedQuizId);
        setMode('active');
        addToast({ type: 'success', message: 'Session créée !' });
        loadData(); // Rafraîchir la liste
      }
    } catch {
      addToast({ type: 'error', message: 'Échec de création' });
    } finally {
      setCreating(false);
    }
  }

  // Rejoindre une session existante
  function joinSession(sess: Session) {
    setActiveCode(sess.code);
    setActiveQuizId(sess.quizId);
    setMode('active');
    if (socket) {
      wsApi(socket).joinSession({ code: sess.code, quizId: sess.quizId, nickname: user?.username || 'Host' });
    }
  }

  // Supprimer une session
  async function deleteSession(code: string) {
    if (!confirm('Supprimer cette session ? Cette action est irréversible.')) return;
    try {
      const res = await apiFetch(`/sessions/${code}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(s => s.filter(sess => sess.code !== code));
        addToast({ type: 'success', message: 'Session supprimée' });
      } else {
        throw new Error();
      }
    } catch {
      addToast({ type: 'error', message: 'Échec de suppression' });
    }
  }

  // Retourner au hub
  function backToHub() {
    setMode('hub');
    setActiveCode('');
    setActiveQuizId('');
    lastJoinKeyRef.current = '';
    // Reset session store state
    useSessionStore.setState({
      code: undefined,
      status: 'lobby',
      questionIndex: 0,
      totalQuestions: 0,
      remainingMs: 0,
      isHost: undefined,
      isSpectator: undefined,
      autoNext: undefined,
      hostId: undefined,
      selfId: undefined,
      leaderboard: [],
      players: undefined,
      spectators: undefined,
    });
    loadData();
  }

  // Fonctions de contrôle de session
  function startQuestion() { if (socket && activeCode) wsApi(socket).startQuestion({ code: activeCode }); }
  function forceReveal() { if (socket && activeCode) wsApi(socket).forceReveal({ code: activeCode }); }
  function advanceNext() { if (socket && activeCode) wsApi(socket).advanceNext({ code: activeCode }); }
  function toggleAutoNext(e: any) { if (socket && activeCode) wsApi(socket).toggleAutoNext({ code: activeCode, enabled: e.target.checked }); }
  function transferHost(targetPlayerId: string) { if (socket && activeCode) wsApi(socket).transferHost({ code: activeCode, targetPlayerId }); }
  function toggleSpectatorReactions(e: any) { if (socket && activeCode) wsApi(socket).toggleSpectatorReactions({ code: activeCode, enabled: e.target.checked }); }

  function copy(text: string) {
    try {
      navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Copié !' });
    } catch {
      addToast({ type: 'error', message: 'Échec de la copie' });
    }
  }

  // Twitch Bot functions
  async function connectTwitchBot() {
    if (!activeCode || !botChannel.trim()) {
      addToast({ type: 'warning', message: 'Entrez le nom de la chaîne Twitch' });
      return;
    }
    setBotLoading(true);
    try {
      const res = await apiFetch('/twitch-bot/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: botChannel.trim().toLowerCase(), sessionCode: activeCode }),
      });
      if (!res.ok) throw new Error();
      setBotConnected(true);
      addToast({ type: 'success', message: `Bot connecté à #${botChannel}` });
    } catch {
      addToast({ type: 'error', message: 'Échec de connexion du bot' });
    } finally {
      setBotLoading(false);
    }
  }

  async function disconnectTwitchBot() {
    if (!botChannel) return;
    setBotLoading(true);
    try {
      await apiFetch(`/twitch-bot/disconnect/${botChannel.trim().toLowerCase()}`, { method: 'DELETE' });
      setBotConnected(false);
      addToast({ type: 'info', message: 'Bot déconnecté' });
    } catch {
      addToast({ type: 'error', message: 'Échec de déconnexion' });
    } finally {
      setBotLoading(false);
    }
  }

  const joinUrl = typeof window !== 'undefined' && activeCode ? `${window.location.origin}/play/${activeCode}` : '';
  const spectateUrl = typeof window !== 'undefined' && activeCode ? `${window.location.origin}/spectate/${activeCode}` : '';

  // Non connecté
  if (!access) {
    return (
      <>
        <Header />
        <div className="page flex flex-col items-center justify-center gap-4" style={{ minHeight: '60vh' }}>
          <div style={{ fontSize: 64 }}>🔒</div>
          <h1>Connexion requise</h1>
          <p className="text-muted">Connectez-vous pour héberger une session</p>
          <Link href="/login"><button className="btn-lg">Se connecter</button></Link>
        </div>
      </>
    );
  }

  // Mode HUB - Liste des sessions
  if (mode === 'hub') {
    return (
      <>
        <Header />
        <div className="page container" style={{ maxWidth: 900 }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700 }}>Mes Sessions</h1>
              <p className="text-muted">Gérez vos parties de quiz</p>
            </div>
            <button onClick={() => setShowCreateModal(true)} className="btn-success">
              + Nouvelle Session
            </button>
          </div>

          {/* Liste des sessions */}
          {loadingSessions ? (
            <div className="text-center text-muted" style={{ padding: 48 }}>
              Chargement...
            </div>
          ) : sessions.length === 0 ? (
            <div className="card text-center" style={{ padding: 48 }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎮</div>
              <h2 style={{ marginBottom: 8 }}>Aucune session</h2>
              <p className="text-muted mb-4">Créez votre première session pour commencer</p>
              <button onClick={() => setShowCreateModal(true)}>Créer une session</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sessions.map(sess => (
                <div key={sess.code} className="card" style={{ padding: 16 }}>
                  <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
                    {/* Info principale */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold" style={{ fontSize: 18 }}>{sess.quizTitle}</span>
                        {sess.isLive && (
                          <span className="badge badge-success" style={{ fontSize: 11 }}>
                            🔴 EN DIRECT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted">
                        <span>Code: <strong>{sess.code}</strong></span>
                        <span>•</span>
                        <span>{sess.playerCount} joueur{sess.playerCount !== 1 ? 's' : ''}</span>
                        <span>•</span>
                        <span>{new Date(sess.createdAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`badge ${sess.status === 'finished' ? 'badge-secondary' : sess.status === 'lobby' ? 'badge-warning' : 'badge-primary'}`}>
                        {sess.status === 'finished' ? 'Terminée' : sess.status === 'lobby' ? 'En attente' : 'En cours'}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {sess.isLive ? (
                        <button onClick={() => joinSession(sess)}>
                          Rejoindre
                        </button>
                      ) : (
                        <Link href={`/summary/${sess.code}`}>
                          <button className="btn-secondary">Résumé</button>
                        </Link>
                      )}
                      <button
                        className="btn-ghost"
                        onClick={() => deleteSession(sess.code)}
                        title="Supprimer"
                        style={{ color: 'var(--error)', padding: '8px' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modal de création */}
          {showCreateModal && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100 }}
                onClick={() => setShowCreateModal(false)}
              />
              <div
                className="card animate-fade-in"
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '90%',
                  maxWidth: 450,
                  zIndex: 101,
                  padding: 24,
                }}
              >
                <h2 style={{ marginBottom: 16 }}>Nouvelle Session</h2>
                
                {quizzes.length === 0 ? (
                  <div className="text-center" style={{ padding: 24 }}>
                    <p className="text-muted mb-4">Vous n'avez pas encore de quiz</p>
                    <Link href="/quizzes">
                      <button>Créer un quiz</button>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
                        Sélectionnez un quiz
                      </label>
                      <select
                        value={selectedQuizId}
                        onChange={(e) => setSelectedQuizId(e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">-- Choisir un quiz --</option>
                        {quizzes.map(q => (
                          <option key={q.id} value={q.id}>{q.title}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={createSession}
                        disabled={creating || !selectedQuizId}
                        style={{ flex: 1 }}
                      >
                        {creating ? 'Création...' : 'Créer'}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setShowCreateModal(false)}
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  // Mode ACTIVE - Session en cours
  return (
    <>
      <Header />
      <div className="page container" style={{ maxWidth: 1000 }}>
        <ReactionBar socket={socket} code={activeCode} />
        <FloatingReactions />

        {/* Header avec bouton retour */}
        <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={backToHub} style={{ padding: 8 }}>
              ← Retour
            </button>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700 }}>Session {activeCode}</h1>
              <p className="text-muted">
                {quizzes.find(q => q.id === activeQuizId)?.title || 'Quiz'}
              </p>
            </div>
          </div>
          <div className="badge badge-primary" style={{ fontSize: 18, padding: '8px 16px' }}>
            Code: {activeCode}
          </div>
        </div>

        {/* Session terminée */}
        {session.status === 'finished' && (
          <div className="card mb-4" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: 'none' }}>
            <div className="flex items-center gap-3 mb-4">
              <span style={{ fontSize: 32 }}>🎉</span>
              <div>
                <h3 style={{ fontWeight: 600 }}>Session terminée !</h3>
                <p className="text-muted">Consultez les résultats ou créez une nouvelle partie</p>
              </div>
            </div>
            <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
              <button onClick={() => router.push(`/summary/${activeCode}`)}>Voir le résumé</button>
              <button className="btn-secondary" onClick={backToHub}>Retour au hub</button>
            </div>
          </div>
        )}

        <div className="grid" style={{ gridTemplateColumns: '1fr 320px', gap: 24 }}>
          {/* Main Content */}
          <div className="flex flex-col gap-4">
            {/* Contrôles de jeu */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>Contrôles</h2>
                <div className="badge">
                  {session.status === 'lobby' && 'En attente'}
                  {session.status === 'question' && 'Question en cours'}
                  {session.status === 'reveal' && 'Correction'}
                  {session.status === 'finished' && 'Terminé'}
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
                  ▶ Démarrer
                </button>
                <button
                  onClick={forceReveal}
                  disabled={!session.isHost || session.status !== 'question'}
                  className="btn-secondary"
                >
                  Révéler
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
                  <span className="text-sm">Réactions spectateurs</span>
                </label>
              </div>
            </div>

            {/* Leaderboard */}
            {session.leaderboard.length > 0 && (
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
                            Transférer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Partage */}
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
                Permettez aux viewers de rejoindre et répondre via le chat Twitch
              </p>
              
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-sm" style={{ display: 'block', marginBottom: 4 }}>
                    Chaîne Twitch
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
                    {botLoading ? 'Déconnexion...' : 'Déconnecter'}
                  </button>
                )}

                {botConnected && (
                  <div className="text-sm" style={{ 
                    background: 'rgba(34, 197, 94, 0.1)', 
                    color: '#22c55e',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius)',
                  }}>
                    ✓ Bot connecté à #{botChannel}
                  </div>
                )}

                <div className="text-xs text-muted" style={{ marginTop: 8 }}>
                  <strong>Commandes disponibles:</strong>
                  <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                    <li><code>!join</code> - Rejoindre le quiz</li>
                    <li><code>!1</code> <code>!2</code> <code>!3</code> <code>!4</code> - Répondre</li>
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
                Ajoutez l'overlay à votre stream OBS
              </p>
              <button 
                className="btn-sm" 
                onClick={() => copy(`${typeof window !== 'undefined' ? window.location.origin : ''}/overlay/${activeCode}`)}
                style={{ width: '100%' }}
              >
                Copier le lien overlay
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
