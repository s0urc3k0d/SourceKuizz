import { useState, useEffect } from 'react';
import Header from '../src/components/Header';

type LeaderboardType = 'xp' | 'streak' | 'longest-streak';

interface XPEntry {
  id: string;
  totalXp: number;
  level: number;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

interface StreakEntry {
  userId: string;
  username: string;
  currentStreak: number;
  longestStreak: number;
}

export default function LeaderboardPage() {
  const [type, setType] = useState<LeaderboardType>('xp');
  const [entries, setEntries] = useState<XPEntry[] | StreakEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [type]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gamification/leaderboard?type=${type}&limit=50`);
      if (!res.ok) throw new Error('Erreur lors du chargement du classement');
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const getRarityColor = (level: number) => {
    if (level >= 50) return 'text-yellow-400'; // Legendary
    if (level >= 25) return 'text-purple-400'; // Epic
    if (level >= 10) return 'text-blue-400'; // Rare
    return 'text-gray-400'; // Common
  };

  const getMedalEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  const isXPEntry = (entry: XPEntry | StreakEntry): entry is XPEntry => {
    return 'totalXp' in entry;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <Header />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold text-center mb-8">
          🏆 Classement Global
        </h1>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-gray-800 rounded-lg p-1 flex gap-1">
            <button
              onClick={() => setType('xp')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                type === 'xp'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⭐ Niveau & XP
            </button>
            <button
              onClick={() => setType('streak')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                type === 'streak'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🔥 Streaks Actifs
            </button>
            <button
              onClick={() => setType('longest-streak')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                type === 'longest-streak'
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🏅 Records Streak
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400">
            {error}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            Aucune donnée disponible
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-gray-700 font-semibold text-gray-300">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-5">Joueur</div>
              {type === 'xp' ? (
                <>
                  <div className="col-span-3 text-center">Niveau</div>
                  <div className="col-span-3 text-right">XP Total</div>
                </>
              ) : (
                <>
                  <div className="col-span-3 text-center">
                    {type === 'streak' ? 'Streak Actuel' : 'Meilleur Streak'}
                  </div>
                  <div className="col-span-3 text-right">Record</div>
                </>
              )}
            </div>

            {/* Entries */}
            {entries.map((entry, index) => (
              <div
                key={isXPEntry(entry) ? entry.id : entry.userId}
                className={`grid grid-cols-12 gap-4 px-6 py-4 border-t border-gray-700 items-center ${
                  index < 3 ? 'bg-gray-750' : ''
                }`}
              >
                <div className={`col-span-1 text-center text-xl ${index < 3 ? 'font-bold' : ''}`}>
                  {getMedalEmoji(index + 1)}
                </div>
                <div className="col-span-5 flex items-center gap-3">
                  {isXPEntry(entry) ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                        {entry.user.avatarUrl ? (
                          <img
                            src={entry.user.avatarUrl}
                            alt={entry.user.username}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <span className="text-lg">{entry.user.username.charAt(0).toUpperCase()}</span>
                        )}
                      </div>
                      <span className="font-medium">{entry.user.username}</span>
                    </>
                  ) : (
                    <>
                      <div className="w-10 h-10 rounded-full bg-orange-600 flex items-center justify-center">
                        <span className="text-lg">{entry.username.charAt(0).toUpperCase()}</span>
                      </div>
                      <span className="font-medium">{entry.username}</span>
                    </>
                  )}
                </div>
                {isXPEntry(entry) ? (
                  <>
                    <div className={`col-span-3 text-center font-bold ${getRarityColor(entry.level)}`}>
                      Niv. {entry.level}
                    </div>
                    <div className="col-span-3 text-right text-indigo-400 font-mono">
                      {entry.totalXp.toLocaleString()} XP
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-span-3 text-center">
                      <span className="text-2xl font-bold text-orange-400">
                        {type === 'streak' ? entry.currentStreak : entry.longestStreak}
                      </span>
                      <span className="text-gray-400 ml-1">jours</span>
                    </div>
                    <div className="col-span-3 text-right text-gray-400">
                      {type === 'streak' ? (
                        <span>Record: {entry.longestStreak}</span>
                      ) : (
                        <span className="text-orange-300">🔥 {entry.longestStreak}</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
