import Link from 'next/link';
import { useAuthStore } from '../store/auth';
import { logout } from '../lib/api';

export default function Header() {
  const user = useAuthStore(s => s.user);
  const access = useAuthStore(s => s.accessToken);
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', borderBottom: '1px solid #eee' }}>
      <nav style={{ display: 'flex', gap: 12 }}>
        <Link href="/">Accueil</Link>
        <Link href="/quizzes">Quizzes</Link>
        <Link href="/host">Host</Link>
      </nav>
      <div>
        {access ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ color: '#555' }}>Connecté{user?.username ? `: ${user.username}` : ''}</span>
            <button onClick={logout}>Logout</button>
          </div>
        ) : (
          <Link href="/login">Login / Register</Link>
        )}
      </div>
    </header>
  );
}
