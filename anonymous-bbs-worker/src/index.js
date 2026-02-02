const ALLOWED_ORIGIN = "*";

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const ALLOW_HEADERS = "Content-Type, X-Delete-Key, X-Admin-Key, x-admin-key, x-delete-key";

        const CORS_HEADERS = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": ALLOW_HEADERS,
            "Access-Control-Max-Age": "86400",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }

        try {
            if (url.pathname === "/api/posts") {
                if (request.method === "GET") {
                    return await handleGetPosts(request, env, ctx, CORS_HEADERS);
                } else if (request.method === "POST") {
                    return await handleCreatePost(request, env, ctx, CORS_HEADERS);
                } else if (request.method === "DELETE") {
                    return await handleDeletePost(request, env, ctx, CORS_HEADERS);
                }
            }
            return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
            });
        }
    },
};

async function handleGetPosts(request, env, ctx, corsHeaders) {
    // キャッシュを一切使用せず、常にDBから最新情報を取得
    const { results } = await env.DB.prepare(
        "SELECT id, post_number, content, created_at, is_admin FROM posts WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100"
    ).all();

    return new Response(JSON.stringify(results), {
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate", // キャッシュ無効化
            "Pragma": "no-cache",
            "Expires": "0",
        },
    });
}

async function handleCreatePost(request, env, ctx, corsHeaders) {
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const ipHash = await hashIp(ip);
    const data = await request.json();
    const content = data.content;
    const adminKeyInput = request.headers.get("X-Admin-Key") || request.headers.get("x-admin-key") || data.adminKey;

    if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Content is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    const isAdmin = env.ADMIN_KEY && adminKeyInput && (adminKeyInput.trim() === env.ADMIN_KEY.trim());

    if (!isAdmin) {
        const lastPost = await env.DB.prepare(
            "SELECT created_at FROM posts WHERE ip_address = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1"
        ).bind(ipHash).first();

        if (lastPost) {
            const now = Date.now();
            if (now - lastPost.created_at < 3 * 60 * 60 * 1000) {
                return new Response(JSON.stringify({ error: "連投規制中（3時間）" }), {
                    status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }
    }

    const id = crypto.randomUUID();
    const deleteKey = crypto.randomUUID();
    const lastNum = await env.DB.prepare("SELECT MAX(post_number) as maxNum FROM posts").first();
    const postNumber = (lastNum?.maxNum || 0) + 1;

    await env.DB.prepare(
        "INSERT INTO posts (id, post_number, content, created_at, delete_key, ip_address, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, postNumber, content, Date.now(), deleteKey, ipHash, isAdmin ? 1 : 0).run();

    if (env.ADMIN_EMAIL) {
        sendEmail(env.ADMIN_EMAIL, "New Post", `No: ${postNumber}\n${content}`).catch(console.error);
    }

    return new Response(JSON.stringify({ id, deleteKey, postNumber, isAdmin }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
}

async function handleDeletePost(request, env, ctx, corsHeaders) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const deleteKey = request.headers.get("X-Delete-Key") || request.headers.get("x-delete-key");

    if (!id || !deleteKey) {
        return new Response(JSON.stringify({ error: "ID and Key required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    let result;
    if (env.ADMIN_KEY && deleteKey === env.ADMIN_KEY) {
        result = await env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ?").bind(Date.now(), id).run();
    } else {
        result = await env.DB.prepare("UPDATE posts SET deleted_at = ? WHERE id = ? AND delete_key = ?").bind(Date.now(), id, deleteKey).run();
    }

    if (result.meta.changes > 0) {
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "Delete failed" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function hashIp(ip) {
    const myDigest = await crypto.subtle.digest({ name: 'SHA-256' }, new TextEncoder().encode(ip));
    return Array.from(new Uint8Array(myDigest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(to, subject, content) {
    const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: "no-reply@anonymous-bbs.workers.dev", name: "BBS" },
            subject,
            content: [{ type: "text/plain", value: content }],
        }),
    });
    if (!response.ok) console.error("Email error", await response.text());
}
