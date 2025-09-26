import { useEffect, useState } from 'react';
import { useUIStore } from '../../src/store/ui';
import { useRouter } from 'next/router';
import { useAuthStore } from '../../src/store/auth';
import { apiFetch } from '../../src/lib/api';
import { useAuthGuard } from '../../src/lib/useAuthGuard';

type Quiz = { id: string; title: string; description?: string | null; createdAt?: string; updatedAt?: string };

export default function QuizzesPage() {
  const addToast = useUIStore((s) => s.addToast);
  useAuthGuard();
  const access = useAuthStore(s => s.accessToken);
  const [loading, setLoading] = useState<boolean>(true);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [editing, setEditing] = useState<Record<string, { title: string; description: string }>>({});
  const router = useRouter();

  useEffect(() => { if (!access) { setLoading(false); return; } refresh(); }, [access]);

  async function refresh() {
    setLoading(true);
    try {
  const res = await apiFetch('/quizzes');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list: Quiz[] = await res.json();
      setQuizzes(list);
    } catch (e: any) {
      addToast({ type: 'error', message: 'Chargement des quizzes échoué' });
    } finally {
      setLoading(false);
    }
  }

  async function createQuiz() {
    if (!newTitle.trim()) { addToast({ type: 'warning', message: 'Titre requis' }); return; }
    try {
      const res = await apiFetch('/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle.trim(), description: newDesc || undefined }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created: Quiz = await res.json();
      setQuizzes((q) => [created, ...q]);
      setNewTitle(''); setNewDesc('');
      addToast({ type: 'success', message: 'Quiz créé' });
    } catch {
      addToast({ type: 'error', message: 'Création échouée' });
    }
  }

  function startEdit(q: Quiz) {
    setEditing((e) => ({ ...e, [q.id]: { title: q.title, description: q.description || '' } }));
  }

  function cancelEdit(id: string) {
    setEditing((e) => { const n = { ...e }; delete n[id]; return n; });
  }

  async function saveEdit(id: string) {
    const patch = editing[id];
    if (!patch) return;
    try {
      const res = await apiFetch(`/quizzes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: patch.title, description: patch.description || undefined }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const updated: Quiz = await res.json();
      setQuizzes((qs) => qs.map((q) => (q.id === id ? updated : q)));
      cancelEdit(id);
      addToast({ type: 'success', message: 'Quiz mis à jour' });
    } catch {
      addToast({ type: 'error', message: 'Mise à jour échouée' });
    }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer ce quiz ?')) return;
    try {
  const res = await apiFetch(`/quizzes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setQuizzes((qs) => qs.filter((q) => q.id !== id));
      addToast({ type: 'success', message: 'Quiz supprimé' });
    } catch {
      addToast({ type: 'error', message: 'Suppression échouée' });
    }
  }

  function useInHost(id: string) {
    try { localStorage.setItem('quizId', id); } catch {}
    router.push('/host');
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1>Mes Quizzes</h1>
      {!access && (
        <div style={{ color: '#555' }}>Vous devez vous authentifier (via /host ou /play) pour voir vos quizzes.</div>
      )}
      <section style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
        <h3>Créer un quiz</h3>
        <input placeholder="Titre" value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} />
        <textarea placeholder="Description (optionnelle)" value={newDesc} onChange={(e)=>setNewDesc(e.target.value)} />
        <div>
          <button disabled={!access || !newTitle.trim()} onClick={createQuiz}>Créer</button>
        </div>
      </section>
      <section>
        <h3>Liste</h3>
        {loading ? (
          <div>Chargement…</div>
        ) : quizzes.length === 0 ? (
          <div>Aucun quiz pour le moment.</div>
        ) : (
          <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none', maxWidth: 800 }}>
            {quizzes.map((q) => {
              const ed = editing[q.id];
              return (
                <li key={q.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}>
                  {!ed ? (
                    <>
                      <div style={{ fontWeight: 600 }}>{q.title}</div>
                      {q.description && <div style={{ color: '#555' }}>{q.description}</div>}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button onClick={() => startEdit(q)}>Éditer</button>
                        <button onClick={() => remove(q.id)} style={{ color: '#a00' }}>Supprimer</button>
                        <button onClick={() => useInHost(q.id)}>Utiliser dans Host</button>
                        <button onClick={() => router.push(`/quizzes/${q.id}`)}>Questions</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input value={ed.title} onChange={(e) => setEditing((s) => ({ ...s, [q.id]: { ...s[q.id], title: e.target.value } }))} />
                      <textarea value={ed.description} onChange={(e) => setEditing((s) => ({ ...s, [q.id]: { ...s[q.id], description: e.target.value } }))} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => saveEdit(q.id)} disabled={!ed.title.trim()}>Enregistrer</button>
                        <button onClick={() => cancelEdit(q.id)}>Annuler</button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
