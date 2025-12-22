import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PENDING_DEEPLINK_KEY = 'splitease_pending_deeplink';

/**
 * Hook to handle deep-link navigation from push notifications.
 * 
 * Handles three cases:
 * 1. Foreground: App is open, receives postMessage from SW → navigate immediately
 * 2. Background: SW uses navigate() → page reloads with correct URL
 * 3. Cold Start: URL captured in main.tsx → consume after auth ready
 */
export function useDeepLinkHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const hasProcessedDeepLink = useRef(false);

  // Handler for postMessage from service worker (foreground case)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK_NAVIGATION' && event.data?.url) {
        const targetUrl = event.data.url;
        console.log('[DeepLink] Received postMessage navigation:', targetUrl);
        
        // If user is not logged in, store for later
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

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      }
    };
  }, [user, navigate]);

  // Process pending deep-link after auth is ready
  // URL is captured in main.tsx BEFORE React renders
  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;
    
    // Only process once
    if (hasProcessedDeepLink.current) return;
    
    // Must be authenticated
    if (!user) return;

    const pendingUrl = sessionStorage.getItem(PENDING_DEEPLINK_KEY);
    if (pendingUrl) {
      console.log('[DeepLink] Processing pending deep-link:', pendingUrl);
      sessionStorage.removeItem(PENDING_DEEPLINK_KEY);
      hasProcessedDeepLink.current = true;
      
      const path = pendingUrl.startsWith('/') ? pendingUrl : new URL(pendingUrl, window.location.origin).pathname;
      
      // Navigate if not already on the correct path
      if (location.pathname !== path) {
        console.log('[DeepLink] Navigating to stored path:', path);
        navigate(path, { replace: true });
      }
    } else {
      hasProcessedDeepLink.current = true;
    }
  }, [authLoading, user, navigate, location.pathname]);
}


