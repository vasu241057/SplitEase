import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

// IndexedDB configuration (same as SW)
const DB_NAME = 'SplitEaseDeepLink';
const DB_VERSION = 1;
const STORE_NAME = 'pendingLinks';

// Paths that are NOT deep-links (root navigation tabs)
const ROOT_PATHS = ['/', '/friends', '/groups', '/activity', '/settings', '/login', '/signup'];

const isDeepLinkPath = (path: string): boolean => {
  return !ROOT_PATHS.includes(path) && path.length > 1;
};

// IndexedDB helpers
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function readDeepLinkFromIDB(): Promise<string | null> {
  return openDB().then(db => {
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('current');
      
      let deepLink: string | null = null;
      
      request.onsuccess = () => {
        deepLink = request.result || null;
      };
      
      tx.oncomplete = () => resolve(deepLink);
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => null);
}

function clearDeepLinkFromIDB(): Promise<void> {
  return openDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete('current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => {});
}

interface DeepLinkContextType {
  isDeepLinkPending: boolean;
  isDeepLinkResolved: boolean;
  navigatedToDeepLink: boolean;
}

const DeepLinkContext = createContext<DeepLinkContextType>({
  isDeepLinkPending: false,
  isDeepLinkResolved: false,
  navigatedToDeepLink: false,
});

export const useDeepLink = () => useContext(DeepLinkContext);

/**
 * DeepLinkProvider - Handles deep-link navigation from push notifications
 * 
 * Architecture:
 * 1. SW writes deep link to IndexedDB on notification click
 * 2. Client reads from IndexedDB on mount
 * 3. Client also listens for postMessage from SW
 * 4. After consumption, clear IndexedDB
 */
export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // State
  const [isLoadingIntent, setIsLoadingIntent] = useState(true);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [navigatedToDeepLink, setNavigatedToDeepLink] = useState(false);
  
  // Refs
  const navigationDone = useRef(false);

  // STEP 1: Read from IndexedDB on mount
  useEffect(() => {
    readDeepLinkFromIDB().then(idbPath => {
      if (idbPath && isDeepLinkPath(idbPath)) {
        setPendingPath(idbPath);
      } else {
        // Check window.location as fallback
        const currentPath = window.location.pathname;
        if (isDeepLinkPath(currentPath)) {
          setPendingPath(currentPath);
        }
      }
      setIsLoadingIntent(false);
    });
  }, []);

  // STEP 2: Re-check IDB when app becomes visible (for background case)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !navigatedToDeepLink && !pendingPath) {
        readDeepLinkFromIDB().then(idbPath => {
          if (idbPath && isDeepLinkPath(idbPath)) {
            setPendingPath(idbPath);
            setHasProcessed(false);
          }
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [navigatedToDeepLink, pendingPath]);

  // STEP 3: Listen for postMessage from SW (foreground case)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK_NAVIGATION' && event.data?.url) {
        const targetUrl = event.data.url;
        const path = new URL(targetUrl, window.location.origin).pathname;
        
        if (user && !authLoading) {
          setNavigatedToDeepLink(true);
          clearDeepLinkFromIDB();
          navigate(path, { replace: true });
        } else {
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

  // STEP 4: Process pending deep-link after auth resolves
  // Computed values instead of setState in effect to avoid React warning
  const shouldProcess = !isLoadingIntent && !authLoading && !hasProcessed;
  
  useEffect(() => {
    if (!shouldProcess) return;

    // No user - mark as processed via scheduled state update
    if (!user) {
      const timer = setTimeout(() => {
        setHasProcessed(true);
        setPendingPath(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    // Navigate to pending path
    if (pendingPath && !navigationDone.current) {
      navigationDone.current = true;
      clearDeepLinkFromIDB();
      
      // Schedule state update to avoid direct setState in effect
      const timer = setTimeout(() => {
        setNavigatedToDeepLink(true);
      }, 0);
      
      if (location.pathname !== pendingPath) {
        navigate(pendingPath, { replace: true });
      }
      return () => clearTimeout(timer);
    }
    
    // No navigation needed - schedule state update
    const timer = setTimeout(() => {
      setHasProcessed(true);
      setPendingPath(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [shouldProcess, user, pendingPath, navigate, location.pathname]);

  const value: DeepLinkContextType = {
    isDeepLinkPending: isLoadingIntent || (pendingPath !== null && !hasProcessed),
    isDeepLinkResolved: !isLoadingIntent && !authLoading && (hasProcessed || navigatedToDeepLink),
    navigatedToDeepLink,
  };

  return (
    <DeepLinkContext.Provider value={value}>
      {children}
    </DeepLinkContext.Provider>
  );
}
