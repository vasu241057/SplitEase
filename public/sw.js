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
      // Case 1 & 2: App is open (foreground or background)
      if (clientList.length > 0) {
        // Find a focused client, or use the first one
        let targetClient = clientList[0];
        for (const client of clientList) {
          if (client.focused) {
            targetClient = client;
            break;
          }
        }

        // Use postMessage to tell the React app to navigate
        // This works for both foreground (app visible) and background (app in memory)
        console.log('[SW] Sending postMessage to client:', deepLinkUrl);
        targetClient.postMessage({
          type: 'DEEP_LINK_NAVIGATION',
          url: deepLinkUrl
        });

        return targetClient.focus();
      }

      // Case 3: No window open (cold start)
      // Open a new window with the deep link URL
      // The app will read this URL on mount via BrowserRouter
      console.log('[SW] Opening new window:', deepLinkUrl);
      return clients.openWindow(deepLinkUrl);
    })
  );
});

