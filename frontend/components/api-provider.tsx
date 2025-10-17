'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';
import api from '@/lib/api';

/**
 * Provider component that initializes the API client with Clerk's token getter
 * This ensures all API calls automatically include the JWT token
 */
export function APIProvider({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();

  useEffect(() => {
    // Set up the token getter function in the API client
    api.setTokenGetter(getToken);
  }, [getToken]);

  return <>{children}</>;
}

