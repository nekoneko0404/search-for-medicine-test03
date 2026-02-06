import { loadAndCacheData } from './data.js';
import { updateProgress } from './ui.js';
import './components/MainFooter.js';
import './components/MainHeader.js';

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

    if (infectionTimeElement && shippingTimeElement) {
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

});