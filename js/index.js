/**
 * Logic for index.html
 */

import { loadAndCacheData } from './data.js';

document.addEventListener('DOMContentLoaded', () => {
    initNotification();

    // プリフェッチのスケジュール
    const startPrefetch = () => {
        // 優先: 医薬品データ（search.html用）を先に呼び出し
        // 並行して読み込むため await はせず、両方の処理を同時に走らせる
        prefetchMedicineData();
        // 次点: 感染症データ
        prefetchInfectionData();
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => startPrefetch(), { timeout: 5000 });
    } else {
        setTimeout(startPrefetch, 3000);
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

                // Parse and sanitize markdown
                const dirtyHtml = marked.parse(filteredContent);
                body.innerHTML = DOMPurify.sanitize(dirtyHtml);
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
// 注意: 最新の infection-surveillance-app/main.js に合わせてAPI URLとキャッシュキー、localforage設定を更新しました。
const INF_SURV_API_URL = 'https://script.google.com/macros/s/AKfycby8wh0NMuPtEOgLVHXfc0jzNqlOENuOgCwQmYYzMSZCKTvhSDiJpZkAyJxntGISTGOmbQ/exec';
const CACHE_CONFIG = {
    // 古いキー: MAIN_DATA_KEY, HISTORY_DATA_KEY
    // 新しいキー: infection-surveillance-app/main.js に合わせる
    COMBINED_DATA_KEY: 'infection_surveillance_combined_data',
    MAIN_EXPIRY: 1 * 60 * 60 * 1000, // 1時間
    HISTORY_EXPIRY: 24 * 60 * 60 * 1000
};

async function prefetchInfectionData() {
    // localforageが利用可能か確認
    if (typeof localforage === 'undefined') {
        console.warn('localforage is not loaded. Skipping prefetch.');
        return;
    }

    // 感染症アプリ側(main.js)で localforage.config をコメントアウトし、
    // デフォルトインスタンス（name: 'localforage', storeName: 'keyvaluepairs'）を使用するように変更したため、
    // ここでもデフォルトインスタンスを使用します。createInstanceは不要です。
    // そのまま window.localforage を使えばOK。

    console.log('Starting prefetch for Infection Surveillance App...');
    const now = Date.now();

    // Combined Data Prefetch (API type=combined)
    try {
        const cachedCombined = await localforage.getItem(CACHE_CONFIG.COMBINED_DATA_KEY);
        // combinedデータは、履歴データのキャッシュ期間（長い方）に合わせるのが基本だが、
        // 最新データを含むため、更新頻度に合わせてチェックする方が安全。
        // main.jsでは `if (cached && (now - cached.timestamp < CACHE_CONFIG.HISTORY_EXPIRY))` となっているのでそれに合わせる。

        if (!cachedCombined || (now - cachedCombined.timestamp >= CACHE_CONFIG.HISTORY_EXPIRY)) {
            console.log('Prefetching combined data...');
            fetch(`${INF_SURV_API_URL}?type=combined`, { redirect: 'follow' })
                .then(res => {
                    if (!res.ok) throw new Error(res.statusText);
                    const contentType = res.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        return res.text().then(text => {
                            throw new Error(`Invalid content-type: ${contentType}. Response: ${text.substring(0, 100)}`);
                        });
                    }
                    return res.json();
                })
                .then(data => {
                    localforage.setItem(CACHE_CONFIG.COMBINED_DATA_KEY, {
                        timestamp: now,
                        data: data
                    });
                    console.log('Combined data prefetched and cached.');
                })
                .catch(err => console.error('Prefetch combined data failed:', err));
        } else {
            console.log('Combined data cache is fresh. Skipping prefetch.');
        }
    } catch (e) {
        console.warn('Prefetch check failed:', e);
    }
}

async function prefetchMedicineData() {
    console.log('Starting prefetch for Medicine Search (search.html)...');
    try {
        // loadAndCacheData は js/data.js で定義されており、
        // デフォルトの localforage インスタンスを使用してデータを取得・キャッシュする。
        // search.html と同じロジックを共有することで、キャッシュの再利用性を高める。
        await loadAndCacheData();
        console.log('Medicine data prefetch completed.');
    } catch (e) {
        console.warn('Medicine data prefetch failed:', e);
    }
}
