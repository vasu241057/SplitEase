// SplitEase Service Worker
// IndexedDB for persistent deep-link storage that survives SW termination

const DB_NAME = 'SplitEaseDeepLink';
const DB_VERSION = 1;
const STORE_NAME = 'pendingLinks';

// CRITICAL: Force new SW to take control immediately
// This ensures the new SW with IndexedDB logic handles notification clicks
self.addEventListener('install', (event) => {
  console.log('[SW INSTALL] New SW installing, skipping wait');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW ACTIVATE] New SW activating, claiming all clients');
  event.waitUntil(clients.claim());
});

// Open or create the IndexedDB database
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

// Save deep link to IndexedDB (survives SW termination)
function saveDeepLink(url) {
  console.log('[SW IDB] Saving deep link:', url);
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(url, 'current');
      tx.oncomplete = () => {
        console.log('[SW IDB] Deep link saved successfully');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }).catch(err => {
    console.error('[SW IDB] Failed to save deep link:', err);
  });
}

// Read deep link from IndexedDB
function readDeepLink() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get('current');
      request.onsuccess = () => {
        console.log('[SW IDB] Read deep link:', request.result);
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }).catch(err => {
    console.error('[SW IDB] Failed to read deep link:', err);
    return null;
  });
}

// Clear deep link from IndexedDB (after consumption)
function clearDeepLink() {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete('current');
      tx.oncomplete = () => {
        console.log('[SW IDB] Deep link cleared');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }).catch(err => {
    console.error('[SW IDB] Failed to clear deep link:', err);
    console.log('additional log');
  });
}

// Push notification handler
self.addEventListener('push', function(event) {
  console.log('[SW PUSH] Push Received');
  
  if (event.data) {
    const data = event.data.json();
    console.log('[SW PUSH] Data:', JSON.stringify(data));
    
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: {
        url: data.url
      }
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Message handler for client requests
self.addEventListener('message', (event) => {
  console.log('[SW MSG] Received message:', event.data?.type);
  
  if (event.data && event.data.type === 'GET_PENDING_DEEPLINK') {
    // Client is asking for any pending deep link
    event.waitUntil(
      readDeepLink().then(url => {
        if (url) {
          console.log('[SW MSG] Responding with pending link:', url);
          event.source.postMessage({
            type: 'DEEP_LINK_NAVIGATION',
            url: url
          });
          // Clear after sending
          return clearDeepLink();
        } else {
          console.log('[SW MSG] No pending link found');
        }
      })
    );
  } else if (event.data && event.data.type === 'CLEAR_DEEPLINK') {
    // Client consumed the link, clear it
    event.waitUntil(clearDeepLink());
  }
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  const deepLinkUrl = event.notification.data?.url || '/';
  const timestamp = new Date().toISOString();
  console.log(`[SW CLICK ${timestamp}] Notification clicked, deepLink: ${deepLinkUrl}`);
  event.notification.close();

  event.waitUntil(
    // STEP 1: ALWAYS save to IndexedDB FIRST (survives SW termination)
    saveDeepLink(deepLinkUrl).then(() => {
      console.log('[SW CLICK] Deep link persisted to IDB, now finding clients...');
      
      return clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(clientList) {
      console.log(`[SW CLICK] Found ${clientList.length} clients`);
      
      if (clientList.length > 0) {
        let focusedClient = null;
        let anyClient = clientList[0];
        
        for (const client of clientList) {
          if (client.focused) {
            focusedClient = client;
            break;
          }
        }

        if (focusedClient) {
          // FOREGROUND: Client is active and listening
          console.log('[SW CLICK] FOREGROUND - postMessage to focused client');
          focusedClient.postMessage({
            type: 'DEEP_LINK_NAVIGATION',
            url: deepLinkUrl
          });
          // DON'T clear IDB here - client will clear after consumption
          // This ensures fallback if postMessage somehow fails
          return focusedClient.focus();
        } else {
          // BACKGROUND: Client exists but not focused
          // navigate() will reload the page, so postMessage might be lost
          // IDB will serve as the reliable fallback
          console.log('[SW CLICK] BACKGROUND - navigate() (IDB is backup)');
          return anyClient.navigate(deepLinkUrl).then(function(client) {
            if (client) {
              // postMessage is optimistic but might be lost during reload
              client.postMessage({
                type: 'DEEP_LINK_NAVIGATION',
                url: deepLinkUrl
              });
              // DON'T clear IDB - page might be reloading, client will clear after reading from IDB
              return client.focus();
            }
          });
        }
      }

      // COLD START: No clients exist
      // IDB already has the link saved. Just open the window.
      // The client will read from IDB on startup.
      console.log('[SW CLICK] COLD START - opening window, link is in IDB');
      return clients.openWindow(deepLinkUrl);
      // DO NOT clear IDB here - client hasn't read it yet
    })
  );
});
