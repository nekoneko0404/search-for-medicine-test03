const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin SDK
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const messaging = admin.messaging();

function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function sendBatch(messages, db) {
    if (messages.length === 0) return;

    console.log(`Sending batch of ${messages.length} notifications...`);
    const response = await admin.messaging().sendEach(messages);
    console.log(`Batch result: ${response.successCount} success, ${response.failureCount} failure.`);

    if (response.failureCount > 0) {
        const tokensToDelete = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const error = resp.error;
                if (error.code === 'messaging/registration-token-not-registered') {
                    tokensToDelete.push(messages[idx].token);
                }
            }
        });

        if (tokensToDelete.length > 0) {
            console.log(`Deleting ${tokensToDelete.length} invalid tokens...`);
            const batch = db.batch();
            tokensToDelete.forEach(token => {
                const ref = db.collection('pollen_subscribers').doc(token);
                batch.delete(ref);
            });
            await batch.commit();
        }
    }
}

async function main() {
    try {
        const todayStr = getTodayDateString();
        const API_URL = `https://wxtech.weathernews.com/opendata/v1/pollen?citycode=ALL&start=${todayStr}&end=${todayStr}`;

        console.log(`Fetching pollen data from: ${API_URL}`);
        let response;
        try {
            response = await axios.get(API_URL);
        } catch (error) {
            if (error.response && error.response.status === 404) {
                const errorData = error.response.data;
                const errorMessage = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);

                if (errorMessage && errorMessage.includes('data does not exist')) {
                    console.log('Pollen data does not exist yet for today. Skipping alert check.');
                    return;
                }
            }
            throw error;
        }
        const csvData = response.data;

        // Parse CSV (Format: date,citycode,pollen,prefcode,cityname,station_name)
        const lines = csvData.trim().split('\n');
        const pollenMap = {};

        // Skip header, parse data
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length < 3) continue;

            const cityCode = cols[1];
            const pollen = parseInt(cols[2]);

            if (!isNaN(pollen) && pollen >= 0) {
                pollenMap[cityCode] = pollen;
            }
        }

        console.log(`Loaded pollen data for ${Object.keys(pollenMap).length} cities.`);

        // Fetch all subscribers using stream
        console.log('Fetching subscribers...');
        const stream = db.collection('pollen_subscribers').stream();

        let batchMessages = [];
        const BATCH_SIZE = 500; // Firebase limit is 500
        let totalProcessed = 0;

        for await (const doc of stream) {
            const data = doc.data();
            const token = data.token;
            const cityCode = data.cityCode;
            const threshold = data.thresholdHourly || 10;

            if (pollenMap[cityCode] !== undefined) {
                const currentPollen = pollenMap[cityCode];

                if (currentPollen >= threshold) {
                    batchMessages.push({
                        token: token,
                        notification: {
                            title: `【花粉アラート】${data.cityName}`,
                            body: `現在の花粉飛散量は ${currentPollen} 個です。対策をしてください。`
                        },
                        data: {
                            cityCode: cityCode,
                            pollen: String(currentPollen),
                            url: 'https://search-for-medicine.pages.dev/pollen-app/index.html'
                        }
                    });
                }
            }

            if (batchMessages.length >= BATCH_SIZE) {
                await sendBatch(batchMessages, db);
                batchMessages = [];
            }
            totalProcessed++;
        }

        // Send remaining messages
        if (batchMessages.length > 0) {
            await sendBatch(batchMessages, db);
        }

        console.log(`Processed ${totalProcessed} subscribers.`);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();
