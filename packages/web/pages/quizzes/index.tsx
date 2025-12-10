import { useEffect, useState } from 'react';
import { useUIStore } from '../../src/store/ui';
import { useRouter } from 'next/router';
import { useAuthStore } from '../../src/store/auth';
import { apiFetch } from '../../src/lib/api';
import Link from 'next/link';

type Quiz = {
  id: string;
  title: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: { questions: number };
};

type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function QuizzesPage() {
  const router = useRouter();
  const addToast = useUIStore((s) => s.addToast);
  const access = useAuthStore(s => s.accessToken);
  const [loading, setLoading] = useState<boolean>(true);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!access) {
      setLoading(false);
      return;
    }
    refresh(currentPage);
  }, [access, currentPage]);

  async function refresh(page = 1) {
    setLoading(true);
    try {
      const res = await apiFetch(`/quizzes?page=${page}&limit=12`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const result = await res.json();
      // Support ancien format (array) et nouveau format (paginé)
      if (Array.isArray(result)) {
        setQuizzes(result);
        setPagination(null);
      } else {
        setQuizzes(result.data || []);
        setPagination(result.meta || null);
      }
    } catch (e: any) {
      addToast({ type: 'error', message: 'Chargement des quizzes echoue' });
    } finally {
      setLoading(false);
    }
  }

  async function createQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      addToast({ type: 'warning', message: 'Titre requis' });
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), description: newDesc || undefined })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created: Quiz = await res.json();
      setQuizzes((q) => [created, ...q]);
      setNewTitle('');
      setNewDesc('');
      setShowCreate(false);
      addToast({ type: 'success', message: 'Quiz cree !' });
      // Rediriger vers l'edition
      router.push(`/quizzes/${created.id}`);
    } catch {
      addToast({ type: 'error', message: 'Creation echouee' });
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce quiz ?')) return;
    try {
      const res = await apiFetch(`/quizzes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setQuizzes((qs) => qs.filter((q) => q.id !== id));
      addToast({ type: 'success', message: 'Quiz supprime' });
    } catch {
      addToast({ type: 'error', message: 'Suppression echouee' });
    }
  }

  function useInHost(id: string) {
    try {
      localStorage.setItem('quizId', id);
    } catch {}
    router.push('/host');
  }

  // Rediriger vers login si pas connecte
  if (!access) {
    return (
      <div className="page flex flex-col items-center justify-center gap-4" style={{ minHeight: '60vh' }}>
        <div style={{ fontSize: 64 }}>📚</div>
        <h1>Mes Quizzes</h1>
        <p className="text-muted">Connectez-vous pour gerer vos quizzes</p>
        <Link href="/login"><button className="btn-lg">Se connecter</button></Link>
      </div>
    );
  }

  return (
    <div className="page container">
      {/* Header */}
      <div className="flex items-center justify-between mb-6" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Mes Quizzes</h1>
          <p className="text-muted">Creez et gerez vos quizzes</p>
        </div>
        <button onClick={() => setShowCreate(true)}>
          + Nouveau Quiz
        </button>
      </div>

      {/* Modal creation */}
      {showCreate && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 100,
            }}
            onClick={() => setShowCreate(false)}
          />
          <div
            className="card animate-fade-in"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '100%',
              maxWidth: 480,
              zIndex: 101,
              padding: 32,
            }}
          >
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20 }}>Creer un quiz</h2>
            <form onSubmit={createQuiz} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
                  Titre *
                </label>
                <input
                  placeholder="Mon super quiz"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-semibold" style={{ display: 'block', marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  placeholder="Description optionnelle..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                  Annuler
                </button>
                <button type="submit" disabled={creating || !newTitle.trim()}>
                  {creating ? 'Creation...' : 'Creer'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center" style={{ padding: 60 }}>
          <div className="animate-pulse text-muted">Chargement...</div>
        </div>
      ) : quizzes.length === 0 ? (
        <div className="card text-center" style={{ padding: 60 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>📝</div>
          <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Aucun quiz</h3>
          <p className="text-muted mb-4">Creez votre premier quiz pour commencer</p>
          <button onClick={() => setShowCreate(true)}>+ Creer un quiz</button>
        </div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {quizzes.map((q) => (
              <div key={q.id} className="card card-hover" style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{q.title}</h3>
                  {q.description && (
                    <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                      {q.description}
                    </p>
                  )}
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <span className="badge">
                      {q._count?.questions ?? '?'} questions
                    </span>
                    {q.createdAt && (
                      <span className="badge">
                        {new Date(q.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
                  <button
                    className="btn-sm"
                    onClick={() => useInHost(q.id)}
                  >
                    Lancer
                  </button>
                  <button
                    className="btn-sm btn-secondary"
                    onClick={() => router.push(`/quizzes/${q.id}`)}
                  >
                    Editer
                  </button>
                  <button
                    className="btn-sm btn-ghost"
                    onClick={() => remove(q.id)}
                    style={{ color: 'var(--error)' }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                className="btn-sm btn-secondary"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                ← Précédent
              </button>
              <span className="text-muted">
                Page {pagination.page} / {pagination.totalPages}
                <span className="text-sm ml-2">({pagination.total} quizzes)</span>
              </span>
              <button
                className="btn-sm btn-secondary"
                disabled={currentPage >= pagination.totalPages}
                onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
