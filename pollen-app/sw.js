self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
    console.log('[Service Worker] Push Received.');
    console.log('[Service Worker] Raw data:', event.data ? event.data.text() : 'No data');

    let data = {};
    if (event.data) {
        try {
            data = event.data.json();
            console.log('[Service Worker] Parsed JSON data:', data);
        } catch (e) {
            console.warn('[Service Worker] Push data parsing failed (likely unencrypted payload), using as text.');
            data = { body: event.data.text() };
        }
    }

    const title = data.title || '花粉飛散通知';
    const options = {
        body: data.body || '新しい飛散情報があります',
        icon: 'https://cdn-icons-png.flaticon.com/512/1163/1163624.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/1163/1163624.png',
        data: data.data || { url: './index.html' },
        vibrate: [200, 100, 200],
        tag: 'pollen-alert', // Overwrite old notification with same tag
        renotify: true,      // Vibrate/notify even if tag is same
        actions: [
            { action: 'open', title: '詳細を見る' }
        ]
    };

    // simplified: Always show notification on push event to ensure reliability in background
    event.waitUntil(
        self.registration.showNotification(title, options)
            .catch(err => console.error('[Service Worker] showNotification failed:', err))
    );
});

self.addEventListener('notificationclick', function (event) {
    console.log('[Service Worker] Notification click received.');

    event.notification.close();

    const urlToOpen = (event.notification.data && event.notification.data.url) || './index.html';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function (clientList) {
            // Check if there's already a tab open with this URL
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                // Simple check: if the client URL contains the target page
                if (urlToOpen === './index.html' || client.url.includes('index.html')) {
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
            }
            // If not, open a new window
            if (clients.openWindow) {
                // If relative URL, resolve it against the SW scope
                const absoluteUrl = new URL(urlToOpen, self.location.href).href;
                return clients.openWindow(absoluteUrl);
            }
        })
    );
});
