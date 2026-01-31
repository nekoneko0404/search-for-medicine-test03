const API_BASE = "https://anonymous-bbs-worker.neko-neko-0404.workers.dev/api/posts";
const MAX_CHARS = 400;

document.addEventListener('DOMContentLoaded', () => {
    const postContent = document.getElementById('postContent');
    const submitBtn = document.getElementById('submitBtn');
    const charCount = document.querySelector('.char-count');
    const postsContainer = document.getElementById('postsContainer');
    const statusMessage = document.getElementById('statusMessage');

    // Load posts on start
    loadPosts();

    // Character count update
    postContent.addEventListener('input', () => {
        const count = postContent.value.length;
        charCount.textContent = `${count} / ${MAX_CHARS}`;
        if (count > MAX_CHARS) {
            charCount.style.color = 'red';
            submitBtn.disabled = true;
        } else {
            charCount.style.color = '#6b7280';
            submitBtn.disabled = count === 0;
        }
    });

    // Handle submit
    submitBtn.addEventListener('click', async () => {
        const content = postContent.value.trim();
        if (!content) return;
        if (content.length > MAX_CHARS) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送信中...';
        statusMessage.className = 'hidden';

        try {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 429) {
                    throw new Error(data.error || '連投できません。まったりいきましょう。（3時間規制）');
                }
                throw new Error(data.error || '送信に失敗しました。');
            }

            // Save delete key locally
            saveDeleteKey(data.id, data.deleteKey);

            postContent.value = '';
            charCount.textContent = `0 / ${MAX_CHARS}`;
            showStatus('送信しました！', 'success');
            loadPosts();

        } catch (err) {
            showStatus(err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '送信する';
        }
    });

    // Status message helper
    function showStatus(msg, type) {
        statusMessage.textContent = msg;
        statusMessage.className = type;
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }

    // Load posts function
    async function loadPosts() {
        try {
            const res = await fetch(API_BASE);
            if (!res.ok) throw new Error('読み込みに失敗しました');
            const posts = await res.json();
            renderPosts(posts);
        } catch (err) {
            postsContainer.innerHTML = `<p class="error">読み込みエラー: ${err.message}</p>`;
        }
    }

    // Render posts
    function renderPosts(posts) {
        postsContainer.innerHTML = '';
        if (posts.length === 0) {
            postsContainer.innerHTML = '<p class="loading">投稿はまだありません。</p>';
            return;
        }

        posts.forEach(post => {
            const el = document.createElement('div');
            el.className = 'post';

            const date = new Date(post.created_at).toLocaleString('ja-JP');
            const adminKey = new URLSearchParams(window.location.search).get('key');
            // Show delete button if local key exists OR if admin key is present
            const canDelete = getDeleteKey(post.id) || adminKey;

            // Header part (Meta + Delete Button)
            const metaDiv = document.createElement('div');
            metaDiv.className = 'post-meta';

            const dateSpan = document.createElement('span');
            dateSpan.textContent = date;
            metaDiv.appendChild(dateSpan);

            if (canDelete) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.textContent = '削除';
                deleteBtn.addEventListener('click', () => deletePost(post.id, adminKey));
                metaDiv.appendChild(deleteBtn);
            }

            // Content part (Safe rendering)
            const contentDiv = document.createElement('div');
            contentDiv.className = 'post-content';
            contentDiv.textContent = post.content;

            el.appendChild(metaDiv);
            el.appendChild(contentDiv);
            postsContainer.appendChild(el);
        });
    }

    // Delete handling
    async function deletePost(id, adminKey) {
        if (!confirm('この投稿を削除しますか？')) return;

        const key = adminKey || getDeleteKey(id);
        if (!key) return;

        try {
            const res = await fetch(`${API_BASE}?id=${id}`, {
                method: 'DELETE',
                headers: { 'X-Delete-Key': key }
            });

            if (!res.ok) throw new Error('削除できませんでした');

            removeDeleteKey(id);
            loadPosts();
            showStatus('削除しました', 'success');
        } catch (err) {
            showStatus(err.message, 'error');
        }
    }

    // Removed legacy escapeHtml function

    // LocalStorage helpers
    function saveDeleteKey(id, key) {
        let keys = JSON.parse(localStorage.getItem('bbs_keys') || '{}');
        keys[id] = key;
        localStorage.setItem('bbs_keys', JSON.stringify(keys));
    }

    function getDeleteKey(id) {
        let keys = JSON.parse(localStorage.getItem('bbs_keys') || '{}');
        return keys[id];
    }

    function removeDeleteKey(id) {
        let keys = JSON.parse(localStorage.getItem('bbs_keys') || '{}');
        delete keys[id];
        localStorage.setItem('bbs_keys', JSON.stringify(keys));
    }
});
