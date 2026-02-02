const API_BASE = "https://anonymous-bbs-worker.neko-neko-0404.workers.dev/api/posts";
const MAX_CHARS = 400;
let allPosts = []; // データを保持
let currentPage = 1;

document.addEventListener('DOMContentLoaded', () => {
    const mainContent = document.querySelector('.main-content');
    const postContent = document.getElementById('postContent');
    const submitBtn = document.getElementById('submitBtn');
    const charCount = document.querySelector('.char-count');
    const postsContainer = document.getElementById('postsContainer');
    const statusMessage = document.getElementById('statusMessage');
    const paginationContainer = document.getElementById('pagination');

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

        const adminKey = new URLSearchParams(window.location.search).get('key');

        try {
            const res = await fetch(API_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, adminKey })
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
            allPosts = await res.json();
            renderPosts();
        } catch (err) {
            postsContainer.innerHTML = `<p class="error">読み込みエラー: ${err.message}</p>`;
        }
    }

    // Render posts
    function renderPosts() {
        postsContainer.innerHTML = '';
        if (allPosts.length === 0) {
            postsContainer.innerHTML = '<p class="loading">投稿はまだありません。</p>';
            paginationContainer.innerHTML = '';
            return;
        }

        // ページごとの表示制御
        // 1P: 10件
        // 2P+: 20件
        let start, end;
        if (currentPage === 1) {
            start = 0;
            end = 10;
            mainContent.classList.remove('is-p2-plus');
        } else {
            // 2P目以降: 1P(10件) + (page-2)*20件 から開始
            start = 10 + (currentPage - 2) * 20;
            end = start + 20;
            mainContent.classList.add('is-p2-plus');
        }

        const displayPosts = allPosts.slice(start, end);

        displayPosts.forEach(post => {
            const el = document.createElement('div');
            el.className = 'post';
            if (post.is_admin) el.classList.add('is-admin');
            el.dataset.postNumber = post.post_number;

            const date = new Date(post.created_at).toLocaleString('ja-JP');
            const adminKey = new URLSearchParams(window.location.search).get('key');
            // Show delete button if local key exists OR if admin key is present
            const canDelete = getDeleteKey(post.id) || adminKey;

            // Header part (Meta + Delete Button)
            const metaDiv = document.createElement('div');
            metaDiv.className = 'post-meta';

            const leftMeta = document.createElement('div');
            leftMeta.className = 'left-meta';

            if (post.post_number) {
                const numSpan = document.createElement('span');
                numSpan.className = 'post-number';
                numSpan.textContent = `${post.post_number}`;
                leftMeta.appendChild(numSpan);
            }

            if (post.is_admin) {
                const badge = document.createElement('span');
                badge.className = 'admin-badge';
                badge.textContent = '管理者';
                leftMeta.appendChild(badge);
            }

            const dateSpan = document.createElement('span');
            dateSpan.textContent = date;
            leftMeta.appendChild(dateSpan);

            const replyBtn = document.createElement('button');
            replyBtn.className = 'reply-btn';
            replyBtn.textContent = '返信';
            replyBtn.addEventListener('click', () => {
                const prefix = `>>${post.post_number}\n`;
                postContent.value = prefix + postContent.value;
                postContent.focus();
                // Scroll to top to see textarea
                window.scrollTo({ top: document.querySelector('.post-form').offsetTop - 20, behavior: 'smooth' });
            });
            leftMeta.appendChild(replyBtn);

            metaDiv.appendChild(leftMeta);

            if (canDelete) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.textContent = '削除';
                deleteBtn.addEventListener('click', () => deletePost(post.id, adminKey));
                metaDiv.appendChild(deleteBtn);
            }

            // Content part (Safe rendering + Reply link parsing)
            const contentDiv = document.createElement('div');
            contentDiv.className = 'post-content';

            // Parse for >>[number] links
            const contentText = post.content;
            const parts = contentText.split(/(>>\d+)/g);
            parts.forEach(part => {
                if (part.match(/^>>\d+$/)) {
                    const num = part.substring(2);
                    const link = document.createElement('a');
                    link.href = '#';
                    link.className = 'reply-link';
                    link.textContent = part;
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        const target = document.querySelector(`.post[data-post-number="${num}"]`);
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            target.style.backgroundColor = '#fef08a'; // Flash highlight
                            setTimeout(() => { target.style.backgroundColor = ''; }, 2000);
                        }
                    });

                    // Hover Preview Events
                    link.addEventListener('mouseenter', (e) => showPreview(e, num));
                    link.addEventListener('mouseleave', hidePreview);

                    contentDiv.appendChild(link);
                } else {
                    contentDiv.appendChild(document.createTextNode(part));
                }
            });

            el.appendChild(metaDiv);
            el.appendChild(contentDiv);
            postsContainer.appendChild(el);
        });

        renderPagination();
    }

    // Hover Preview Logic
    let currentPreview = null;

    function showPreview(e, postNumber) {
        const targetPost = allPosts.find(p => p.post_number == postNumber);
        if (!targetPost) return;

        hidePreview();

        const preview = document.createElement('div');
        preview.className = 'hover-preview';

        const meta = document.createElement('div');
        meta.className = 'post-meta';
        meta.textContent = `No.${targetPost.post_number} (${new Date(targetPost.created_at).toLocaleString('ja-JP')})`;

        const content = document.createElement('div');
        content.className = 'post-content';
        content.textContent = targetPost.content;

        preview.appendChild(meta);
        preview.appendChild(content);

        document.body.appendChild(preview);
        currentPreview = preview;

        const rect = e.target.getBoundingClientRect();
        preview.style.left = `${rect.left + window.scrollX}px`;
        preview.style.top = `${rect.top + window.scrollY - preview.offsetHeight - 10}px`;
    }

    function hidePreview() {
        if (currentPreview) {
            currentPreview.remove();
            currentPreview = null;
        }
    }

    // Pagination rendering
    function renderPagination() {
        paginationContainer.innerHTML = '';

        // 最大100件までの制限（サーバー側もLIMIT 100）
        const totalPosts = Math.min(allPosts.length, 100);

        // ページ数の計算
        // 1ページ目(10件) + 残り(90件) / 20件
        let totalPages = 1;
        if (totalPosts > 10) {
            totalPages = 1 + Math.ceil((totalPosts - 10) / 20);
        }

        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
            btn.textContent = i;
            btn.addEventListener('click', () => {
                currentPage = i;
                renderPosts();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            paginationContainer.appendChild(btn);
        }
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
