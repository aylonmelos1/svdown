// src/view/sw.js

self.addEventListener('install', (event) => {
    console.log('Service Worker: Installed');
    self.skipWaiting(); // Activate new service worker immediately
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activated');
    // Clean up old caches if necessary
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Example: if (cacheName.startsWith('my-app-cache-') && cacheName !== 'my-app-cache-v1') {
                    //     return caches.delete(cacheName);
                    // }
                    return null;
                })
            );
        })
    );
});

self.addEventListener('push', (event) => {
    console.log('Service Worker: Push received');
    const data = event.data.json();
    console.log('Push data:', data);

    const title = data.title || 'SVDown Notification';
    const options = {
        body: data.body || 'You have a new notification from SVDown.',
        icon: data.icon || '/icon.svg', // Default icon
        badge: data.badge || '/icon.svg', // Default badge
        data: {
            url: data.url || '/', // URL to open on click
            notificationId: data.notificationId // For tracking clicks
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked');
    event.notification.close(); // Close the notification

    const clickedNotificationData = event.notification.data;
    const urlToOpen = clickedNotificationData.url || '/';
    const notificationId = clickedNotificationData.notificationId;

    const clickTrackingPromise = new Promise((resolve) => {
        if (notificationId) {
            const clickTrackingUrl = `/api/notification-click/${notificationId}`;
            fetch(clickTrackingUrl, { method: 'POST' })
                .then(response => {
                    if (!response.ok) {
                        console.error(`Failed to track click for notification ${notificationId}`, response.statusText);
                    }
                    console.log(`Successfully tracked click for notification ${notificationId}`);
                })
                .catch(error => {
                    console.error(`Error tracking click for notification ${notificationId}:`, error);
                })
                .finally(() => {
                    resolve();
                });
        } else {
            resolve();
        }
    });

    event.waitUntil(
        Promise.all([
            clickTrackingPromise,
            clients.openWindow(urlToOpen)
        ])
    );
});
