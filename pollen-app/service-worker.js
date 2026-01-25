// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
const firebaseConfig = {
    apiKey: "AIzaSyAIBR0B_D_1uXZc5RbQeo9DPWKhRY9xDuc",
    authDomain: "pollen-alert-app.firebaseapp.com",
    projectId: "pollen-alert-app",
    storageBucket: "pollen-alert-app.firebasestorage.app",
    messagingSenderId: "974262321585",
    appId: "1:974262321585:web:b7edbba1c74eaf7cb5bd90",
    measurementId: "G-QNN07J889M"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Customize notification here
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: payload.notification.icon || 'https://cdn-icons-png.flaticon.com/512/1163/1163624.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
