import Link from 'next/link';
import { useAuthStore } from '../src/store/auth';
import { useState } from 'react';
import { useRouter } from 'next/router';
import Header from '../src/components/Header';

export default function HomePage() {
  const router = useRouter();
  const access = useAuthStore(s => s.accessToken);
  const user = useAuthStore(s => s.user);
  const [joinCode, setJoinCode] = useState('');

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (joinCode.trim()) {
      router.push(`/play/${joinCode.trim().toUpperCase()}`);
    }
  }

  return (
    <>
      <Header />
      <div className="page" style={{ padding: 0 }}>
      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '80px 24px',
        textAlign: 'center',
      }}>
        <div className="container">
          <div style={{ fontSize: 72, marginBottom: 16 }}>🎯</div>
          <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 16, lineHeight: 1.1 }}>
            SourceKuizz
          </h1>
          <p style={{ fontSize: 20, opacity: 0.9, maxWidth: 600, margin: '0 auto 32px', lineHeight: 1.6 }}>
            La plateforme de quiz interactive en temps reel.
            Creez, jouez et partagez des quiz avec vos amis !
          </p>

          {/* Quick Join Form */}
          <form onSubmit={handleJoin} className="flex gap-3 justify-center" style={{ flexWrap: 'wrap', marginBottom: 32 }}>
            <input
              type="text"
              placeholder="Code de la session (ex: ABC123)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{
                width: 240,
                padding: '14px 20px',
                fontSize: 16,
                borderRadius: 'var(--radius)',
                border: 'none',
                textAlign: 'center',
                fontWeight: 600,
                letterSpacing: 2,
              }}
              maxLength={6}
            />
            <button
              type="submit"
              className="btn-lg"
              disabled={!joinCode.trim()}
              style={{ background: 'white', color: '#764ba2' }}
            >
              Rejoindre
            </button>
          </form>

          {/* CTA Buttons */}
          <div className="flex gap-4 justify-center" style={{ flexWrap: 'wrap' }}>
            {access ? (
              <>
                <Link href="/quizzes">
                  <button className="btn-lg" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
                    Mes Quizzes
                  </button>
                </Link>
                <Link href="/host">
                  <button className="btn-lg btn-secondary" style={{ background: 'white', color: '#764ba2' }}>
                    Creer une Session
                  </button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login">
                  <button className="btn-lg" style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}>
                    Se connecter
                  </button>
                </Link>
                <Link href="/login">
                  <button className="btn-lg" style={{ background: 'white', color: '#764ba2' }}>
                    Creer un compte
                  </button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ padding: '80px 24px', background: 'var(--bg)' }}>
        <div className="container">
          <h2 className="text-center" style={{ fontSize: 32, fontWeight: 700, marginBottom: 48 }}>
            Pourquoi SourceKuizz ?
          </h2>
          <div className="grid grid-3" style={{ gap: 32 }}>
            <FeatureCard
              emoji="⚡"
              title="Temps Reel"
              description="Jouez avec vos amis en temps reel grace a notre technologie WebSocket ultra-rapide."
            />
            <FeatureCard
              emoji="🎮"
              title="Ludique"
              description="Scoring dynamique avec bonus de rapidite et streaks pour plus de fun !"
            />
            <FeatureCard
              emoji="📱"
              title="Multi-plateforme"
              description="Jouez depuis n'importe quel appareil - ordinateur, tablette ou smartphone."
            />
            <FeatureCard
              emoji="🔒"
              title="Securise"
              description="Connectez-vous avec Twitch ou creez un compte local en toute securite."
            />
            <FeatureCard
              emoji="📊"
              title="Statistiques"
              description="Suivez vos performances et consultez les leaderboards en direct."
            />
            <FeatureCard
              emoji="🎯"
              title="Simple"
              description="Interface intuitive - creez et partagez un quiz en quelques clics."
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: '80px 24px', background: 'var(--bg-card)' }}>
        <div className="container">
          <h2 className="text-center" style={{ fontSize: 32, fontWeight: 700, marginBottom: 48 }}>
            Comment ca marche ?
          </h2>
          <div className="grid grid-4" style={{ gap: 24 }}>
            <StepCard number={1} title="Creez" description="Creez votre quiz avec vos questions" />
            <StepCard number={2} title="Partagez" description="Partagez le code avec vos joueurs" />
            <StepCard number={3} title="Jouez" description="Lancez la partie et amusez-vous !" />
            <StepCard number={4} title="Gagnez" description="Consultez le classement final" />
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{
        padding: '60px 24px',
        background: 'var(--bg-dark)',
        color: 'white',
        textAlign: 'center',
      }}>
        <div className="container">
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
            Pret a jouer ?
          </h2>
          <p style={{ opacity: 0.8, marginBottom: 24 }}>
            Rejoignez la communaute SourceKuizz des maintenant !
          </p>
          <Link href={access ? '/host' : '/login'}>
            <button className="btn-lg" style={{ background: 'var(--primary)' }}>
              {access ? 'Creer une session' : 'Commencer gratuitement'}
            </button>
          </Link>
        </div>
      </section>
    </div>
    </>
  );
}

function FeatureCard({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <div className="card card-hover text-center" style={{ padding: 32 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{emoji}</div>
      <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <p className="text-muted">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="text-center">
      <div style={{
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 700,
        margin: '0 auto 16px',
      }}>
        {number}
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <p className="text-muted text-sm">{description}</p>
    </div>
  );
}
