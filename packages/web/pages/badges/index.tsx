import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Header from '../../src/components/Header';
import { useAuthStore } from '../../src/store/auth';

interface Badge {
  code: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  xpReward: number;
}

interface UserBadge {
  id: string;
  earnedAt: string;
  badge: Badge;
}

interface GamificationProfile {
  badges: UserBadge[];
  xp: {
    level: number;
    totalXp: number;
    currentLevelXp: number;
    xpForNextLevel: number;
    xpProgress: number;
  };
  streak: {
    currentStreak: number;
    longestStreak: number;
    lastPlayedAt: string | null;
    isActiveToday: boolean;
    willExpireIn: number | null;
  };
}

const RARITY_COLORS: Record<string, string> = {
  common: 'from-gray-400 to-gray-600',
  rare: 'from-blue-400 to-blue-600',
  epic: 'from-purple-400 to-purple-600',
  legendary: 'from-yellow-400 to-orange-500',
};

const RARITY_BORDER: Record<string, string> = {
  common: 'border-gray-500',
  rare: 'border-blue-500',
  epic: 'border-purple-500',
  legendary: 'border-yellow-500',
};

const CATEGORY_ICONS: Record<string, string> = {
  achievement: '🏆',
  milestone: '📊',
  streak: '🔥',
  special: '⭐',
};

export default function BadgesPage() {
  const router = useRouter();
  const { userId } = router.query;
  const { accessToken, userId: myUserId } = useAuthStore();
  
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const targetUserId = userId as string || myUserId;
  const isOwnProfile = !userId || userId === myUserId;

  useEffect(() => {
    if (targetUserId) {
      fetchData();
    }
  }, [targetUserId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const [profileRes, badgesRes] = await Promise.all([
        fetch(`/api/gamification/profile/${targetUserId}`, { headers }),
        fetch('/api/gamification/badges'),
      ]);

      if (!profileRes.ok) throw new Error('Erreur lors du chargement du profil');
      
      const profileData = await profileRes.json();
      const badgesData = await badgesRes.json();

      setProfile(profileData);
      setAllBadges(badgesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const earnedBadgeCodes = new Set(profile?.badges.map(b => b.badge.code) || []);
  
  const categories = [...new Set(allBadges.map(b => b.category))];
  
  const filteredBadges = selectedCategory
    ? allBadges.filter(b => b.category === selectedCategory)
    : allBadges;

  const earnedCount = profile?.badges.length || 0;
  const totalCount = allBadges.length;
  const progress = totalCount > 0 ? (earnedCount / totalCount) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <Header />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <Header />
        <div className="text-center py-12 text-red-400">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <Header />
      
      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-2">
          🎖️ {isOwnProfile ? 'Mes Badges' : 'Badges'}
        </h1>
        
        {/* Progress */}
        <div className="text-center mb-8">
          <p className="text-gray-400 mb-2">
            {earnedCount} / {totalCount} badges débloqués
          </p>
          <div className="w-64 mx-auto bg-gray-700 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Stats rapides */}
        {profile && (
          <div className="grid grid-cols-3 gap-4 mb-8 max-w-2xl mx-auto">
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-indigo-400">
                {profile.xp.level}
              </div>
              <div className="text-gray-400 text-sm">Niveau</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-orange-400">
                {profile.streak.currentStreak}
              </div>
              <div className="text-gray-400 text-sm">Streak 🔥</div>
            </div>
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-purple-400">
                {profile.xp.totalXp.toLocaleString()}
              </div>
              <div className="text-gray-400 text-sm">XP Total</div>
            </div>
          </div>
        )}

        {/* Category filters */}
        <div className="flex justify-center flex-wrap gap-2 mb-8">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedCategory === null
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Tous
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {CATEGORY_ICONS[cat] || '📌'} {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Badges grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredBadges.map(badge => {
            const isEarned = earnedBadgeCodes.has(badge.code);
            const userBadge = profile?.badges.find(b => b.badge.code === badge.code);
            
            return (
              <div
                key={badge.code}
                className={`relative bg-gray-800 rounded-xl p-4 border-2 transition-all ${
                  isEarned
                    ? `${RARITY_BORDER[badge.rarity]} shadow-lg`
                    : 'border-gray-700 opacity-50'
                }`}
              >
                {/* Badge icon */}
                <div
                  className={`w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-3xl ${
                    isEarned
                      ? `bg-gradient-to-br ${RARITY_COLORS[badge.rarity]}`
                      : 'bg-gray-700'
                  }`}
                >
                  {isEarned ? CATEGORY_ICONS[badge.category] || '🏅' : '🔒'}
                </div>

                {/* Badge info */}
                <h3 className="font-bold text-center mb-1">{badge.name}</h3>
                <p className="text-gray-400 text-sm text-center mb-2">
                  {badge.description}
                </p>

                {/* Rarity & XP */}
                <div className="flex justify-between items-center text-xs">
                  <span className={`capitalize ${
                    badge.rarity === 'legendary' ? 'text-yellow-400' :
                    badge.rarity === 'epic' ? 'text-purple-400' :
                    badge.rarity === 'rare' ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {badge.rarity}
                  </span>
                  <span className="text-indigo-400">+{badge.xpReward} XP</span>
                </div>

                {/* Earned date */}
                {isEarned && userBadge && (
                  <div className="mt-2 text-xs text-center text-green-400">
                    ✓ Obtenu le {new Date(userBadge.earnedAt).toLocaleDateString('fr-FR')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
