document.addEventListener('DOMContentLoaded', () => {
    // --- Notification script from original index.html logic ---
    const notificationToggle = document.getElementById('notification-toggle');
    const notificationContent = document.getElementById('notification-content');
    const notificationBody = document.getElementById('notification-body');

    if (notificationToggle && notificationContent && notificationBody) {
        notificationToggle.addEventListener('click', () => {
            const isExpanded = notificationToggle.getAttribute('aria-expanded') === 'true';
            notificationToggle.setAttribute('aria-expanded', !isExpanded);
            notificationContent.classList.toggle('open');
            notificationToggle.querySelector('.icon').textContent = isExpanded ? '▼' : '▲';
        });

        fetch('notification.md')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.text();
            })
            .then(markdown => {
                if (window.DOMPurify && window.marked) {
                    const sanitizedHtml = DOMPurify.sanitize(marked.parse(markdown));
                    notificationBody.innerHTML = sanitizedHtml;
                } else {
                     notificationBody.innerText = markdown; // Fallback to plain text
                }
            })
            .catch(error => {
                notificationBody.innerHTML = '<p class="text-center text-red-500">お知らせの読み込みに失敗しました。</p>';
                console.error('Error fetching notification:', error);
            });
    }

    // --- Update time script ---
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbxxUhgPYOsJXUowuVpaeOT-398j3q79yEJAeQd2sXC4ECvAHMzMekUQvwq6l5NnjdB2/exec';
    const infectionTimeElement = document.getElementById('infection-update-time');
    const shippingTimeElement = document.getElementById('shipping-update-time');

    const formatDateTime = (isoString) => {
        if (!isoString) return '取得不可';
        try {
            const date = new Date(isoString);
            // JST (UTC+9) としてフォーマット
            const jstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
            const month = jstDate.getUTCMonth() + 1;
            const day = jstDate.getUTCDate();
            const hours = jstDate.getUTCHours();
            const minutes = jstDate.getUTCMinutes();
            
            return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        } catch (e) {
            console.error("Date formatting error:", e);
            return '日付形式エラー';
        }
    };

    if(infectionTimeElement && shippingTimeElement) {
        fetch(GAS_URL)
            .then(response => {
                if (!response.ok) {
                    throw new Error('GAS Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                infectionTimeElement.textContent = `更新: ${formatDateTime(data.infection_status)}`;
                shippingTimeElement.textContent = `更新: ${formatDateTime(data.shipping_status)}`;
            })
            .catch(error => {
                console.error('Error fetching update times:', error);
                infectionTimeElement.textContent = '日時取得エラー';
                shippingTimeElement.textContent = '日時取得エラー';
            });
    }

    // --- Infection Surveillance Preload Logic ---
    const INFECTION_API_URL = 'https://script.google.com/macros/s/AKfycby8wh0NMuPtEOgLVHXfc0jzNqlOENuOgCwQmYYzMSZCKTvhSDiJpZkAyJxntGISTGOmbQ/exec';
    const INFECTION_CACHE_CONFIG = {
        COMBINED_DATA_KEY: 'infection_surveillance_combined_data',
        HISTORY_EXPIRY: 24 * 60 * 60 * 1000 // 24時間
    };

    async function preloadInfectionData() {
        console.log('Preloading infection surveillance data...');
        const now = Date.now();
        try {
            const cached = await localforage.getItem(INFECTION_CACHE_CONFIG.COMBINED_DATA_KEY);
            if (cached && (now - cached.timestamp < INFECTION_CACHE_CONFIG.HISTORY_EXPIRY)) {
                console.log('Infection data already in cache and valid, no preload needed.');
                return;
            }
        } catch (e) {
            console.warn('Preload cache check failed:', e);
        }

        try {
            const response = await fetch(`${INFECTION_API_URL}?type=combined`, {
                redirect: 'follow'
            });

            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await response.text();
                console.error("Received non-JSON response during preload:", text);
                throw new Error(`Invalid content-type: ${contentType}. Expected application/json. Response sample: ${text.substring(0, 100)}`);
            }

            const data = await response.json();

            await localforage.setItem(INFECTION_CACHE_CONFIG.COMBINED_DATA_KEY, {
                timestamp: now,
                data: data
            });
            console.log('Infection surveillance data preloaded and cached successfully.');
        } catch (e) {
            console.error('Error preloading infection data:', e);
        }
    }

    // Call preload function
    preloadInfectionData();
});