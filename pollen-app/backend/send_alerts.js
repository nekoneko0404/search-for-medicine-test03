const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin SDK
// The service account key is passed via environment variable or file
// In GitHub Actions, we'll write the secret to a file or parse it from env
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

const POLLEN_API_URL = 'https://wxtech.weathernews.com/opendata/v1/pollen?citycode=ALL';

async function main() {
    try {
        console.log('Fetching pollen data...');
        const response = await axios.get(POLLEN_API_URL);
        const csvData = response.data;

        // Parse CSV (Simple parser)
        // Format: date,citycode,pollen,prefcode,cityname,station_name
        const lines = csvData.trim().split('\n');
        const headers = lines[0].split(',');

        // Create a map of cityCode -> pollenCount (latest hour)
        const pollenMap = {};

        // We only care about the latest data for each city
        // The CSV might contain multiple lines per city (history), but usually the API returns latest?
        // Actually the spec says "Realtime (1 hour)". Let's assume it returns current data for all cities.
        // If it returns history, we need to filter for the latest date/time.
        // Let's assume the API returns the latest available data for all cities.

        // Skip header
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 3) continue;

            const dateStr = cols[0]; // e.g., 2023-02-27T10:00:00
            const cityCode = cols[1];
            const pollen = parseInt(cols[2]);

            // Store the latest pollen count for the city
            // If there are duplicates, we might want the latest timestamp, but usually this API endpoint is a snapshot.
            // Let's just overwrite.
            if (!isNaN(pollen) && pollen >= 0) {
                pollenMap[cityCode] = pollen;
            }
        }

        console.log(`Loaded pollen data for ${Object.keys(pollenMap).length} cities.`);

        // Fetch all subscribers
        console.log('Fetching subscribers...');
        const snapshot = await db.collection('pollen_subscribers').get();

        if (snapshot.empty) {
            console.log('No subscribers found.');
            return;
        }

        const messages = [];
        const tokensToDelete = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const token = data.token;
            const cityCode = data.cityCode;
            const threshold = data.thresholdHourly || 10;

            if (pollenMap[cityCode] !== undefined) {
                const currentPollen = pollenMap[cityCode];

                if (currentPollen >= threshold) {
                    console.log(`Alert for ${data.cityName}: ${currentPollen} >= ${threshold}`);

                    messages.push({
                        token: token,
                        notification: {
                            title: `【花粉アラート】${data.cityName}`,
                            body: `現在の花粉飛散量は ${currentPollen} 個です。対策をしてください。`
                        },
                        data: {
                            cityCode: cityCode,
                            pollen: String(currentPollen),
                            url: 'https://search-for-medicine.pages.dev/pollen-app/index.html' // TODO: Update with real URL
                        }
                    });
                }
            }
        });

        if (messages.length > 0) {
            console.log(`Sending ${messages.length} notifications...`);

            // Send in batches of 500 (FCM limit)
            // Since we are using send() for individual messages or sendEach()
            // Let's use sendEach()

            const response = await messaging.sendEach(messages);
            console.log(`Successfully sent ${response.successCount} messages; Failed ${response.failureCount} messages.`);

            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const error = resp.error;
                        if (error.code === 'messaging/registration-token-not-registered') {
                            tokensToDelete.push(messages[idx].token);
                        }
                    }
                });
            }
        } else {
            console.log('No alerts to send.');
        }

        // Cleanup invalid tokens
        if (tokensToDelete.length > 0) {
            console.log(`Deleting ${tokensToDelete.length} invalid tokens...`);
            const batch = db.batch();
            tokensToDelete.forEach(token => {
                const ref = db.collection('pollen_subscribers').doc(token);
                batch.delete(ref);
            });
            await batch.commit();
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
