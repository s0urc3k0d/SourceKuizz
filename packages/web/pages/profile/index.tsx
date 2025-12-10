import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../../src/store/auth';

export default function MyProfileRedirect() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.userId);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/login');
    } else if (userId) {
      router.replace(`/profile/${userId}`);
    }
  }, [accessToken, userId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
    </div>
  );
}
