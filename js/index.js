/**
 * Logic for index.html
 */

document.addEventListener('DOMContentLoaded', () => {
    initNotification();

    // プリフェッチのスケジュール
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => prefetchInfectionData(), { timeout: 5000 });
    } else {
        setTimeout(prefetchInfectionData, 3000);
    }
});

/**
 * Initialize notification section
 */
async function initNotification() {
    const toggle = document.getElementById('notification-toggle');
    const content = document.getElementById('notification-content');
    const body = document.getElementById('notification-body');

    if (toggle && content) {
        toggle.addEventListener('click', () => {
            content.classList.toggle('open');
            toggle.classList.toggle('open');
        });
    }

    if (body) {
        try {
            const response = await fetch('./notification.md');
            if (response.ok) {
                const markdownContent = await response.text();
                // Filter out content enclosed in <!-- -->
                const filteredContent = markdownContent.replace(/<!--[\s\S]*?-->/g, '').trim();

                if (filteredContent === '') {
                    body.innerHTML = '<p class="text-center text-gray-400">更新情報はありません。</p>';
                    return;
                }

                // Parse markdown
                body.innerHTML = marked.parse(filteredContent);
            } else {
                console.error('Failed to load notification:', response.statusText);
                body.innerHTML = '<p class="text-center text-red-400">更新情報の読み込みに失敗しました。</p>';
            }
        } catch (error) {
            console.error('Error fetching notification:', error);
            body.innerHTML = '<p class="text-center text-red-400">更新情報の読み込みに失敗しました。</p>';
        }
    }
}

// 感染症サーベイランスアプリのデータプリフェッチ
const INF_SURV_API_URL = 'https://script.google.com/macros/s/AKfycbyPukigFWkXjjB9nN8Ve5Xlnn2rgGqiPTCGU8m3F1ETMWYCyxHgd1juOZyGlT_-ljWXNA/exec';
const CACHE_CONFIG = {
    MAIN_DATA_KEY: 'infection_surveillance_main_data',
    HISTORY_DATA_KEY: 'infection_surveillance_history_data',
    MAIN_EXPIRY: 1 * 60 * 60 * 1000, // 1時間に短縮
    HISTORY_EXPIRY: 24 * 60 * 60 * 1000
};

async function prefetchInfectionData() {
    // localforageが利用可能か確認
    if (typeof localforage === 'undefined') {
        console.warn('localforage is not loaded. Skipping prefetch.');
        return;
    }

    // LocalForageの設定（DB名を統一してアプリ画面と共有する）
    localforage.config({
        name: 'KusuriCompassDB',
        storeName: 'infection_surveillance_store'
    });

    console.log('Starting prefetch for Infection Surveillance App...');
    const now = Date.now();

    // Main Data Prefetch
    try {
        const cachedMain = await localforage.getItem(CACHE_CONFIG.MAIN_DATA_KEY);
        if (!cachedMain || (now - cachedMain.timestamp >= CACHE_CONFIG.MAIN_EXPIRY)) {
            console.log('Prefetching main data...');
            // fetchは非同期で投げっぱなしにする
            fetch(`${INF_SURV_API_URL}?type=all`)
                .then(res => {
                    if (!res.ok) throw new Error(res.statusText);
                    return res.json();
                })
                .then(data => {
                    localforage.setItem(CACHE_CONFIG.MAIN_DATA_KEY, {
                        timestamp: now,
                        data: data
                    });
                    console.log('Main data prefetched and cached.');
                })
                .catch(err => console.error('Prefetch main data failed:', err));
        } else {
            console.log('Main data cache is fresh. Skipping prefetch.');
        }
    } catch (e) {
        console.warn('Prefetch check failed:', e);
    }

    // History Data Prefetch
    try {
        const cachedHistory = await localforage.getItem(CACHE_CONFIG.HISTORY_DATA_KEY);
        if (!cachedHistory || (now - cachedHistory.timestamp >= CACHE_CONFIG.HISTORY_EXPIRY)) {
            console.log('Prefetching history data...');
            fetch(`${INF_SURV_API_URL}?type=history`)
                .then(res => {
                    if (!res.ok) throw new Error(res.statusText);
                    return res.text();
                })
                .then(data => {
                    localforage.setItem(CACHE_CONFIG.HISTORY_DATA_KEY, {
                        timestamp: now,
                        data: data
                    });
                    console.log('History data prefetched and cached.');
                })
                .catch(err => console.error('Prefetch history data failed:', err));
        } else {
            console.log('History data cache is fresh. Skipping prefetch.');
        }
    } catch (e) {
        console.warn('History prefetch check failed:', e);
    }
}
