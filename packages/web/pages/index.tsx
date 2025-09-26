import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ fontFamily: 'Inter, sans-serif', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1>SourceKuizz</h1>
      <p>Démarrez en tant qu’hôte ou rejoignez une partie existante.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/host"><button>Mode Hôte</button></Link>
        <Link href="/play/DEMO1"><button>Rejoindre (démo)</button></Link>
        <Link href="/spectate/DEMO1"><button>Spectateur (démo)</button></Link>
      </div>
    </main>
  );
}
