/**
 * Logic for index.html
 */

document.addEventListener('DOMContentLoaded', () => {
    initNotification();
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
