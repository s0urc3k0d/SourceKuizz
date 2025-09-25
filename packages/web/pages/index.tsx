import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface LeaderboardEntry { playerId: string; nickname: string; score: number; rank: number }

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [code, setCode] = useState('DEMO1');
  const [nickname, setNickname] = useState('Guest');
  const [joined, setJoined] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    const s = io('http://localhost:3001');
    setSocket(s);
    s.on('leaderboard_update', (msg) => setLeaderboard(msg.entries));
    s.on('reaction_broadcast', (msg) => console.log('Reaction', msg));
    return () => { s.disconnect(); };
  }, []);

  const join = () => {
    if (!socket) return;
    socket.emit('join_session', { code, nickname });
    setJoined(true);
  };

  const answer = () => {
    socket?.emit('submit_answer', { questionId: 'q1', answer: 1, clientTs: Date.now(), code });
  };

  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>SourceKuizz (Prototype)</h1>
      {!joined && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code session" />
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Pseudo" />
          <button onClick={join}>Rejoindre</button>
        </div>
      )}
      {joined && (
        <div style={{ marginTop: 16 }}>
          <button onClick={answer}>Envoyer Réponse (aléatoire)</button>
        </div>
      )}
      <h2>Leaderboard</h2>
      <ol>
        {leaderboard.map((e) => (
          <li key={e.playerId}>{e.rank}. {e.nickname} – {e.score}</li>
        ))}
      </ol>
    </main>
  );
}
