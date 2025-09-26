import { useMemo } from 'react';
import { useReactionsStore } from '../store/reactions';

function hashToUnit(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Convert to [0,1)
  return ((h >>> 0) % 10000) / 10000;
}

export function FloatingReactions() {
  const reactions = useReactionsStore(s => s.reactions);
  const items = useMemo(() => reactions.map(r => {
    const seed = hashToUnit(r.id + ':' + r.playerId + ':' + r.ts);
    const leftVw = 8 + seed * 84; // 8vw .. 92vw
    const delay = (seed * 0.25).toFixed(2); // 0..0.25s
    const drift = (seed - 0.5) * 30; // -15 .. +15 px horizontal drift
    const duration = 2 + (seed * 1.5); // 2 .. 3.5s
    return { ...r, leftVw, delay, drift, duration };
  }), [reactions]);

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, top: 0, pointerEvents: 'none', zIndex: 40 }}>
      {items.map(it => (
        <div
          key={it.id}
          style={{
            position: 'fixed',
            bottom: 16,
            left: `${it.leftVw}vw`,
            fontSize: 28,
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.2))',
            animation: `sk-float-up ${it.duration}s ease-out ${it.delay}s forwards, sk-drift ${it.duration}s ease-in-out ${it.delay}s forwards`,
            transform: `translateY(0)`,
            opacity: 0,
          }}
        >
          {it.emoji}
        </div>
      ))}
      <style jsx global>{`
        @keyframes sk-float-up {
          0% { transform: translateY(0) scale(1); opacity: 0.0; }
          10% { opacity: 0.9; }
          100% { transform: translateY(-150px) scale(1.25); opacity: 0; }
        }
        @keyframes sk-drift {
          0% { transform: translateX(0); }
          50% { transform: translateX(8px); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
