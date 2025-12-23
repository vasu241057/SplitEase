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

// IndexedDB helpers (same interface as SW)
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
  console.log('[CTX IDB] Reading deep link from IndexedDB...');
  return openDB().then(db => {
    return new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('current');
      request.onsuccess = () => {
        const result = request.result || null;
        console.log('[CTX IDB] Read result:', result);
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  }).catch(err => {
    console.error('[CTX IDB] Failed to read:', err);
    return null;
  });
}

function clearDeepLinkFromIDB(): Promise<void> {
  console.log('[CTX IDB] Clearing deep link from IndexedDB...');
  return openDB().then(db => {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete('current');
      tx.oncomplete = () => {
        console.log('[CTX IDB] Cleared');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }).catch(err => {
    console.error('[CTX IDB] Failed to clear:', err);
  });
}

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
 * DeepLinkProvider - Single Source of Truth: IndexedDB
 * 
 * Architecture:
 * 1. SW writes deep link to IndexedDB on notification click (survives SW termination)
 * 2. Client reads from IndexedDB on mount (deterministic, no race conditions)
 * 3. Client also listens for postMessage (for foreground case where IDB read might be slower)
 * 4. After consumption, clear IndexedDB
 */
export function DeepLinkProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // State
  const [isLoadingIntent, setIsLoadingIntent] = useState(true); // Block until IDB read completes
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState(false);
  
  // Refs
  const navigationDone = useRef(false);
  const idbChecked = useRef(false);

  // STEP 1: Read from IndexedDB on mount (the authoritative source)
  useEffect(() => {
    console.log('[CTX 1] DeepLinkContext mounted, reading from IDB...');
    
    readDeepLinkFromIDB().then(idbPath => {
      console.log('[CTX 2] IDB returned:', idbPath);
      idbChecked.current = true;
      
      if (idbPath && isDeepLinkPath(idbPath)) {
        console.log('[CTX 3] Valid deep link from IDB:', idbPath);
        setPendingPath(idbPath);
        // DON'T clear yet - wait until we actually navigate
      } else {
        console.log('[CTX 3] No valid deep link in IDB');
        // Also check window.location as fallback (for direct URL access)
        const currentPath = window.location.pathname;
        console.log('[CTX 4] Checking window.location:', currentPath);
        if (isDeepLinkPath(currentPath)) {
          console.log('[CTX 5] Valid deep link from window.location:', currentPath);
          setPendingPath(currentPath);
        }
      }
      
      setIsLoadingIntent(false);
    });
    
    // This effect runs only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // STEP 2: Listen for postMessage from SW (foreground/background cases)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DEEP_LINK_NAVIGATION' && event.data?.url) {
        const targetUrl = event.data.url;
        console.log('[CTX MSG] Received postMessage from SW:', targetUrl);
        
        const path = new URL(targetUrl, window.location.origin).pathname;
        
        // If already authenticated, navigate immediately
        if (user && !authLoading) {
          console.log('[CTX MSG] Navigating immediately:', path);
          clearDeepLinkFromIDB(); // Clear since we're handling it
          navigate(path, { replace: true });
        } else {
          // Store for later consumption after auth
          console.log('[CTX MSG] Storing for post-auth:', path);
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

  // STEP 3: Process pending deep-link after auth resolves
  useEffect(() => {
    // Wait for IDB check to complete
    if (isLoadingIntent) {
      console.log('[CTX PROC] Waiting for IDB check...');
      return;
    }
    
    // Wait for auth to finish
    if (authLoading) {
      console.log('[CTX PROC] Auth loading...');
      return;
    }

    // Skip if already processed
    if (hasProcessed) {
      return;
    }

    console.log(`[CTX PROC] Processing. User: ${!!user}, PendingPath: ${pendingPath}`);

    // If no user, mark as processed
    if (!user) {
      console.log('[CTX PROC] No user, marking processed');
      setHasProcessed(true);
      setPendingPath(null);
      return;
    }

    // Navigate to pending path
    if (pendingPath && !navigationDone.current) {
      console.log('[CTX PROC] Navigating to:', pendingPath);
      navigationDone.current = true;
      
      // Clear from IDB since we're consuming it
      clearDeepLinkFromIDB();
      
      if (location.pathname !== pendingPath) {
        navigate(pendingPath, { replace: true });
      }
    }
    
    console.log('[CTX PROC] Processing complete');
    setHasProcessed(true);
    setPendingPath(null);
  }, [isLoadingIntent, authLoading, user, hasProcessed, pendingPath, navigate, location.pathname]);

  // Derive context value
  const value: DeepLinkContextType = {
    isDeepLinkPending: isLoadingIntent || (pendingPath !== null && !hasProcessed),
    isDeepLinkResolved: !isLoadingIntent && !authLoading && hasProcessed,
  };

  console.log(`[CTX STATE] isLoadingIntent=${isLoadingIntent}, pending=${pendingPath}, processed=${hasProcessed}, resolved=${value.isDeepLinkResolved}`);

  return (
    <DeepLinkContext.Provider value={value}>
      {children}
    </DeepLinkContext.Provider>
  );
}
