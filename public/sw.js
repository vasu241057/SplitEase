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

self.addEventListener('notificationclick', function(event) {
  const deepLinkUrl = event.notification.data?.url || '/';
  console.log('[SW] Notification Clicked, deepLink:', deepLinkUrl);
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
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
          // Use postMessage - the listener is active and will navigate
          console.log('[SW] App in FOREGROUND - using postMessage:', deepLinkUrl);
          focusedClient.postMessage({
            type: 'DEEP_LINK_NAVIGATION',
            url: deepLinkUrl
          });
          return focusedClient.focus();
        } else {
          // Case 2: App is in BACKGROUND (minimized but in memory)
          // Use navigate() to change the URL - this will reload the page
          // When the app re-renders, React Router will read the new URL
          console.log('[SW] App in BACKGROUND - using navigate():', deepLinkUrl);
          return anyClient.navigate(deepLinkUrl).then(function(client) {
            if (client) {
              return client.focus();
            }
          });
        }
      }

      // Case 3: No window open (cold start)
      // Open a new window with the deep link URL
      console.log('[SW] COLD START - opening new window:', deepLinkUrl);
      return clients.openWindow(deepLinkUrl);
    })
  );
});


