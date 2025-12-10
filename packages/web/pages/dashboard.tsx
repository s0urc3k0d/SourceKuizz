import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../src/components/Header';
import { useAuthStore } from '../src/store/auth';

interface OverviewStats {
  totalUsers: number;
  totalQuizzes: number;
  totalSessions: number;
  activeSessions: number;
  totalGamesPlayed: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  averagePlayersPerSession: number;
}

interface TrendData {
  date: string;
  value: number;
}

interface QuestionTypeStats {
  type: string;
  count: number;
  avgCorrectRate: number;
}

interface TopQuiz {
  id: string;
  title: string;
  timesPlayed: number;
  avgScore: number;
  creator: string;
}

interface TopPlayer {
  id: string;
  username: string;
  level: number;
  totalXp: number;
  gamesPlayed: number;
  badgeCount: number;
}

interface UserAnalytics {
  overview: {
    totalGames: number;
    totalWins: number;
    winRate: number;
    avgScore: number;
    avgRank: number;
    bestStreak: number;
  };
  recentPerformance: TrendData[];
  questionTypeAccuracy: Array<{ type: string; accuracy: number }>;
}

export default function Dashboard() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'personal' | 'leaderboards'>('personal');

  // Overview data
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [registrationTrend, setRegistrationTrend] = useState<TrendData[]>([]);
  const [gamesTrend, setGamesTrend] = useState<TrendData[]>([]);
  const [questionTypeStats, setQuestionTypeStats] = useState<QuestionTypeStats[]>([]);

  // Leaderboards
  const [topQuizzes, setTopQuizzes] = useState<TopQuiz[]>([]);
  const [topPlayers, setTopPlayers] = useState<TopPlayer[]>([]);

  // Personal analytics
  const [myAnalytics, setMyAnalytics] = useState<UserAnalytics | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }

    checkAdminAndFetchData();
  }, [accessToken]);

  const checkAdminAndFetchData = async () => {
    setLoading(true);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    try {
      // Vérifier si l'utilisateur est admin
      const adminRes = await fetch(`${apiUrl}/auth/check-admin`, { headers });
      if (adminRes.ok) {
        const adminData = await adminRes.json();
        setIsAdmin(adminData.isAdmin);
        
        if (adminData.isAdmin) {
          setActiveTab('overview');
          await fetchAdminData(headers, apiUrl);
        }
      }

      // Récupérer les stats personnelles (accessibles à tous)
      await fetchPersonalData(headers, apiUrl);
    } catch (error) {
      console.error('Error checking admin status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminData = async (headers: Record<string, string>, apiUrl: string) => {
    try {
      const [
        overviewRes,
        registrationRes,
        gamesRes,
        questionTypesRes,
        topQuizzesRes,
        topPlayersRes,
      ] = await Promise.all([
        fetch(`${apiUrl}/analytics/overview`, { headers }),
        fetch(`${apiUrl}/analytics/trends/registrations?days=30`, { headers }),
        fetch(`${apiUrl}/analytics/trends/games?days=30`, { headers }),
        fetch(`${apiUrl}/analytics/question-types`, { headers }),
        fetch(`${apiUrl}/analytics/top-quizzes?limit=10`, { headers }),
        fetch(`${apiUrl}/analytics/top-players?limit=10`, { headers }),
      ]);

      if (overviewRes.ok) {
        const data = await overviewRes.json();
        setOverview(data.data);
      }

      if (registrationRes.ok) {
        const data = await registrationRes.json();
        setRegistrationTrend(data.data);
      }

      if (gamesRes.ok) {
        const data = await gamesRes.json();
        setGamesTrend(data.data);
      }

      if (questionTypesRes.ok) {
        const data = await questionTypesRes.json();
        setQuestionTypeStats(data.data);
      }

      if (topQuizzesRes.ok) {
        const data = await topQuizzesRes.json();
        setTopQuizzes(data.data);
      }

      if (topPlayersRes.ok) {
        const data = await topPlayersRes.json();
        setTopPlayers(data.data);
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
    }
  };

  const fetchPersonalData = async (headers: Record<string, string>, apiUrl: string) => {
    try {
      const myAnalyticsRes = await fetch(`${apiUrl}/analytics/me`, { headers });

      if (myAnalyticsRes.ok) {
        const data = await myAnalyticsRes.json();
        setMyAnalytics(data.data);
      }
    } catch (error) {
      console.error('Error fetching personal data:', error);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getMaxValue = (data: TrendData[]) => {
    const max = Math.max(...data.map(d => d.value));
    return max === 0 ? 1 : max;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
          </div>
        </main>
      </div>
    );
  }

  // Tabs disponibles selon le statut admin
  const availableTabs = isAdmin 
    ? [
        { id: 'overview', label: '📈 Vue globale (Admin)' },
        { id: 'personal', label: '👤 Mes stats' },
        { id: 'leaderboards', label: '🏆 Classements' },
      ]
    : [
        { id: 'personal', label: '👤 Mes stats' },
      ];

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>Dashboard Analytics - SourceKuizz</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">📊 Dashboard Analytics</h1>
          {isAdmin && (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-sm font-medium">
              🔐 Admin
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 mb-8">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab (Admin only) */}
        {activeTab === 'overview' && isAdmin && overview && (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                title="Utilisateurs"
                value={formatNumber(overview.totalUsers)}
                subtitle={`+${overview.newUsersLast7Days} cette semaine`}
                icon="👥"
                color="indigo"
              />
              <StatCard
                title="Quizzes"
                value={formatNumber(overview.totalQuizzes)}
                icon="📝"
                color="green"
              />
              <StatCard
                title="Sessions actives"
                value={formatNumber(overview.activeSessions)}
                subtitle={`${overview.totalSessions} total`}
                icon="🎮"
                color="yellow"
              />
              <StatCard
                title="Parties jouées"
                value={formatNumber(overview.totalGamesPlayed)}
                subtitle={`~${overview.averagePlayersPerSession} joueurs/partie`}
                icon="🎯"
                color="pink"
              />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Registration Trend */}
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  📈 Inscriptions (30 jours)
                </h3>
                <div className="h-48">
                  <SimpleBarChart data={registrationTrend} color="#6366f1" />
                </div>
              </div>

              {/* Games Trend */}
              <div className="bg-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">
                  🎮 Parties jouées (30 jours)
                </h3>
                <div className="h-48">
                  <SimpleBarChart data={gamesTrend} color="#10b981" />
                </div>
              </div>
            </div>

            {/* Question Types */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                ❓ Types de questions
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {questionTypeStats.map((stat) => (
                  <div
                    key={stat.type}
                    className="bg-gray-700 rounded-lg p-4 text-center"
                  >
                    <div className="text-2xl mb-2">
                      {getQuestionTypeIcon(stat.type)}
                    </div>
                    <div className="text-white font-medium capitalize">
                      {stat.type.replace('_', ' ')}
                    </div>
                    <div className="text-gray-400 text-sm">
                      {stat.count} questions
                    </div>
                    <div className="text-green-400 text-sm">
                      {stat.avgCorrectRate}% réussite
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Personal Tab */}
        {activeTab === 'personal' && myAnalytics && (
          <div className="space-y-8">
            {/* Personal Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard
                title="Parties"
                value={myAnalytics.overview.totalGames.toString()}
                icon="🎮"
                color="indigo"
              />
              <StatCard
                title="Victoires"
                value={myAnalytics.overview.totalWins.toString()}
                icon="🏆"
                color="yellow"
              />
              <StatCard
                title="Win Rate"
                value={`${myAnalytics.overview.winRate}%`}
                icon="📊"
                color="green"
              />
              <StatCard
                title="Score moyen"
                value={myAnalytics.overview.avgScore.toString()}
                icon="⭐"
                color="pink"
              />
              <StatCard
                title="Rang moyen"
                value={`#${myAnalytics.overview.avgRank}`}
                icon="🎯"
                color="blue"
              />
              <StatCard
                title="Meilleur streak"
                value={`${myAnalytics.overview.bestStreak}j`}
                icon="🔥"
                color="orange"
              />
            </div>

            {/* Recent Performance */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                📈 Performance récente (7 jours)
              </h3>
              <div className="h-48">
                <SimpleBarChart data={myAnalytics.recentPerformance} color="#f59e0b" />
              </div>
            </div>

            {/* Accuracy by Question Type */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                🎯 Précision par type de question
              </h3>
              <div className="space-y-4">
                {myAnalytics.questionTypeAccuracy.map((stat) => (
                  <div key={stat.type} className="flex items-center gap-4">
                    <div className="w-32 text-gray-300 capitalize">
                      {getQuestionTypeIcon(stat.type)} {stat.type.replace('_', ' ')}
                    </div>
                    <div className="flex-1">
                      <div className="bg-gray-700 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                          style={{ width: `${stat.accuracy}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-16 text-right text-white font-medium">
                      {stat.accuracy}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboards Tab (Admin only) */}
        {activeTab === 'leaderboards' && isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Players */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                🏆 Top Joueurs
              </h3>
              <div className="space-y-3">
                {topPlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-4 bg-gray-700 rounded-lg p-3"
                  >
                    <div className={`text-2xl font-bold ${
                      index === 0 ? 'text-yellow-400' :
                      index === 1 ? 'text-gray-400' :
                      index === 2 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-medium">{player.username}</div>
                      <div className="text-gray-400 text-sm">
                        Niveau {player.level} • {player.gamesPlayed} parties • {player.badgeCount} badges
                      </div>
                    </div>
                    <div className="text-indigo-400 font-bold">
                      {formatNumber(player.totalXp)} XP
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Quizzes */}
            <div className="bg-gray-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                📝 Top Quizzes
              </h3>
              <div className="space-y-3">
                {topQuizzes.map((quiz, index) => (
                  <div
                    key={quiz.id}
                    className="flex items-center gap-4 bg-gray-700 rounded-lg p-3"
                  >
                    <div className={`text-2xl font-bold ${
                      index === 0 ? 'text-yellow-400' :
                      index === 1 ? 'text-gray-400' :
                      index === 2 ? 'text-amber-600' : 'text-gray-500'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-medium">{quiz.title}</div>
                      <div className="text-gray-400 text-sm">
                        par {quiz.creator} • Score moyen: {quiz.avgScore}
                      </div>
                    </div>
                    <div className="text-green-400 font-bold">
                      {quiz.timesPlayed} parties
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Composant StatCard
function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    indigo: 'from-indigo-500 to-purple-600',
    green: 'from-green-500 to-emerald-600',
    yellow: 'from-yellow-500 to-orange-600',
    pink: 'from-pink-500 to-rose-600',
    blue: 'from-blue-500 to-cyan-600',
    orange: 'from-orange-500 to-red-600',
  };

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{title}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className={`text-3xl font-bold bg-gradient-to-r ${colorClasses[color]} bg-clip-text text-transparent`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-gray-500 text-sm mt-1">{subtitle}</div>
      )}
    </div>
  );
}

// Simple Bar Chart Component
function SimpleBarChart({ data, color }: { data: TrendData[]; color: string }) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Aucune donnée
      </div>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="h-full flex items-end gap-1">
      {data.map((item, index) => {
        const height = (item.value / maxValue) * 100;
        return (
          <div
            key={index}
            className="flex-1 flex flex-col items-center group"
          >
            <div
              className="w-full rounded-t transition-all hover:opacity-80"
              style={{
                height: `${Math.max(height, 2)}%`,
                backgroundColor: color,
              }}
              title={`${item.date}: ${item.value}`}
            />
            {data.length <= 14 && (
              <div className="text-xs text-gray-500 mt-1 truncate w-full text-center">
                {item.date.slice(5)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function getQuestionTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    multiple_choice: '🔘',
    true_false: '✅',
    text_input: '✏️',
    ordering: '📋',
    blitz: '⚡',
  };
  return icons[type] || '❓';
}
