import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../src/lib/api';
import { useUIStore } from '../../src/store/ui';
import { useAuthStore } from '../../src/store/auth';
import ShareButtons from '../../src/components/ShareButtons';
import Header from '../../src/components/Header';

type Summary = {
  code: string;
  quiz: { id: string; title: string };
  createdAt: string;
  leaderboard: Array<{ nickname: string; score: number; rank: number }>;
  podium: Array<{ nickname: string; score: number; rank: number }>;
  questions: Array<{ id: string; prompt: string; index: number; answered: number; correct: number; correctRate: number; avgTimeCorrectMs: number | null }>;
  playerStats: Record<string, { correct: number; answered: number; avgTimeCorrectMs: number | null }>;
};

export default function SessionSummaryPage() {
  const router = useRouter();
  const { code } = router.query as { code?: string };
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addToast = useUIStore(s => s.addToast);
  const access = useAuthStore(s => s.accessToken);
  const username = useAuthStore(s => s.username);

  useEffect(() => {
    if (!code) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await apiFetch(`/sessions/${code}/summary`, { auth: false });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json: Summary = await res.json();
        setSummary(json);
      } catch (e: any) {
        const msg = e?.message || 'Chargement du résumé échoué';
        setError(msg);
        addToast({ type: 'error', message: msg });
      } finally {
        setLoading(false);
      }
    })();
  }, [code, addToast]);

  const exportHref = useMemo(() => code ? `/api/sessions/${code}/export.csv` : '#', [code]);
  const summaryHref = useMemo(() => code ? `${typeof window!== 'undefined' ? window.location.origin : ''}/summary/${code}` : '', [code]);

  // Trouver mon score et rang si connecté
  const myResult = useMemo(() => {
    if (!username || !summary) return null;
    return summary.leaderboard.find(e => e.nickname.toLowerCase() === username.toLowerCase());
  }, [username, summary]);

  async function replayQuiz() {
    if (!summary?.quiz?.id) { addToast({ type: 'warning', message: 'Quiz inconnu' }); return; }
    try {
      const res = await apiFetch('/sessions/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quizId: summary.quiz.id }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      // Prépare Host à rejoindre
      try { localStorage.setItem('quizId', summary.quiz.id); localStorage.setItem('code', j.code); } catch {}
      addToast({ type: 'success', message: 'Nouvelle session créée' });
      router.push('/host');
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Échec de la création' });
    }
  }

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">🏆 Résumé de la session {code}</h1>
        
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            Accueil
          </button>
          {code && (
            <a href={exportHref} target="_blank" rel="noreferrer">
              <button className="px-4 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition">
                📥 Exporter CSV
              </button>
            </a>
          )}
          {access && summary?.quiz?.id && (
            <button 
              onClick={replayQuiz}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
            >
              🔄 Rejouer ce quiz
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
          </div>
        )}
        
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}
        
        {summary && (
        <div style={{ display: 'grid', gap: 16 }}>
          <section style={{ display: 'grid', gap: 6 }}>
            <div><b>Quiz:</b> {summary.quiz.title} <small style={{ color: '#666' }}>({summary.quiz.id})</small></div>
            <div><b>Code:</b> {summary.code}</div>
            <div><b>Créée le:</b> {new Date(summary.createdAt).toLocaleString()}</div>
          </section>

          <section>
            <h3>Podium</h3>
            {summary.podium.length === 0 ? <div>Aucun joueur.</div> : (
              <ol>
                {summary.podium.map(e => (
                  <li key={e.rank}>{e.rank}. {e.nickname} – {e.score} pts</li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3>Classement complet</h3>
            {summary.leaderboard.length === 0 ? <div>Aucun joueur.</div> : (
              <ol>
                {summary.leaderboard.map(e => (
                  <li key={e.rank}>{e.rank}. {e.nickname} – {e.score} pts</li>
                ))}
              </ol>
            )}
          </section>

          <section style={{ display: 'grid', gap: 8 }}>
            <h3>Statistiques par question</h3>
            {summary.questions.length === 0 ? <div>Aucune question.</div> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
                {summary.questions.map(q => (
                  <li key={q.id} style={{ border: '1px solid #eee', padding: 8, borderRadius: 6 }}>
                    <div><b>Q{q.index + 1}</b> – {q.prompt}</div>
                    <div>Réponses: {q.answered} • Correctes: {q.correct} • Taux: {(q.correctRate * 100).toFixed(0)}% • Temps moyen (correct): {q.avgTimeCorrectMs == null ? '-' : `${q.avgTimeCorrectMs} ms`}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section style={{ display: 'grid', gap: 8 }}>
            <h3>Statistiques par joueur</h3>
            {Object.keys(summary.playerStats).length === 0 ? <div>Aucun joueur.</div> : (
              <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 8 }}>
                {summary.leaderboard.map(e => {
                  const st = summary.playerStats[e.nickname];
                  return (
                    <li key={e.rank} style={{ border: '1px solid #eee', padding: 8, borderRadius: 6 }}>
                      <div><b>{e.nickname}</b> – {e.score} pts</div>
                      <div>Répondu: {st?.answered ?? 0} • Correct: {st?.correct ?? 0} • Temps moyen (correct): {st?.avgTimeCorrectMs == null ? '-' : `${st.avgTimeCorrectMs} ms`}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Partage social */}
          <section className="bg-white rounded-xl shadow p-6">
            <ShareButtons
              title={`Quiz ${summary.quiz.title} sur SourceKuizz`}
              text={`Je viens de jouer au quiz "${summary.quiz.title}" sur SourceKuizz !`}
              url={summaryHref}
              score={myResult?.score}
              rank={myResult?.rank}
            />
          </section>
        </div>
      )}
    </main>
    </>
  );
}
