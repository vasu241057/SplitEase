import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PENDING_DEEPLINK_KEY = 'splitease_pending_deeplink';

/**
 * Hook to handle deep-link navigation from push notifications.
 * 
 * Handles three cases:
 * 1. Foreground: App is open, receives postMessage from SW
 * 2. Background: App in memory, receives postMessage from SW
 * 3. Cold Start: App killed, URL is in browser location (handled by router)
 *                or stored in sessionStorage if page was already redirected
 */
export function useDeepLinkHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const hasProcessedInitialDeepLink = useRef(false);

  useEffect(() => {
    // Don't process until auth is ready
    if (authLoading) return;

    // Handler for postMessage from service worker (foreground/background cases)
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

  // Handle pending deep-link from sessionStorage (cold start with redirect)
  useEffect(() => {
    if (authLoading || hasProcessedInitialDeepLink.current) return;
    
    // Only process once user is authenticated
    if (!user) return;

    const pendingUrl = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
    if (pendingUrl) {
      console.log('[DeepLink] Processing pending deep-link from storage:', pendingUrl);
      sessionStorage.removeItem(PENDING_DEEPLINK_KEY);
      hasProcessedInitialDeepLink.current = true;
      
      const path = new URL(pendingUrl, window.location.origin).pathname;
      // Avoid navigating if already on the correct path
      if (location.pathname !== path) {
        navigate(path, { replace: true });
      }
    } else {
      hasProcessedInitialDeepLink.current = true;
    }
  }, [authLoading, user, navigate, location.pathname]);
}
