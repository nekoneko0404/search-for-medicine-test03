export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil(handleScheduled(env));
    },

    async fetch(request, env) {
        // 手動トリガー用
        return await handleScheduled(env);
    }
};

async function handleScheduled(env) {
    try {
        const todayStr = getTodayDateString();
        const API_URL = `https://wxtech.weathernews.com/opendata/v1/pollen?citycode=ALL&start=${todayStr}&end=${todayStr}`;

        console.log(`Fetching pollen data from: ${API_URL}`);

        // Weathernews APIからデータ取得
        let csvData;
        try {
            const response = await fetch(API_URL);

            if (response.status === 404) {
                const errorData = await response.text();
                if (errorData && errorData.includes('data does not exist')) {
                    console.log('Pollen data does not exist yet for today. Skipping alert check.');
                    return new Response('No data available', { status: 200 });
                }
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            csvData = await response.text();
        } catch (error) {
            console.error('Error fetching pollen data:', error);
            throw error;
        }

        // CSVパース
        const lines = csvData.trim().split('\n');
        const pollenMap = {};

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

        // Firestoreから購読者を取得
        console.log('Fetching subscribers...');
        const subscribers = await getFirestoreDocuments(env, 'pollen_subscribers');

        if (!subscribers || subscribers.length === 0) {
            console.log('No subscribers found.');
            return new Response('No subscribers', { status: 200 });
        }

        const messages = [];

        for (const doc of subscribers) {
            const token = doc.fields.token.stringValue;
            const cityCode = doc.fields.cityCode.stringValue;
            const threshold = doc.fields.thresholdHourly ? parseInt(doc.fields.thresholdHourly.integerValue) : 10;
            const cityName = doc.fields.cityName ? doc.fields.cityName.stringValue : cityCode;

            if (pollenMap[cityCode] !== undefined) {
                const currentPollen = pollenMap[cityCode];

                if (currentPollen >= threshold) {
                    console.log(`Alert for ${cityName}: ${currentPollen} >= ${threshold}`);

                    messages.push({
                        token: token,
                        cityName: cityName,
                        pollen: currentPollen
                    });
                }
            }
        }

        if (messages.length > 0) {
            console.log(`Sending ${messages.length} notifications...`);

            // FCM V1 APIで通知送信
            const accessToken = await getAccessToken(env);

            for (const msg of messages) {
                try {
                    await sendFCMNotification(env, accessToken, msg);
                    console.log(`Sent notification to ${msg.cityName}`);
                } catch (error) {
                    console.error(`Failed to send notification:`, error);
                }
            }

            console.log('Notification sending completed.');
        } else {
            console.log('No alerts to send.');
        }

        return new Response('Success', { status: 200 });

    } catch (error) {
        console.error('Error:', error);
        return new Response(`Error: ${error.message}`, { status: 500 });
    }
}

function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function getFirestoreDocuments(env, collection) {
    const projectId = env.FIREBASE_PROJECT_ID;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;

    const accessToken = await getAccessToken(env);

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        throw new Error(`Firestore API error: ${response.status}`);
    }

    const data = await response.json();
    return data.documents || [];
}

async function getAccessToken(env) {
    const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));

    const now = Math.floor(Date.now() / 1000);
    const jwtClaimSet = {
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
    };

    const jwtClaimSetEncoded = btoa(JSON.stringify(jwtClaimSet)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const signatureInput = `${jwtHeader}.${jwtClaimSetEncoded}`;

    // RS256署名（Web Crypto API使用）
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const key = await crypto.subtle.importKey(
        'pkcs8',
        str2ab(atob(privateKey.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, ''))),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        key,
        new TextEncoder().encode(signatureInput)
    );

    const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

    const jwt = `${signatureInput}.${signatureBase64}`;

    // トークン取得
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
}

async function sendFCMNotification(env, accessToken, msg) {
    const projectId = env.FIREBASE_PROJECT_ID;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const payload = {
        message: {
            token: msg.token,
            notification: {
                title: `【花粉アラート】${msg.cityName}`,
                body: `現在の花粉飛散量は ${msg.pollen} 個です。対策をしてください。`
            },
            data: {
                pollen: String(msg.pollen),
                url: 'https://search-for-medicine.pages.dev/pollen-app/index.html'
            }
        }
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`FCM API error: ${response.status} - ${error}`);
    }
}

function str2ab(str) {
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}
