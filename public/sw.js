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
  console.log('[SW] Notification Clicked:', event.notification.data);
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        if (event.notification.data.url) {
             client.navigate(event.notification.data.url);
        }
        return client.focus();
      }
      return clients.openWindow(event.notification.data.url || '/');
    })
  );
});
