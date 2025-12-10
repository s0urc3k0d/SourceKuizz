import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './api';

interface NotificationPrefs {
  id: string;
  userId: string;
  pushEnabled: boolean;
  notifyGameInvite: boolean;
  notifyGameStart: boolean;
  notifyNewFollower: boolean;
  notifyWeeklyReport: boolean;
}

interface UseNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission | null;
  isSubscribed: boolean;
  prefs: NotificationPrefs | null;
  loading: boolean;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  updatePrefs: (updates: Partial<NotificationPrefs>) => Promise<void>;
  sendTest: () => Promise<void>;
}

let vapidPublicKey: string | null = null;

async function getVapidKey(): Promise<string | null> {
  if (vapidPublicKey) return vapidPublicKey;
  
  try {
    const res = await apiFetch('/notifications/vapid-key', { auth: false });
    if (!res.ok) return null;
    const data = await res.json();
    vapidPublicKey = data.vapidPublicKey;
    return vapidPublicKey;
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

export function useNotifications(): UseNotificationsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);

  // Vérifier le support et la permission
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Charger les préférences
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const res = await apiFetch('/notifications/preferences');
        if (res.ok) {
          const data = await res.json();
          setPrefs(data);
          setIsSubscribed(data.pushEnabled);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };

    loadPrefs();
  }, []);

  // S'abonner aux notifications push
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      // Demander la permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      
      if (perm !== 'granted') {
        return false;
      }

      // Récupérer la clé VAPID
      const vapidKey = await getVapidKey();
      if (!vapidKey) {
        console.error('VAPID key not available');
        return false;
      }

      // Enregistrer le service worker
      const registration = await navigator.serviceWorker.ready;

      // S'abonner
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Envoyer l'abonnement au serveur
      const res = await apiFetch('/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to subscribe:', error);
      return false;
    }
  }, [isSupported]);

  // Se désabonner
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
      }

      const res = await apiFetch('/notifications/subscribe', { method: 'DELETE' });
      
      if (res.ok) {
        setIsSubscribed(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
      return false;
    }
  }, []);

  // Mettre à jour les préférences
  const updatePrefs = useCallback(async (updates: Partial<NotificationPrefs>) => {
    try {
      const res = await apiFetch('/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setPrefs(data);
      }
    } catch (error) {
      console.error('Failed to update prefs:', error);
    }
  }, []);

  // Envoyer une notification test
  const sendTest = useCallback(async () => {
    await apiFetch('/notifications/test', { method: 'POST' });
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    prefs,
    loading,
    subscribe,
    unsubscribe,
    updatePrefs,
    sendTest,
  };
}
