import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useUIStore } from '../../src/store/ui';
import { useAuthStore } from '../../src/store/auth';
import { apiFetch } from '../../src/lib/api';
import { useAuthGuard } from '../../src/lib/useAuthGuard';
import Header from '../../src/components/Header';

type Option = { id?: string; label: string; isCorrect?: boolean; weight?: number };
type Question = { id: string; type: 'mcq'|'multi'|'bool'; prompt: string; mediaUrl?: string|null; timeLimitMs: number; order: number; options: Option[] };

export default function QuizEditorPage() {
  const { query, push } = useRouter();
  const quizId = typeof query.id === 'string' ? query.id : '';
  const access = useAuthStore(s => s.accessToken);
  useAuthGuard();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [creating, setCreating] = useState<{ type: 'mcq'|'multi'|'bool'; prompt: string; mediaUrl: string; timeLimitMs: number; options: Option[] }>({ type: 'mcq', prompt: '', mediaUrl: '', timeLimitMs: 15000, options: [ { label: '', isCorrect: true, weight: 1 }, { label: '', isCorrect: false, weight: 1 } ] });
  const [editing, setEditing] = useState<Record<string, Question>>({});
  const addToast = useUIStore(s => s.addToast);

  useEffect(()=>{ if (!quizId || !access) { setLoading(false); return; } refresh(); }, [quizId, access]);

  async function refresh() {
    setLoading(true);
    try {
  const res = await apiFetch(`/quizzes/${quizId}/questions`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list: Question[] = await res.json();
      setQuestions(list);
    } catch { addToast({ type: 'error', message: 'Chargement des questions échoué' }); }
    finally { setLoading(false); }
  }

  function updateCreatingOption(idx: number, patch: Partial<Option>) {
    setCreating((c) => ({ ...c, options: c.options.map((o, i) => i === idx ? { ...o, ...patch } : o) }));
  }
  function addCreatingOption() { setCreating((c)=> ({ ...c, options: [...c.options, { label: '', isCorrect: false, weight: 1 }] })); }
  function removeCreatingOption(idx: number) { setCreating((c)=> ({ ...c, options: c.options.filter((_, i)=> i!==idx) })); }

  async function createQuestion() {
    const body = {
      type: creating.type,
      prompt: creating.prompt.trim(),
      mediaUrl: creating.mediaUrl || undefined,
      timeLimitMs: creating.timeLimitMs,
      options: creating.options.map(o => ({ label: o.label.trim(), isCorrect: !!o.isCorrect, weight: o.weight ?? 1 })),
    };
    if (!body.prompt) { addToast({ type: 'warning', message: 'Prompt requis' }); return; }
    if (body.options.length < 2) { addToast({ type: 'warning', message: 'Au moins 2 options' }); return; }
    if (!body.options.some(o=>o.isCorrect)) { addToast({ type: 'warning', message: 'Au moins 1 option correcte' }); return; }
    try {
      const res = await apiFetch(`/quizzes/${quizId}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created: Question = await res.json();
      setQuestions((qs)=> [...qs, created]);
      setCreating({ type: 'mcq', prompt: '', mediaUrl: '', timeLimitMs: 15000, options: [ { label: '', isCorrect: true, weight: 1 }, { label: '', isCorrect: false, weight: 1 } ] });
      addToast({ type: 'success', message: 'Question créée' });
    } catch { addToast({ type: 'error', message: 'Création échouée' }); }
  }

  function startEdit(q: Question) { setEditing((e)=> ({ ...e, [q.id]: JSON.parse(JSON.stringify(q)) })); }
  function cancelEdit(id: string) { setEditing((e)=> { const n={...e}; delete n[id]; return n; }); }
  function updateEdit(id: string, patch: Partial<Question>) { setEditing((e)=> ({ ...e, [id]: { ...e[id], ...patch } })); }
  function updateEditOption(id: string, idx: number, patch: Partial<Option>) { setEditing((e)=> ({ ...e, [id]: { ...e[id], options: e[id].options.map((o,i)=> i===idx ? { ...o, ...patch } : o) } })); }
  function addEditOption(id: string) { setEditing((e)=> ({ ...e, [id]: { ...e[id], options: [...e[id].options, { label: '', isCorrect: false, weight: 1 }] } })); }
  function removeEditOption(id: string, idx: number) { setEditing((e)=> ({ ...e, [id]: { ...e[id], options: e[id].options.filter((_,i)=> i!==idx) } })); }

  async function saveEdit(id: string) {
    const q = editing[id]; if (!q) return;
    const body = {
      type: q.type,
      prompt: q.prompt.trim(),
      mediaUrl: q.mediaUrl || undefined,
      timeLimitMs: q.timeLimitMs,
      options: q.options.map(o => ({ label: (o.label||'').trim(), isCorrect: !!o.isCorrect, weight: o.weight ?? 1 })),
    };
    if (!body.prompt) { addToast({ type: 'warning', message: 'Prompt requis' }); return; }
    if (body.options.length < 2) { addToast({ type: 'warning', message: 'Au moins 2 options' }); return; }
    if (!body.options.some(o=>o.isCorrect)) { addToast({ type: 'warning', message: 'Au moins 1 option correcte' }); return; }
    try {
      const res = await apiFetch(`/quizzes/${quizId}/questions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const updated: Question = await res.json();
      setQuestions((qs)=> qs.map(x => x.id === id ? updated : x));
      cancelEdit(id);
      addToast({ type: 'success', message: 'Question mise à jour' });
    } catch { addToast({ type: 'error', message: 'Mise à jour échouée' }); }
  }

  async function removeQuestion(id: string) {
    if (!confirm('Supprimer cette question ?')) return;
    try {
  const res = await apiFetch(`/quizzes/${quizId}/questions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setQuestions((qs)=> qs.filter((x)=> x.id !== id));
      addToast({ type: 'success', message: 'Question supprimée' });
    } catch { addToast({ type: 'error', message: 'Suppression échouée' }); }
  }

  async function duplicateQuestion(id: string) {
    try {
      const res = await apiFetch(`/quizzes/${quizId}/questions/${id}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const created: Question = await res.json();
      setQuestions((qs)=> [...qs, created]);
      addToast({ type: 'success', message: 'Question dupliquée' });
    } catch { addToast({ type: 'error', message: 'Duplication échouée' }); }
  }

  async function reorder(newOrder: Question[]) {
    try {
      const res = await apiFetch(`/quizzes/${quizId}/questions/reorder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderedIds: newOrder.map(q=>q.id) }) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      setQuestions(newOrder.map((q, idx)=> ({ ...q, order: idx })));
    } catch { addToast({ type: 'error', message: 'Réordonnancement échoué' }); }
  }

  function moveUp(id: string) {
    const idx = questions.findIndex(q => q.id === id); if (idx <= 0) return;
    const reordered = [...questions];
    const tmp = reordered[idx-1]; reordered[idx-1] = reordered[idx]; reordered[idx] = tmp;
    reorder(reordered);
  }
  function moveDown(id: string) {
    const idx = questions.findIndex(q => q.id === id); if (idx === -1 || idx >= questions.length-1) return;
    const reordered = [...questions];
    const tmp = reordered[idx+1]; reordered[idx+1] = reordered[idx]; reordered[idx] = tmp;
    reorder(reordered);
  }

  return (
    <>
      <Header />
      <main style={{ padding: 24, display: 'grid', gap: 16 }}>
        <h1>Édition Quiz – {quizId}</h1>
        <button onClick={()=>push('/quizzes')}>← Retour</button>

      <section style={{ display: 'grid', gap: 8, maxWidth: 800 }}>
        <h3>Créer une question</h3>
        <div style={{ display: 'grid', gap: 6 }}>
          <label>Type:
            <select value={creating.type} onChange={(e)=> setCreating((c)=> ({ ...c, type: e.target.value as any }))}>
              <option value="mcq">QCM (une correcte)</option>
              <option value="multi">Multi-réponses</option>
              <option value="bool">Vrai/Faux</option>
            </select>
          </label>
          <input placeholder="Prompt" value={creating.prompt} onChange={(e)=> setCreating((c)=> ({ ...c, prompt: e.target.value }))} />
          <input placeholder="Media URL (optionnel)" value={creating.mediaUrl} onChange={(e)=> setCreating((c)=> ({ ...c, mediaUrl: e.target.value }))} />
          <label>Temps (ms): <input type="number" value={creating.timeLimitMs} onChange={(e)=> setCreating((c)=> ({ ...c, timeLimitMs: Number(e.target.value||0) }))} /></label>
          <div style={{ border: '1px dashed #ddd', padding: 8, borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Options</div>
            {creating.options.map((o, idx)=> (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <input placeholder={`Option #${idx+1}`} value={o.label} onChange={(e)=> updateCreatingOption(idx, { label: e.target.value })} />
                <label><input type="checkbox" checked={!!o.isCorrect} onChange={(e)=> updateCreatingOption(idx, { isCorrect: e.target.checked })} /> Correcte</label>
                <label>Poids: <input type="number" min={1} max={10} value={o.weight ?? 1} onChange={(e)=> updateCreatingOption(idx, { weight: Number(e.target.value||1) })} /></label>
                <button onClick={()=> removeCreatingOption(idx)} disabled={creating.options.length<=2}>Suppr</button>
              </div>
            ))}
            <div>
              <button onClick={addCreatingOption}>Ajouter une option</button>
            </div>
          </div>
          <div>
            <button onClick={createQuestion}>Créer la question</button>
          </div>
        </div>
      </section>

      <section>
        <h3>Questions ({questions.length})</h3>
        {loading ? <div>Chargement…</div> : (
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {questions.map((q) => {
              const ed = editing[q.id];
              return (
                <li key={q.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                  {!ed ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div><b>#{q.order+1}</b> – {q.prompt} <small style={{ color: '#666' }}>({q.type}, {q.timeLimitMs}ms)</small></div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button onClick={()=> moveUp(q.id)} disabled={q.order===0}>Monter</button>
                          <button onClick={()=> moveDown(q.id)} disabled={q.order===questions.length-1}>Descendre</button>
                          <button onClick={()=> duplicateQuestion(q.id)}>Dupliquer</button>
                          <button onClick={()=> startEdit(q)}>Éditer</button>
                          <button onClick={()=> removeQuestion(q.id)} style={{ color: '#a00' }}>Supprimer</button>
                        </div>
                      </div>
                      <ol>
                        {q.options.map((o, i)=> (
                          <li key={i} style={{ color: o.isCorrect ? '#2e7d32' : undefined }}>
                            {o.label} {o.isCorrect ? '✓' : ''} {o.weight && o.weight!==1 ? `(poids ${o.weight})` : ''}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input value={ed.prompt} onChange={(e)=> updateEdit(q.id, { prompt: e.target.value })} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <label>Type:
                          <select value={ed.type} onChange={(e)=> updateEdit(q.id, { type: e.target.value as any })}>
                            <option value="mcq">QCM</option>
                            <option value="multi">Multi</option>
                            <option value="bool">Bool</option>
                          </select>
                        </label>
                        <label>Temps (ms): <input type="number" value={ed.timeLimitMs} onChange={(e)=> updateEdit(q.id, { timeLimitMs: Number(e.target.value||0) })} /></label>
                        <input placeholder="Media URL" value={ed.mediaUrl || ''} onChange={(e)=> updateEdit(q.id, { mediaUrl: e.target.value })} />
                      </div>
                      <div style={{ border: '1px dashed #ddd', padding: 8, borderRadius: 6 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Options</div>
                        {ed.options.map((o, idx)=> (
                          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                            <input placeholder={`Option #${idx+1}`} value={o.label} onChange={(e)=> updateEditOption(q.id, idx, { label: e.target.value })} />
                            <label><input type="checkbox" checked={!!o.isCorrect} onChange={(e)=> updateEditOption(q.id, idx, { isCorrect: e.target.checked })} /> Correcte</label>
                            <label>Poids: <input type="number" min={1} max={10} value={o.weight ?? 1} onChange={(e)=> updateEditOption(q.id, idx, { weight: Number(e.target.value||1) })} /></label>
                            <button onClick={()=> removeEditOption(q.id, idx)} disabled={ed.options.length<=2}>Suppr</button>
                          </div>
                        ))}
                        <div>
                          <button onClick={()=> addEditOption(q.id)}>Ajouter une option</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={()=> saveEdit(q.id)}>Enregistrer</button>
                        <button onClick={()=> cancelEdit(q.id)}>Annuler</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
    </>
  );
}
