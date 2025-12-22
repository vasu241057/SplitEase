import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PENDING_DEEPLINK_KEY = 'splitease_pending_deeplink';

// Paths that are considered "deep links" (not default landing pages)
const isDeepLinkPath = (path: string): boolean => {
  // Deep links are specific resource paths, not root navigation tabs
  const rootPaths = ['/', '/friends', '/groups', '/activity', '/settings', '/login', '/signup'];
  return !rootPaths.includes(path) && path.length > 1;
};

/**
 * Hook to handle deep-link navigation from push notifications.
 * 
 * Handles three cases:
 * 1. Foreground: App is open, receives postMessage from SW → navigate immediately
 * 2. Background: SW uses navigate() → page reloads with correct URL
 * 3. Cold Start: URL is in browser location → preserve before auth redirect
 */
export function useDeepLinkHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const hasProcessedInitialDeepLink = useRef(false);
  const initialPathCaptured = useRef(false);

  // CRITICAL: Capture initial URL immediately on first render
  // This must happen BEFORE auth loading completes and potentially redirects
  useEffect(() => {
    if (initialPathCaptured.current) return;
    initialPathCaptured.current = true;

    const currentPath = window.location.pathname;
    console.log('[DeepLink] Initial path on mount:', currentPath);

    // If we landed on a deep-link path (not a root tab), preserve it
    if (isDeepLinkPath(currentPath)) {
      const existingPending = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
      if (!existingPending) {
        console.log('[DeepLink] Preserving cold-start deep-link:', currentPath);
        sessionStorage.setItem(PENDING_DEEPLINK_KEY, currentPath);
      }
    }
  }, []); // Run only once on mount

  // Handler for postMessage from service worker (foreground case)
  useEffect(() => {
    // Don't process until auth is ready
    if (authLoading) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK_NAVIGATION' && event.data?.url) {
        const targetUrl = event.data.url;
        console.log('[DeepLink] Received postMessage navigation:', targetUrl);
        
        // If user is not logged in, store for later and let auth flow complete
        if (!user) {
          console.log('[DeepLink] User not authenticated, storing for later');
          sessionStorage.setItem(PENDING_DEEPLINK_KEY, targetUrl);
          return;
        }

        // Navigate immediately
        const path = new URL(targetUrl, window.location.origin).pathname;
        console.log('[DeepLink] Navigating to:', path);
        navigate(path, { replace: true });
      }
    };

    // Listen for messages from service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
    }

    // Cleanup
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [authLoading, user, navigate]);

  // Process pending deep-link after auth is ready
  useEffect(() => {
    if (authLoading || hasProcessedInitialDeepLink.current) return;
    
    // Only process once user is authenticated
    if (!user) return;

    const pendingUrl = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
    if (pendingUrl) {
      console.log('[DeepLink] Processing pending deep-link:', pendingUrl);
      sessionStorage.removeItem(PENDING_DEEPLINK_KEY);
      hasProcessedInitialDeepLink.current = true;
      
      const path = pendingUrl.startsWith('/') ? pendingUrl : new URL(pendingUrl, window.location.origin).pathname;
      
      // Avoid navigating if already on the correct path
      if (location.pathname !== path) {
        console.log('[DeepLink] Navigating to stored path:', path);
        navigate(path, { replace: true });
      }
    } else {
      hasProcessedInitialDeepLink.current = true;
    }
  }, [authLoading, user, navigate, location.pathname]);
}

