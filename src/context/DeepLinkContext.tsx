import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PENDING_DEEPLINK_KEY = 'splitease_pending_deeplink';

// Paths that are NOT deep-links (root navigation tabs)
const ROOT_PATHS = ['/', '/friends', '/groups', '/activity', '/settings', '/login', '/signup'];

const isDeepLinkPath = (path: string): boolean => {
  return !ROOT_PATHS.includes(path) && path.length > 1;
};

interface DeepLinkContextType {
  isDeepLinkPending: boolean;
  isDeepLinkResolved: boolean;
}

const DeepLinkContext = createContext<DeepLinkContextType>({
  isDeepLinkPending: false,
  isDeepLinkResolved: false,
});

export const useDeepLink = () => useContext(DeepLinkContext);

/**
 * DeepLinkProvider - Manages deep-link state and navigation
 * 
 * CRITICAL FIX: iOS PWAs don't truly "cold start" on kill - they restore state.
 * This means:
 * - Module top-level code (main.tsx) doesn't re-run
 * - React state persists across "kills"
 * 
 * Solution: Detect app activation via pageshow/visibilitychange events and
 * check for deep-links on EACH activation, not just module initialization.
 */
export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // Track activation state - reset on each new activation
  const [activationId, setActivationId] = useState(0);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  
  // Refs to prevent double processing
  const navigationDone = useRef(false);
  const lastActivationId = useRef(-1);

  // Capture deep-link from current URL (called on each activation)
  // Note: This is intentionally called from effects to detect app activation
  const captureDeepLink = useCallback(() => {
    const currentPath = window.location.pathname;
    const timestamp = new Date().toISOString();
    console.log(`[DeepLink ${timestamp}] Checking URL (activationId: ${activationId}):`, currentPath);
    
    if (isDeepLinkPath(currentPath)) {
      // Check if we already have this pending (avoid duplicates)
      const existing = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
      console.log(`[DeepLink] Existing in storage: ${existing}, Current: ${currentPath}`);
      
      // ALWAYS capture if it's a deep link path, even if it matches (to ensure state is set for this activation)
      // But only update state if needed to avoid loops
      if (existing !== currentPath || pendingPath !== currentPath) {
        console.log(`[DeepLink] capturing NEW deep-link:`, currentPath);
        sessionStorage.setItem(PENDING_DEEPLINK_KEY, currentPath);

        setPendingPath(currentPath);
      } else {
        console.log(`[DeepLink] Deep-link already captured/pending`);
      }
    } else {
        console.log(`[DeepLink] URL is NOT a deep-link path`);
    }

  }, [activationId, pendingPath]);

  // Detect app activation (pageshow handles iOS PWA resume better than visibilitychange)
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      // persisted = true means page was restored from bfcache (back-forward cache)
      // This is common on iOS PWA "resume"
      console.log(`[DeepLink ${new Date().toISOString()}] PAGESHOW event. Persisted: ${event.persisted}`);
      
      // Reset state for new activation
      console.log('[DeepLink] RESETTING STATE for new activation');
      setHasProcessed(false);
      navigationDone.current = false;
      setActivationId(id => id + 1);
      
      // We need to capture immediately
      captureDeepLink();
    };

    const handleVisibilityChange = () => {
      console.log(`[DeepLink ${new Date().toISOString()}] Visibility change: ${document.visibilityState}`);
      if (document.visibilityState === 'visible') {
        console.log('[DeepLink] App became VISIBLE. Checking deep links...');
        // Don't fully reset here - pageshow is more reliable for cold starts
        // But do capture any new deep-link
        captureDeepLink();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initial capture on mount - these setState calls are intentional for activation detection

    // eslint-disable-next-line react-hooks/set-state-in-effect
    captureDeepLink();

    setActivationId(1);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [captureDeepLink]);

  // Listen for postMessage from service worker (foreground case)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK_NAVIGATION' && event.data?.url) {
        const targetUrl = event.data.url;
        console.log('[DeepLink] Received postMessage:', targetUrl);
        
        const path = new URL(targetUrl, window.location.origin).pathname;
        
        // If already authenticated, navigate immediately
        if (user && !authLoading) {
          console.log('[DeepLink] Navigating immediately:', path);
          navigate(path, { replace: true });
        } else {
          // Store for later consumption
          console.log('[DeepLink] Storing for later:', path);
          sessionStorage.setItem(PENDING_DEEPLINK_KEY, path);
          setPendingPath(path);
          setHasProcessed(false);
          navigationDone.current = false;
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
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      console.log('[DeepLink] Auth loading, waiting...');
      return;
    }

    // Skip if already processed this activation
    if (hasProcessed && lastActivationId.current === activationId) {
    //   console.log('[DeepLink] Already processed for this activation, skipping.');
      return;
    }

    console.log(`[DeepLink] Processing effect. User: ${!!user}, HasProcessed: ${hasProcessed}, Activation: ${activationId}, LastActivation: ${lastActivationId.current}`);

    // Mark this activation as being processed
    lastActivationId.current = activationId;

    // If no user, mark as processed (will redirect to login)
    if (!user) {
      console.log('[DeepLink] No user, marking as processed');

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasProcessed(true);

      setPendingPath(null);
      return;
    }

    // Check for pending deep-link
    const storedPath = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
    console.log(`[DeepLink] Check Stored Path: ${storedPath}, NavigationDone: ${navigationDone.current}`);
    
    if (storedPath && !navigationDone.current) {
      console.log('[DeepLink] Processing stored deep-link:', storedPath);
      sessionStorage.removeItem(PENDING_DEEPLINK_KEY);
      navigationDone.current = true;
      
      // Navigate to the deep-link path
      if (location.pathname !== storedPath) {
        console.log('[DeepLink] Navigating to:', storedPath);
        navigate(storedPath, { replace: true });
      }
    }
    
    // Mark as processed
    console.log('[DeepLink] Deep-link processing complete for activation:', activationId);

    setHasProcessed(true);

    setPendingPath(null);
  }, [authLoading, user, hasProcessed, activationId, navigate, location.pathname]);

  // Derive context value
  const value: DeepLinkContextType = {
    isDeepLinkPending: pendingPath !== null && !hasProcessed,
    isDeepLinkResolved: !authLoading && hasProcessed,
  };

  return (
    <DeepLinkContext.Provider value={value}>
      {children}
    </DeepLinkContext.Provider>
  );
}



