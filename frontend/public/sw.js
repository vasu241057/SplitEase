// SplitEase Service Worker

const DB_NAME = 'SplitEaseDeepLink';
const DB_VERSION = 1;
const STORE_NAME = 'pendingLinks';

// Force new SW to take control immediately
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

// IndexedDB helpers
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

function saveDeepLink(url) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(url, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }).catch(() => {});
}

// Push notification handler
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: { url: data.url }
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  const deepLinkUrl = event.notification.data?.url || '/';
  event.notification.close();

  event.waitUntil(
    saveDeepLink(deepLinkUrl).then(() => {
      return clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(clientList) {
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
          // FOREGROUND: postMessage
          focusedClient.postMessage({
            type: 'DEEP_LINK_NAVIGATION',
            url: deepLinkUrl
          });
          return focusedClient.focus();
        } else {
          // BACKGROUND: navigate
          return anyClient.navigate(deepLinkUrl).then(function(client) {
            if (client) {
              client.postMessage({
                type: 'DEEP_LINK_NAVIGATION',
                url: deepLinkUrl
              });
              return client.focus();
            }
          });
        }
      }

      // COLD START: open new window
      return clients.openWindow(deepLinkUrl);
    })
  );
});
