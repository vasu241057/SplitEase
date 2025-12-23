// SplitEase Service Worker
const DEEP_LINK_STORAGE_KEY = 'splitease_pending_deeplink';

self.addEventListener('push', function(event) {
  console.log('[SW] Push Received', event);
  
  if (event.data) {
    console.log('[SW] Push Data:', event.data.text());
    const data = event.data.json();
    
    const options = {
      body: data.body,
      icon: data.icon || '/icon-192x192.png',
      badge: '/icon-192x192.png',
      data: {
        url: data.url
      }
    };

    console.log('[SW] Showing Notification:', data.title, options);
    
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } else {
    console.log('[SW] Push event has no data');
  }
});


// Store pending deep link to helper with cold-start race conditions
let pendingDeepLink = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_PENDING_DEEPLINK') {
    if (pendingDeepLink) {
      console.log('[SW] Client asked for pending link, sending:', pendingDeepLink);
      event.source.postMessage({
        type: 'DEEP_LINK_NAVIGATION',
        url: pendingDeepLink
      });
      // Clear it after sending to prevent double-consumption
      pendingDeepLink = null;
    } else {
      console.log('[SW] Client asked for pending link, but none found.');
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  const deepLinkUrl = event.notification.data?.url || '/';
  const timestamp = new Date().toISOString();
  console.log(`[SW ${timestamp}] Notification Clicked, deepLink:`, deepLinkUrl);
  event.notification.close();
  
  // Store for handshake
  pendingDeepLink = deepLinkUrl;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      console.log(`[SW] Found ${clientList.length} clients`);
      
      if (clientList.length > 0) {
        // Find if there's a focused client
        let focusedClient = null;
        let anyClient = clientList[0];
        
        for (const client of clientList) {
          if (client.focused) {
            focusedClient = client;
            break;
          }
        }

        if (focusedClient) {
          // Case 1: App is in FOREGROUND (user is looking at it)
          console.log('[SW] App in FOREGROUND - using postMessage:', deepLinkUrl);
          focusedClient.postMessage({
            type: 'DEEP_LINK_NAVIGATION',
            url: deepLinkUrl
          });
          return focusedClient.focus();
        } else {
          // Case 2: App is in BACKGROUND (minimized but in memory)
          console.log('[SW] App in BACKGROUND - using navigate() + postMessage:', deepLinkUrl);
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

      // Case 3: No window open (cold start)
      // Open a new window with the deep link URL
      console.log('[SW] COLD START - opening new window + postMessage:', deepLinkUrl);
      return clients.openWindow(deepLinkUrl).then(function(client) {
        if (client) {
            // Send the intent explicitly to ensure it sticks even if OS restoration overrides location
            client.postMessage({
                type: 'DEEP_LINK_NAVIGATION',
                url: deepLinkUrl
            });
        }
      });
    })
  );
});


