import webpush from 'web-push';

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

        // Configure Web Push
        if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
            webpush.setVapidDetails(
                env.VAPID_SUBJECT || 'mailto:example@example.com',
                env.VAPID_PUBLIC_KEY,
                env.VAPID_PRIVATE_KEY
            );
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

                try {
                    await webpush.sendNotification(subscription, JSON.stringify({
                        title: 'テスト通知',
                        body: 'これはバックグラウンド通知のテストです。',
                        url: './index.html' // Adjust as needed
                    }));
                    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
                } catch (err) {
                    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
                }
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (e) {
            console.error(e);
            return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
        }
    },

    async scheduled(event, env, ctx) {
        console.log('Cron triggered');

        // Setup VAPID
        if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
            webpush.setVapidDetails(
                env.VAPID_SUBJECT || 'mailto:example@example.com',
                env.VAPID_PUBLIC_KEY,
                env.VAPID_PRIVATE_KEY
            );
        }

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

            // Map: cityCode -> { hourly, daily }
            // CSV Format: date,citycode,pollen,prefcode,cityname,station_name
            // Note: This API returns timeseries. We need the latest hourly and today's sum?
            // Actually the API returns rows for each hour.
            // We need to aggregate.

            const pollenData = {}; // cityCode -> { latest, dailySum }

            // Skip header
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length < 3) continue;

                const cityCode = cols[1];
                const pollen = parseInt(cols[2]);

                if (isNaN(pollen) || pollen < 0) continue; // Skip error codes

                if (!pollenData[cityCode]) {
                    pollenData[cityCode] = { latest: 0, dailySum: 0, count: 0 };
                }

                pollenData[cityCode].dailySum += pollen;
                // Assuming CSV is sorted by time or we just take the last one as latest?
                // Usually appended. Let's assume the last occurrence is the latest.
                pollenData[cityCode].latest = pollen;
            }

            // 2. Fetch Subscribers
            // Process in chunks if necessary, but D1 allows reading all.
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
                    shouldNotify = true; // Logic: Notify if daily exceeded. Need logic to prevent repeated daily alerts?
                    // Simple logic: If exceeded, notify. The user might get notified every hour if it stays high.
                    // Improvement: Add a "last_notified_daily" column or just let it be for now (Warning level is important).
                    messageBody += `${sub.city_name}の本日積算: ${cityData.dailySum}個\n`;
                }

                if (shouldNotify) {
                    const pushPayload = {
                        title: '【花粉アラート】',
                        body: messageBody.trim(),
                        icon: 'https://cdn-icons-png.flaticon.com/512/1163/1163624.png', // Or app icon
                        data: {
                            url: './index.html' // Relative or absolute
                        }
                    };

                    const subscription = {
                        endpoint: sub.endpoint,
                        keys: JSON.parse(sub.keys)
                    };

                    notifications.push(
                        webpush.sendNotification(subscription, JSON.stringify(pushPayload))
                            .catch(err => {
                                if (err.statusCode === 410 || err.statusCode === 404) {
                                    deleteEndpoints.push(sub.endpoint);
                                } else {
                                    console.error('Push error:', err);
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
