import { useNotifications } from '../lib/notifications';
import { useUIStore } from '../store/ui';

export default function NotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    prefs,
    loading,
    subscribe,
    unsubscribe,
    updatePrefs,
    sendTest,
  } = useNotifications();

  const addToast = useUIStore((s) => s.addToast);

  if (loading) {
    return (
      <div className="p-6 bg-white rounded-xl shadow animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      addToast({ type: 'success', message: 'Notifications activées' });
    } else if (permission === 'denied') {
      addToast({ type: 'error', message: 'Notifications bloquées. Vérifiez les paramètres de votre navigateur.' });
    } else {
      addToast({ type: 'error', message: 'Impossible d\'activer les notifications' });
    }
  };

  const handleUnsubscribe = async () => {
    const success = await unsubscribe();
    if (success) {
      addToast({ type: 'info', message: 'Notifications désactivées' });
    }
  };

  const handleTest = async () => {
    try {
      await sendTest();
      addToast({ type: 'info', message: 'Notification test envoyée' });
    } catch {
      addToast({ type: 'error', message: 'Erreur lors de l\'envoi' });
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow space-y-6">
      <h2 className="text-lg font-semibold text-gray-900">🔔 Notifications</h2>

      {!isSupported && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-700">
            Les notifications push ne sont pas supportées par votre navigateur.
          </p>
        </div>
      )}

      {isSupported && permission === 'denied' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">
            Les notifications sont bloquées. Pour les activer, modifiez les permissions
            de votre navigateur pour ce site.
          </p>
        </div>
      )}

      {isSupported && permission !== 'denied' && (
        <>
          {/* Toggle principal */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Notifications push</p>
              <p className="text-sm text-gray-500">
                Recevez des notifications même quand l'application est fermée
              </p>
            </div>
            <button
              onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isSubscribed ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isSubscribed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Types de notifications */}
          {isSubscribed && prefs && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Types de notifications</p>
              
              <label className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <span className="text-gray-900">Invitations à des parties</span>
                  <p className="text-xs text-gray-500">Quand quelqu'un vous invite à jouer</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.notifyGameInvite}
                  onChange={(e) => updatePrefs({ notifyGameInvite: e.target.checked })}
                  className="rounded text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <span className="text-gray-900">Début de partie</span>
                  <p className="text-xs text-gray-500">Quand une partie à laquelle vous participez commence</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.notifyGameStart}
                  onChange={(e) => updatePrefs({ notifyGameStart: e.target.checked })}
                  className="rounded text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <span className="text-gray-900">Nouveaux abonnés</span>
                  <p className="text-xs text-gray-500">Quand quelqu'un commence à vous suivre</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.notifyNewFollower}
                  onChange={(e) => updatePrefs({ notifyNewFollower: e.target.checked })}
                  className="rounded text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg cursor-pointer">
                <div>
                  <span className="text-gray-900">Rapport hebdomadaire</span>
                  <p className="text-xs text-gray-500">Résumé de vos statistiques chaque semaine</p>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.notifyWeeklyReport}
                  onChange={(e) => updatePrefs({ notifyWeeklyReport: e.target.checked })}
                  className="rounded text-indigo-600"
                />
              </label>
            </div>
          )}

          {/* Bouton test */}
          {isSubscribed && (
            <button
              onClick={handleTest}
              className="w-full py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
            >
              Envoyer une notification test
            </button>
          )}
        </>
      )}
    </div>
  );
}
