import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PENDING_DEEPLINK_KEY = 'splitease_pending_deeplink';

interface DeepLinkContextType {
  isDeepLinkPending: boolean;
  isDeepLinkResolved: boolean;
  pendingPath: string | null;
}

const DeepLinkContext = createContext<DeepLinkContextType>({
  isDeepLinkPending: false,
  isDeepLinkResolved: false,
  pendingPath: null,
});

export const useDeepLink = () => useContext(DeepLinkContext);

/**
 * DeepLinkProvider - Manages deep-link state and navigation
 * 
 * PURPOSE: Block default routing until deep-link is resolved.
 */
export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // Use state for values that need to trigger re-renders
  const [hasProcessed, setHasProcessed] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(() => {
    return sessionStorage.getItem(PENDING_DEEPLINK_KEY);
  });
  
  // Use ref to prevent double navigation
  const navigationDone = useRef(false);

  // Listen for postMessage from service worker (foreground case)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK_NAVIGATION' && event.data?.url) {
        const targetUrl = event.data.url;
        console.log('[DeepLinkContext] Received postMessage:', targetUrl);
        
        const path = new URL(targetUrl, window.location.origin).pathname;
        
        // If already authenticated, navigate immediately
        if (user && !authLoading) {
          console.log('[DeepLinkContext] Navigating immediately:', path);
          navigate(path, { replace: true });
        } else {
          // Store for later consumption
          console.log('[DeepLinkContext] Storing for later:', path);
          sessionStorage.setItem(PENDING_DEEPLINK_KEY, path);
          setPendingPath(path);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [user, authLoading, navigate]);

  // Process pending deep-link after auth is ready
  // Note: We intentionally call setState in this effect to signal processing completion
  // This is the recommended pattern for this routing gate use case
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      console.log('[DeepLinkContext] Auth loading, waiting...');
      return;
    }

    // Skip if already processed
    if (hasProcessed) {
      return;
    }

    // If no user, mark as processed (will redirect to login)
    if (!user) {
      console.log('[DeepLinkContext] No user, marking as processed');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasProcessed(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingPath(null);
      return;
    }

    // Check for pending deep-link
    const storedPath = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
    
    if (storedPath && !navigationDone.current) {
      console.log('[DeepLinkContext] Processing stored deep-link:', storedPath);
      sessionStorage.removeItem(PENDING_DEEPLINK_KEY);
      navigationDone.current = true;
      
      // Navigate to the deep-link path
      if (location.pathname !== storedPath) {
        console.log('[DeepLinkContext] Navigating to:', storedPath);
        navigate(storedPath, { replace: true });
      }
    }
    
    // Mark as processed and clear pending path
    console.log('[DeepLinkContext] Deep-link processing complete');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasProcessed(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingPath(null);
  }, [authLoading, user, hasProcessed, navigate, location.pathname]);

  // Derive context value from state (not refs)
  const value: DeepLinkContextType = {
    isDeepLinkPending: pendingPath !== null && !hasProcessed,
    isDeepLinkResolved: !authLoading && (hasProcessed || !user),
    pendingPath,
  };

  return (
    <DeepLinkContext.Provider value={value}>
      {children}
    </DeepLinkContext.Provider>
  );
}


