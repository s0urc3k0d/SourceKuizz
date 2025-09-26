import { useMemo, useState } from 'react';
import { wsApi } from '../lib/ws';
import { useReactionsStore } from '../store/reactions';
import { useSessionStore } from '../store/session';

const DEFAULT_EMOJIS = ['👍','👏','🔥','🎉','❤️','😂','🤯','😮'];

export function ReactionBar({ socket, code }: { socket: any; code?: string }) {
  const [open, setOpen] = useState(true);
  const reactions = useReactionsStore(s => s.reactions);
  const session = useSessionStore();
  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reactions) {
      map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
    }
    return [...map.entries()].map(([emoji, count]) => ({ emoji, count })).sort((a,b)=>b.count-a.count);
  }, [reactions]);

  const send = (emoji: string) => {
    if (!socket || !code) return;
    wsApi(socket).reaction({ emoji, code });
  };

  const disabledForUser = useMemo(() => {
    if (!code) return true;
    if (!session.isSpectator) return false;
    // spectator: only if allowed
    return !session.allowSpectatorReactions;
  }, [code, session.isSpectator, session.allowSpectatorReactions]);

  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, display: 'grid', gap: 8, zIndex: 50 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={()=>setOpen(o=>!o)}>{open ? '−' : '+'}</button>
        <div style={{ fontSize: 12, color: '#666' }}>Réactions</div>
      </div>
      {open && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 320 }}>
          {DEFAULT_EMOJIS.map(e => (
            <button key={e} onClick={()=>send(e)} disabled={disabledForUser} title={disabledForUser ? 'Réactions désactivées' : 'Envoyer une réaction'}>{e}</button>
          ))}
        </div>
      )}
      {reactions.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', background: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 6 }}>
          {grouped.map(g => (
            <span key={g.emoji} style={{ fontSize: 18 }}>
              {g.emoji} × {g.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
