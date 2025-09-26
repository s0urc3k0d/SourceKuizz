import { useEffect } from 'react';
import { useUIStore } from '../store/ui';

export default function Toasts() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  useEffect(() => {
    const timers = toasts.map((t) => setTimeout(() => removeToast(t.id), 4000));
    return () => { timers.forEach(clearTimeout); };
  }, [toasts, removeToast]);

  return (
    <div style={{ position: 'fixed', right: 16, top: 16, display: 'grid', gap: 8, zIndex: 1000 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#ffefef' : t.type === 'success' ? '#efffed' : t.type === 'warning' ? '#fff8e6' : '#eef5ff',
          border: '1px solid #ccc',
          borderLeft: `4px solid ${t.type === 'error' ? '#e53935' : t.type === 'success' ? '#2e7d32' : t.type === 'warning' ? '#f9a825' : '#1e88e5'}`,
          padding: '8px 12px',
          borderRadius: 6,
          color: '#333',
          minWidth: 260,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
