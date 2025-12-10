import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../src/store/auth';
import { useUIStore } from '../../src/store/ui';
import { apiFetch } from '../../src/lib/api';
import Header from '../../src/components/Header';

interface Profile {
  id: string;
  userId: string;
  displayName: string | null;
  bio: string | null;
  customAvatarUrl: string | null;
  bannerColor: string;
  showStats: boolean;
  showHistory: boolean;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

interface Stats {
  totalGames: number;
  totalScore: number;
  averageRank: number;
  bestRank: number;
  winCount: number;
  correctRate: number;
  averageTimeMs: number | null;
}

interface GameHistoryItem {
  id: string;
  sessionCode: string;
  quizId: string;
  quizTitle: string;
  score: number;
  rank: number;
  totalPlayers: number;
  correctCount: number;
  totalQuestions: number;
  avgTimeMs: number | null;
  playedAt: string;
}

interface HistoryResponse {
  items: GameHistoryItem[];
  total: number;
  hasMore: boolean;
}

export default function ProfilePage() {
  const router = useRouter();
  const { userId } = router.query as { userId?: string };
  const accessToken = useAuthStore((s) => s.accessToken);
  const currentUserId = useAuthStore((s) => s.userId);
  const addToast = useUIStore((s) => s.addToast);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    displayName: '',
    bio: '',
    bannerColor: '#6366f1',
    showStats: true,
    showHistory: true,
  });

  const isOwnProfile = !userId || userId === currentUserId;

  useEffect(() => {
    if (!router.isReady) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const endpoint = isOwnProfile ? '/profile/me' : `/profile/${userId}`;
        const res = await apiFetch(endpoint);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        setProfile(data.profile);
        setStats(data.stats);

        // Charger l'historique si autorisé
        if (data.profile?.showHistory || isOwnProfile) {
          const historyEndpoint = isOwnProfile ? '/history/me' : `/history/user/${userId}`;
          const historyRes = await apiFetch(historyEndpoint + '?limit=10');
          if (historyRes.ok) {
            setHistory(await historyRes.json());
          }
        }
      } catch (e: any) {
        addToast({ type: 'error', message: e?.message || 'Erreur chargement profil' });
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [router.isReady, userId, isOwnProfile, addToast]);

  useEffect(() => {
    if (profile) {
      setEditForm({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        bannerColor: profile.bannerColor || '#6366f1',
        showStats: profile.showStats,
        showHistory: profile.showHistory,
      });
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      const res = await apiFetch('/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const updated = await res.json();
      setProfile(updated);
      setEditing(false);
      addToast({ type: 'success', message: 'Profil mis à jour' });
    } catch (e: any) {
      addToast({ type: 'error', message: e?.message || 'Erreur sauvegarde' });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded-xl" />
            <div className="h-24 bg-gray-200 rounded-xl" />
          </div>
        </main>
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Header />
        <main className="max-w-4xl mx-auto p-6">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-700">Profil non trouvé</h1>
            <button
              onClick={() => router.push('/')}
              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Retour à l'accueil
            </button>
          </div>
        </main>
      </>
    );
  }

  const avatarUrl = profile.customAvatarUrl || profile.user.avatarUrl || '/default-avatar.png';
  const displayName = profile.displayName || profile.user.username;

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Banner + Avatar */}
        <div
          className="relative h-32 rounded-xl"
          style={{ backgroundColor: profile.bannerColor }}
        >
          <div className="absolute -bottom-12 left-6 flex items-end gap-4">
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-24 h-24 rounded-full border-4 border-white shadow-lg object-cover"
            />
            <div className="pb-2">
              <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
              <p className="text-gray-500">@{profile.user.username}</p>
            </div>
          </div>
          {isOwnProfile && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="absolute top-4 right-4 px-3 py-1 bg-white/80 hover:bg-white rounded-lg text-sm font-medium shadow"
            >
              Modifier
            </button>
          )}
        </div>

        {/* Spacer for avatar overflow */}
        <div className="h-8" />

        {/* Edit Form */}
        {editing && isOwnProfile && (
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold">Modifier le profil</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom d'affichage
              </label>
              <input
                type="text"
                value={editForm.displayName}
                onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder={profile.user.username}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea
                value={editForm.bio}
                onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                rows={3}
                placeholder="Quelques mots sur vous..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Couleur de bannière
              </label>
              <input
                type="color"
                value={editForm.bannerColor}
                onChange={(e) => setEditForm({ ...editForm, bannerColor: e.target.value })}
                className="w-16 h-10 rounded cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editForm.showStats}
                  onChange={(e) => setEditForm({ ...editForm, showStats: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Afficher mes statistiques publiquement</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editForm.showHistory}
                  onChange={(e) => setEditForm({ ...editForm, showHistory: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Afficher mon historique publiquement</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Sauvegarder
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Bio */}
        {profile.bio && !editing && (
          <div className="bg-white rounded-xl shadow p-6">
            <p className="text-gray-700">{profile.bio}</p>
          </div>
        )}

        {/* Stats */}
        {stats && (profile.showStats || isOwnProfile) && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">📊 Statistiques</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Parties jouées" value={stats.totalGames} />
              <StatCard label="Score total" value={stats.totalScore.toLocaleString()} />
              <StatCard label="Victoires" value={stats.winCount} highlight />
              <StatCard label="Meilleur rang" value={stats.bestRank > 0 ? `#${stats.bestRank}` : '-'} />
              <StatCard label="Rang moyen" value={stats.averageRank > 0 ? `#${stats.averageRank.toFixed(1)}` : '-'} />
              <StatCard
                label="Taux de réussite"
                value={`${(stats.correctRate * 100).toFixed(0)}%`}
              />
              <StatCard
                label="Temps moyen"
                value={stats.averageTimeMs ? `${(stats.averageTimeMs / 1000).toFixed(1)}s` : '-'}
              />
            </div>
          </div>
        )}

        {/* History */}
        {history && history.items.length > 0 && (profile.showHistory || isOwnProfile) && (
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">🕹️ Historique récent</h2>
            <div className="space-y-3">
              {history.items.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition cursor-pointer"
                  onClick={() => router.push(`/summary/${game.sessionCode}`)}
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{game.quizTitle}</p>
                    <p className="text-sm text-gray-500">
                      {formatDate(game.playedAt)} • {game.correctCount}/{game.totalQuestions} correct
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-indigo-600">{game.score} pts</p>
                    <p className="text-sm text-gray-500">
                      #{game.rank} / {game.totalPlayers}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {history.hasMore && (
              <button
                onClick={() => router.push(isOwnProfile ? '/history' : `/history/${userId}`)}
                className="mt-4 w-full py-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
              >
                Voir tout l'historique →
              </button>
            )}
          </div>
        )}

        {/* Empty history */}
        {history && history.items.length === 0 && (profile.showHistory || isOwnProfile) && (
          <div className="bg-white rounded-xl shadow p-6 text-center">
            <p className="text-gray-500">Aucune partie jouée pour le moment</p>
            {isOwnProfile && (
              <button
                onClick={() => router.push('/')}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Jouer ma première partie
              </button>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? 'bg-yellow-50' : 'bg-gray-50'}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-yellow-600' : 'text-gray-900'}`}>{value}</p>
    </div>
  );
}
