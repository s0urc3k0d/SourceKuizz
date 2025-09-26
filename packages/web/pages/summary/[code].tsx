import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../src/lib/api';
import { useUIStore } from '../../src/store/ui';
import { useAuthStore } from '../../src/store/auth';

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

  function copy(text: string) {
    try { navigator.clipboard.writeText(text); addToast({ type: 'success', message: 'Lien copié' }); }
    catch { addToast({ type: 'error', message: 'Copie échouée' }); }
  }

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
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1>Résumé de la session {code}</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/')}>Accueil</button>
        {code && <a href={exportHref} target="_blank" rel="noreferrer"><button>Exporter CSV</button></a>}
        {code && <button onClick={() => copy(summaryHref)}>Copier lien du résumé</button>}
        {access && summary?.quiz?.id && <button onClick={replayQuiz}>Rejouer ce quiz</button>}
      </div>
      {loading && <div>Chargement…</div>}
      {error && <div style={{ color: '#a00' }}>{error}</div>}
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
        </div>
      )}
    </main>
  );
}
