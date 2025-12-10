import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../src/store/auth';
import { useUIStore } from '../src/store/ui';
import { apiFetch } from '../src/lib/api';
import Header from '../src/components/Header';

interface GameHistoryItem {
  id: string;
  sessionCode: string;
  quizId: string;
  quizTitle: string;
  score: number;
  rank: number;
  totalPlayers: number;
  correctCount: number;
  totalQuestions: number;
  avgTimeMs: number | null;
  playedAt: string;
}

interface HistoryResponse {
  items: GameHistoryItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

type SortBy = 'playedAt' | 'score' | 'rank';
type SortOrder = 'asc' | 'desc';

export default function HistoryPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const addToast = useUIStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('playedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const fetchHistory = useCallback(async (offset = 0, append = false) => {
    if (!accessToken) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: String(offset),
        sortBy,
        sortOrder,
      });
      const res = await apiFetch(`/history/me?${params}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data: HistoryResponse = await res.json();
      
      if (append && history) {
        setHistory({
          ...data,
          items: [...history.items, ...data.items],
        });
      } else {
        setHistory(data);
      }
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Erreur chargement historique' });
    } finally {
      setLoading(false);
    }
  }, [accessToken, sortBy, sortOrder, history, addToast]);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
      return;
    }
    fetchHistory(0, false);
  }, [accessToken, sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette entrée de l\'historique ?')) return;
    
    try {
      const res = await apiFetch(`/history/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      
      setHistory((prev) => prev ? {
        ...prev,
        items: prev.items.filter((item) => item.id !== id),
        total: prev.total - 1,
      } : null);
      
      addToast({ type: 'success', message: 'Entrée supprimée' });
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Erreur suppression' });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const loadMore = () => {
    if (history) {
      fetchHistory(history.items.length, true);
    }
  };

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">📜 Mon historique</h1>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 border rounded-lg bg-white"
            >
              <option value="playedAt">Date</option>
              <option value="score">Score</option>
              <option value="rank">Rang</option>
            </select>
            <button
              onClick={() => setSortOrder((prev) => prev === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border rounded-lg bg-white hover:bg-gray-50"
              title={sortOrder === 'asc' ? 'Croissant' : 'Décroissant'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {loading && !history && (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {history && history.items.length === 0 && (
          <div className="bg-white rounded-xl shadow p-12 text-center">
            <p className="text-gray-500 text-lg mb-4">Vous n'avez pas encore joué de partie</p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
            >
              Jouer maintenant
            </button>
          </div>
        )}

        {history && history.items.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="divide-y">
                {history.items.map((game) => (
                  <div
                    key={game.id}
                    className="p-4 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => router.push(`/summary/${game.sessionCode}`)}
                      >
                        <h3 className="font-semibold text-gray-900">{game.quizTitle}</h3>
                        <p className="text-sm text-gray-500">{formatDate(game.playedAt)}</p>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-indigo-600">{game.score}</p>
                          <p className="text-xs text-gray-500">points</p>
                        </div>
                        
                        <div className="text-center">
                          <p className={`text-lg font-bold ${
                            game.rank === 1 ? 'text-yellow-500' : 
                            game.rank === 2 ? 'text-gray-400' :
                            game.rank === 3 ? 'text-amber-600' : 'text-gray-700'
                          }`}>
                            #{game.rank}
                          </p>
                          <p className="text-xs text-gray-500">/ {game.totalPlayers}</p>
                        </div>
                        
                        <div className="text-center">
                          <p className="text-lg font-semibold text-green-600">
                            {game.correctCount}/{game.totalQuestions}
                          </p>
                          <p className="text-xs text-gray-500">correct</p>
                        </div>
                        
                        {game.avgTimeMs && (
                          <div className="text-center">
                            <p className="text-lg font-semibold text-blue-600">
                              {(game.avgTimeMs / 1000).toFixed(1)}s
                            </p>
                            <p className="text-xs text-gray-500">moy.</p>
                          </div>
                        )}
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(game.id);
                          }}
                          className="p-2 text-gray-400 hover:text-red-500 transition"
                          title="Supprimer"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {history.hasMore && (
              <div className="text-center">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
                >
                  {loading ? 'Chargement...' : 'Charger plus'}
                </button>
              </div>
            )}

            <p className="text-center text-gray-500 text-sm">
              {history.total} partie{history.total > 1 ? 's' : ''} au total
            </p>
          </>
        )}
      </main>
    </>
  );
}
