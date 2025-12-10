import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useAuthStore } from '../src/store/auth';
import Header from '../src/components/Header';
import NotificationSettings from '../src/components/NotificationSettings';

export default function SettingsPage() {
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
    }
  }, [accessToken, router]);

  if (!accessToken) {
    return null;
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">⚙️ Paramètres</h1>

        {/* Notifications */}
        <NotificationSettings />

        {/* Danger Zone */}
        <div className="p-6 bg-white rounded-xl shadow border border-red-200">
          <h2 className="text-lg font-semibold text-red-600 mb-4">Zone dangereuse</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Supprimer tout l'historique</p>
                <p className="text-sm text-gray-500">Efface toutes vos parties jouées</p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Êtes-vous sûr ? Cette action est irréversible.')) {
                    // TODO: Implémenter l'appel API
                  }
                }}
                className="px-4 py-2 text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
