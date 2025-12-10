import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Header from '../../src/components/Header';
import { useAuthStore } from '../../src/store/auth';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimit: number;
  requestCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { value: 'quizzes:read', label: 'Lire les quizzes', description: 'Accès en lecture aux quizzes publics' },
  { value: 'quizzes:write', label: 'Créer des quizzes', description: 'Créer et modifier vos quizzes' },
  { value: 'sessions:read', label: 'Lire les sessions', description: 'Accès aux sessions de jeu' },
  { value: 'sessions:write', label: 'Gérer les sessions', description: 'Créer et gérer des sessions' },
  { value: 'users:read', label: 'Lire les profils', description: 'Accès aux profils utilisateurs' },
  { value: 'analytics:read', label: 'Analytics', description: 'Accès aux statistiques' },
];

export default function ApiKeysPage() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  // Form state
  const [keyName, setKeyName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['quizzes:read']);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [rateLimit, setRateLimit] = useState(1000);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    fetchKeys();
  }, [accessToken]);

  const fetchKeys = async () => {
    setLoading(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${apiUrl}/api/keys`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!keyName.trim()) return;
    setCreating(true);
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    try {
      const res = await fetch(`${apiUrl}/api/keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: keyName.trim(),
          scopes: selectedScopes,
          expiresInDays,
          rateLimit,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setKeys([data.data, ...keys]);
        setKeyName('');
        setSelectedScopes(['quizzes:read']);
        setExpiresInDays(undefined);
        setRateLimit(1000);
      }
    } catch (error) {
      console.error('Error creating API key:', error);
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé API ?')) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${apiUrl}/api/keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        setKeys(keys.filter((k) => k.id !== keyId));
      }
    } catch (error) {
      console.error('Error revoking API key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope]
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Jamais';
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

  return (
    <div className="min-h-screen bg-gray-900">
      <Head>
        <title>Clés API - SourceKuizz</title>
      </Head>

      <Header />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">🔑 Clés API</h1>
            <p className="text-gray-400 mt-2">
              Gérez vos clés pour accéder à l'API publique SourceKuizz
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            + Créer une clé
          </button>
        </div>

        {/* New Key Alert */}
        {newKey && (
          <div className="bg-green-900/50 border border-green-500 rounded-xl p-6 mb-8">
            <div className="flex items-start gap-4">
              <span className="text-3xl">✅</span>
              <div className="flex-1">
                <h3 className="text-green-400 font-semibold text-lg mb-2">
                  Clé API créée avec succès !
                </h3>
                <p className="text-green-300 text-sm mb-4">
                  Copiez cette clé maintenant. Elle ne sera plus affichée après avoir fermé ce message.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-900 text-green-400 px-4 py-3 rounded-lg font-mono text-sm break-all">
                    {newKey}
                  </code>
                  <button
                    onClick={() => copyToClipboard(newKey)}
                    className="px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                    title="Copier"
                  >
                    📋
                  </button>
                </div>
              </div>
              <button
                onClick={() => setNewKey(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* API Keys List */}
        {keys.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <span className="text-6xl mb-4 block">🔐</span>
            <h3 className="text-xl font-medium text-white mb-2">
              Aucune clé API
            </h3>
            <p className="text-gray-400 mb-6">
              Créez votre première clé API pour accéder aux endpoints REST
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Créer une clé
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {keys.map((key) => (
              <div
                key={key.id}
                className="bg-gray-800 rounded-xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold text-lg">
                      {key.name}
                    </h3>
                    <code className="text-gray-400 text-sm">
                      {key.keyPrefix}...
                    </code>
                  </div>
                  <button
                    onClick={() => revokeKey(key.id)}
                    className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 text-sm"
                  >
                    Révoquer
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {key.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="px-3 py-1 bg-indigo-600/20 text-indigo-400 rounded-full text-sm"
                    >
                      {scope}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Rate limit</span>
                    <div className="text-white">
                      {key.requestCount}/{key.rateLimit} req/h
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Dernière utilisation</span>
                    <div className="text-white">{formatDate(key.lastUsedAt)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Expiration</span>
                    <div className="text-white">
                      {key.expiresAt ? formatDate(key.expiresAt) : 'Jamais'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Créée le</span>
                    <div className="text-white">{formatDate(key.createdAt)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Documentation Section */}
        <div className="mt-12 bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            📖 Documentation API
          </h2>
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="text-white font-medium mb-2">Authentification</h3>
              <code className="block bg-gray-900 p-4 rounded-lg text-sm">
                curl -H "Authorization: Bearer sk_live_xxx" \<br />
                &nbsp;&nbsp;&nbsp;&nbsp; {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/v1/quizzes
              </code>
            </div>
            <div>
              <h3 className="text-white font-medium mb-2">Endpoints disponibles</h3>
              <ul className="space-y-2 text-sm">
                <li><code className="text-green-400">GET</code> <code>/api/v1/quizzes</code> - Liste des quizzes</li>
                <li><code className="text-green-400">GET</code> <code>/api/v1/quizzes/:id</code> - Détails d'un quiz</li>
                <li><code className="text-green-400">GET</code> <code>/api/v1/sessions</code> - Sessions actives</li>
                <li><code className="text-green-400">GET</code> <code>/api/v1/sessions/:code</code> - Détails d'une session</li>
                <li><code className="text-green-400">GET</code> <code>/api/v1/users/:id</code> - Profil utilisateur</li>
                <li><code className="text-green-400">GET</code> <code>/api/v1/analytics/overview</code> - Statistiques globales</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Create Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl max-w-lg w-full p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">
                  Créer une clé API
                </h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                {/* Name */}
                <div>
                  <label className="block text-gray-300 mb-2">Nom de la clé</label>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="Ex: Production, Development, Bot Twitch..."
                    className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Scopes */}
                <div>
                  <label className="block text-gray-300 mb-2">Permissions</label>
                  <div className="space-y-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label
                        key={scope.value}
                        className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                          className="w-5 h-5 rounded"
                        />
                        <div>
                          <div className="text-white font-medium">{scope.label}</div>
                          <div className="text-gray-400 text-sm">{scope.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Rate Limit */}
                <div>
                  <label className="block text-gray-300 mb-2">
                    Rate limit (requêtes/heure)
                  </label>
                  <input
                    type="number"
                    value={rateLimit}
                    onChange={(e) => setRateLimit(parseInt(e.target.value) || 1000)}
                    min={100}
                    max={10000}
                    className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Expiration */}
                <div>
                  <label className="block text-gray-300 mb-2">
                    Expiration (optionnel)
                  </label>
                  <select
                    value={expiresInDays || ''}
                    onChange={(e) =>
                      setExpiresInDays(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    className="w-full bg-gray-700 text-white px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Jamais</option>
                    <option value="7">7 jours</option>
                    <option value="30">30 jours</option>
                    <option value="90">90 jours</option>
                    <option value="365">1 an</option>
                  </select>
                </div>

                {/* Actions */}
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-6 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={createKey}
                    disabled={!keyName.trim() || selectedScopes.length === 0 || creating}
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
