
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            if (url.pathname === '/api/subscribe' && request.method === 'POST') {
                const body = await request.json();
                const { subscription, settings } = body;

                if (!subscription || !settings) {
                    return new Response('Missing body', { status: 400, headers: corsHeaders });
                }

                const stmt = env.DB.prepare(`
          INSERT INTO subscribers (endpoint, keys, city_code, city_name, threshold_hourly, threshold_daily, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(endpoint) DO UPDATE SET
            keys = excluded.keys,
            city_code = excluded.city_code,
            city_name = excluded.city_name,
            threshold_hourly = excluded.threshold_hourly,
            threshold_daily = excluded.threshold_daily,
            created_at = excluded.created_at
        `);

                await stmt.bind(
                    subscription.endpoint,
                    JSON.stringify(subscription.keys),
                    settings.cityCode,
                    settings.cityName,
                    settings.thresholdHourly,
                    settings.thresholdDaily,
                    Date.now()
                ).run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (url.pathname === '/api/unsubscribe' && request.method === 'POST') {
                const body = await request.json();
                const { endpoint } = body;

                await env.DB.prepare('DELETE FROM subscribers WHERE endpoint = ?').bind(endpoint).run();

                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            if (url.pathname === '/api/vapid-key' && request.method === 'GET') {
                return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Test Push Endpoint
            if (url.pathname === '/api/test-push' && request.method === 'POST') {
                const body = await request.json();
                const { subscription } = body;

                // Send background notification with a 10-second delay
                // Use ctx.waitUntil to keep the worker alive after the response is sent
                const delayedPush = (async () => {
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    try {
                        // Note: To send a payload, it MUST be encrypted according to RFC 8291.
                        // Since encryption is complex, we send NO payload (body: null).
                        // The Service Worker will catch the push event and show a default notification.
                        await sendWebPush(env, subscription, null);
                        console.log('Delayed test push sent successfully (no payload)');
                    } catch (err) {
                        console.error('Delayed test push error:', err);
                    }
                })();

                ctx.waitUntil(delayedPush);

                return new Response(JSON.stringify({
                    success: true,
                    message: '10秒後にバックグラウンド通知を送信します。その間にブラウザを閉じたりしてテストしてください。'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (e) {
            console.error(e);
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    },

    async scheduled(event, env, ctx) {
        console.log('Cron triggered');

        const job = async () => {
            // 1. Fetch Pollen Data
            const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const dateStr = `${y}${m}${d}`;

            const apiUrl = `https://wxtech.weathernews.com/opendata/v1/pollen?citycode=ALL&start=${dateStr}&end=${dateStr}`;

            console.log(`Fetching pollen data: ${apiUrl}`);
            const resp = await fetch(apiUrl);
            if (!resp.ok) {
                console.error('Failed to fetch pollen data');
                return;
            }

            const csvText = await resp.text();
            const lines = csvText.trim().split('\n');

            const pollenData = {}; // cityCode -> { latest, dailySum }

            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length < 3) continue;

                const cityCode = cols[1];
                const pollen = parseInt(cols[2]);

                if (isNaN(pollen) || pollen < 0) continue;

                if (!pollenData[cityCode]) {
                    pollenData[cityCode] = { latest: 0, dailySum: 0, count: 0 };
                }

                pollenData[cityCode].dailySum += pollen;
                pollenData[cityCode].latest = pollen;
            }

            // 2. Fetch Subscribers
            const { results } = await env.DB.prepare('SELECT * FROM subscribers').all();

            console.log(`Checking ${results.length} subscribers`);

            const notifications = [];
            const deleteEndpoints = [];

            for (const sub of results) {
                const cityData = pollenData[sub.city_code];
                if (!cityData) continue;

                let shouldNotify = false;
                let messageBody = '';

                if (cityData.latest >= sub.threshold_hourly) {
                    shouldNotify = true;
                    messageBody += `${sub.city_name}の1時間飛散量: ${cityData.latest}個\n`;
                }
                if (cityData.dailySum >= sub.threshold_daily) {
                    shouldNotify = true;
                    messageBody += `${sub.city_name}の本日積算: ${cityData.dailySum}個\n`;
                }

                if (shouldNotify) {
                    console.log(`Sending notification to subscriber in ${sub.city_name}`);
                    const pushPayload = {
                        title: '【花粉アラート】',
                        body: messageBody.trim(),
                        icon: 'https://cdn-icons-png.flaticon.com/512/1163/1163624.png',
                        data: {
                            url: './index.html'
                        }
                    };

                    const subscription = {
                        endpoint: sub.endpoint,
                        keys: JSON.parse(sub.keys)
                    };

                    notifications.push(
                        sendWebPush(env, subscription, pushPayload)
                            .then(() => {
                                console.log(`Notification sent successfully to ${sub.endpoint.slice(0, 30)}...`);
                            })
                            .catch(err => {
                                if (err.status === 410 || err.status === 404) {
                                    console.warn(`Endpoint expired or not found (${err.status}), marking for deletion: ${sub.endpoint.slice(0, 30)}...`);
                                    deleteEndpoints.push(sub.endpoint);
                                } else {
                                    console.error('Push delivery error:', {
                                        endpoint: sub.endpoint.slice(0, 30) + '...',
                                        status: err.status,
                                        message: err.message
                                    });
                                }
                            })
                    );
                }
            }

            await Promise.all(notifications);

            // Cleanup dead tokens
            if (deleteEndpoints.length > 0) {
                console.log(`Deleting ${deleteEndpoints.length} invalid endpoints`);
                const batch = env.DB.batch(
                    deleteEndpoints.map(ep => env.DB.prepare('DELETE FROM subscribers WHERE endpoint = ?').bind(ep))
                );
                await batch;
            }
        };

        ctx.waitUntil(job());
    }
};

/**
 * Native Web Push implementation using Web Crypto and Fetch
 */
async function sendWebPush(env, subscription, payload) {
    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    // VAPID Setup
    const vapidSubject = env.VAPID_SUBJECT || 'mailto:admin@example.com';
    const vapidPublicKey = env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = env.VAPID_PRIVATE_KEY;

    if (!vapidPublicKey || !vapidPrivateKey) {
        throw new Error('VAPID keys missing in environment variables');
    }

    // 1. Import VAPID Private Key
    let vapidPrivKey;
    try {
        // Try to decode as base64/base64url
        const cleanKey = vapidPrivateKey.replace(/-----BEGIN PRIVATE KEY-----/, '')
            .replace(/-----END PRIVATE KEY-----/, '')
            .replace(/\s/g, '');

        const privKeyBuffer = b64UrlDecode(cleanKey);

        if (privKeyBuffer.length === 32) {
            // Raw 32-byte private key, use JWK import
            // We need the public key to construct the JWK
            const pubKeyBuffer = b64UrlDecode(vapidPublicKey.replace(/\s/g, ''));

            // P-256 public key is 65 bytes (0x04 + X + Y)
            let x, y;
            if (pubKeyBuffer.length === 65 && pubKeyBuffer[0] === 0x04) {
                x = b64UrlEncode(pubKeyBuffer.slice(1, 33));
                y = b64UrlEncode(pubKeyBuffer.slice(33, 65));
            } else {
                throw new Error('Invalid VAPID public key format (expected 65-byte uncompressed point)');
            }

            vapidPrivKey = await crypto.subtle.importKey(
                'jwk',
                {
                    kty: 'EC',
                    crv: 'P-256',
                    x: x,
                    y: y,
                    d: b64UrlEncode(privKeyBuffer),
                    ext: true,
                },
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['sign']
            );
        } else {
            // Assume it's already PKCS8
            vapidPrivKey = await crypto.subtle.importKey(
                'pkcs8',
                privKeyBuffer,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['sign']
            );
        }
    } catch (err) {
        console.error('Error importing VAPID private key:', err);
        throw new Error(`Failed to import VAPID private key: ${err.message}`);
    }

    // 2. Generate VAPID Token
    const audience = new URL(endpoint).origin;
    const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

    const jwtHeader = { alg: 'ES256', typ: 'JWT' };
    const jwtPayload = {
        aud: audience,
        exp: expiry,
        sub: vapidSubject
    };

    const encodedHeader = b64UrlEncode(new TextEncoder().encode(JSON.stringify(jwtHeader)));
    const encodedPayload = b64UrlEncode(new TextEncoder().encode(JSON.stringify(jwtPayload)));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        vapidPrivKey,
        new TextEncoder().encode(unsignedToken)
    );

    const encodedSignature = b64UrlEncode(new Uint8Array(signature));
    const vapidToken = `${unsignedToken}.${encodedSignature}`;

    // 3. Send Notification
    // Authorization header per RFC 8292: vapid t=<token>, k=<publicKey>
    const headers = {
        'Authorization': `vapid t=${vapidToken}, k=${vapidPublicKey}`,
        'TTL': '86400', // 1 day
    };

    const fetchOptions = {
        method: 'POST',
        headers: headers
    };

    if (payload !== null) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(payload);
    }

    const response = await fetch(endpoint, fetchOptions);

    if (!response.ok) {
        const text = await response.text();
        throw { status: response.status, message: text };
    }

    return response;
}

// Utility functions
function b64UrlEncode(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function b64UrlDecode(str) {
    const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
}
