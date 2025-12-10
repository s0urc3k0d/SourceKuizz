import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/auth';
import { logout } from '../lib/api';
import { useState } from 'react';

export default function Header() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const access = useAuthStore(s => s.accessToken);
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    router.push('/');
  }

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
        <span style={{ fontSize: 28 }}>🎯</span>
        <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>SourceKuizz</span>
      </Link>

      {/* Navigation Desktop */}
      <nav className="flex gap-2" style={{ display: 'flex' }}>
        <NavLink href="/" active={router.pathname === '/'}>Accueil</NavLink>
        {access && (
          <>
            <NavLink href="/quizzes" active={router.pathname.startsWith('/quizzes')}>Mes Quizzes</NavLink>
            <NavLink href="/host" active={router.pathname === '/host'}>Heberger</NavLink>
          </>
        )}
      </nav>

      {/* User Menu */}
      <div style={{ position: 'relative' }}>
        {access ? (
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="btn-ghost"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
              }}
            >
              <div className="avatar" style={{ width: 32, height: 32, fontSize: 14 }}>
                {user?.username?.charAt(0).toUpperCase() || '?'}
              </div>
              <span className="font-semibold" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.username || 'Utilisateur'}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {menuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 50 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  className="card animate-fade-in"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    minWidth: 180,
                    padding: 8,
                    zIndex: 51,
                  }}
                >
                  <Link href="/quizzes" onClick={() => setMenuOpen(false)}>
                    <div className="dropdown-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Mes Quizzes
                    </div>
                  </Link>
                  <Link href="/host" onClick={() => setMenuOpen(false)}>
                    <div className="dropdown-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Heberger
                    </div>
                  </Link>
                  <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                  <Link href="/profile" onClick={() => setMenuOpen(false)}>
                    <div className="dropdown-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Mon Profil
                    </div>
                  </Link>
                  <Link href="/history" onClick={() => setMenuOpen(false)}>
                    <div className="dropdown-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Historique
                    </div>
                  </Link>
                  <Link href="/settings" onClick={() => setMenuOpen(false)}>
                    <div className="dropdown-item">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Paramètres
                    </div>
                  </Link>
                  <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                  <button
                    onClick={() => { handleLogout(); setMenuOpen(false); }}
                    className="dropdown-item"
                    style={{ width: '100%', color: 'var(--error)' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Deconnexion
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Link href="/login">
              <button className="btn-ghost">Se connecter</button>
            </Link>
            <Link href="/login">
              <button>S'inscrire</button>
            </Link>
          </div>
        )}
      </div>

      <style jsx>{`
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background var(--transition);
          color: var(--text);
          text-decoration: none;
          font-size: 14px;
          background: transparent;
          border: none;
          text-align: left;
        }
        .dropdown-item:hover {
          background: var(--bg);
        }
      `}</style>
    </header>
  );
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <span style={{
        padding: '8px 16px',
        borderRadius: 'var(--radius)',
        fontWeight: 500,
        fontSize: 14,
        color: active ? 'var(--primary)' : 'var(--text-muted)',
        background: active ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
        transition: 'all var(--transition)',
      }}>
        {children}
      </span>
    </Link>
  );
}
