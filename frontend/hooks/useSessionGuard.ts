import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import api from '@/lib/api';

export interface SessionGuardState {
  unlocked: boolean | null; // null = loading, true/false = determined
  loading: boolean;
  error: string | null;
}

/**
 * Hook to check if user's session is unlocked (KEK exists in Redis)
 * 
 * Usage:
 * ```tsx
 * const { unlocked, loading, error } = useSessionGuard();
 * 
 * if (loading) return <div>Loading...</div>;
 * if (!unlocked) return <UnlockSessionModal />;
 * return <ProtectedContent />;
 * ```
 */
export function useSessionGuard(): SessionGuardState {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    const checkStatus = async () => {
      // Wait for Clerk to load
      if (!isLoaded) {
        return;
      }

      // If not signed in, no need to check
      if (!isSignedIn) {
        setUnlocked(false);
        setLoading(false);
        return;
      }

      // Check sessionStorage first (fast path)
      const cachedStatus = sessionStorage.getItem('cc_unlocked');
      if (cachedStatus === 'true') {
        // Verify with backend (in background)
        try {
          const status = await api.checkSessionStatus();
          setUnlocked(status.unlocked);
          
          // Update cache
          if (!status.unlocked) {
            sessionStorage.removeItem('cc_unlocked');
            sessionStorage.removeItem('cc_session_id');
          }
        } catch (err: any) {
          console.error('Failed to verify session status:', err);
          // On error, assume locked for security
          setUnlocked(false);
          sessionStorage.removeItem('cc_unlocked');
        }
        setLoading(false);
        return;
      }

      // No cache, check with backend
      try {
        setLoading(true);
        setError(null);
        
        const status = await api.checkSessionStatus();
        setUnlocked(status.unlocked);
        
        // Update cache
        if (status.unlocked) {
          sessionStorage.setItem('cc_unlocked', 'true');
          if (status.session_id) {
            sessionStorage.setItem('cc_session_id', status.session_id);
          }
        }
      } catch (err: any) {
        console.error('Session status check failed:', err);
        
        if (err.response?.status === 401) {
          // Not authenticated
          setUnlocked(false);
          setError('Please sign in to continue');
        } else {
          // Other error - assume locked for security
          setUnlocked(false);
          setError('Failed to check session status');
        }
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [isSignedIn, isLoaded]);

  return { unlocked, loading, error };
}

/**
 * Hook variant that returns a function to manually re-check status
 * Useful after unlocking the session
 */
export function useSessionGuardWithRefresh() {
  const state = useSessionGuard();
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    sessionStorage.removeItem('cc_unlocked');
    setRefreshKey((k) => k + 1);
  };

  return { ...state, refresh, key: refreshKey };
}

