const ALLOWED_ORIGIN = "*"; // Modify this to specific domain in production mainly

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS Preflight
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
                    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, X-Delete-Key",
                },
            });
        }

        const CORS_HEADERS = {
            "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        };

        try {
            if (url.pathname === "/api/posts") {
                if (request.method === "GET") {
                    return await handleGetPosts(env, CORS_HEADERS);
                } else if (request.method === "POST") {
                    return await handleCreatePost(request, env, CORS_HEADERS);
                } else if (request.method === "DELETE") {
                    return await handleDeletePost(request, env, CORS_HEADERS);
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

async function handleGetPosts(env, corsHeaders) {
    const { results } = await env.DB.prepare(
        "SELECT id, post_number, content, created_at, is_admin FROM posts WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100"
    ).all();
    return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function handleCreatePost(request, env, corsHeaders) {
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const ipHash = await hashIp(ip); // Hashing the IP

    const data = await request.json();
    const content = data.content;
    const adminKeyInput = data.adminKey; // UIから渡される可能性のあるキー

    // Validation
    if (!content || content.trim().length === 0) {
        return new Response(JSON.stringify({ error: "Content is required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    if (content.length > 400) {
        return new Response(JSON.stringify({ error: "Content must be 400 characters or less" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Rate Limiting (3 hours)
    const isAdmin = env.ADMIN_KEY && adminKeyInput === env.ADMIN_KEY;

    // 管理者以外はレートリミットを適用
    if (!isAdmin) {
        const lastPost = await env.DB.prepare(
            "SELECT created_at FROM posts WHERE ip_address = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1"
        ).bind(ipHash).first();

        if (lastPost) {
            const now = Date.now();
            const diff = now - lastPost.created_at;
            const threeHours = 3 * 60 * 60 * 1000;

            if (diff < threeHours) {
                return new Response(JSON.stringify({ error: "連投できません。まったりいきましょう。（3時間規制）" }), {
                    status: 429,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
        }
    }

    const id = crypto.randomUUID();
    const deleteKey = crypto.randomUUID(); // Simple key for deletion
    const createdAt = Date.now();

    // 投稿番号の取得
    const lastNum = await env.DB.prepare(
        "SELECT MAX(post_number) as maxNum FROM posts"
    ).first();
    const postNumber = (lastNum && lastNum.maxNum ? lastNum.maxNum : 0) + 1;

    await env.DB.prepare(
        "INSERT INTO posts (id, post_number, content, created_at, delete_key, ip_address, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, postNumber, content, createdAt, deleteKey, ipHash, isAdmin ? 1 : 0).run();

    // Send Email Notification (Fire and forget)
    // Note: This requires MailChannels or similar. Assuming MailChannels for now.
    // Replace 'your-email@example.com' with the user's specific email if known, or environment variable.
    // Since I don't have the user's email, I will use a placeholder or check if I can get it.
    // The prompt says "write to my email". I will look at the previous conversations or metadata.
    // The user's name is "kiyoshi".
    // I will try to use an environment variable specified in wrangler.toml or just hardcode if I find it.
    // I'll stick to a placeholder "ADMIN_EMAIL" in env.

    if (env.ADMIN_EMAIL) {
        sendEmail(env.ADMIN_EMAIL, "New Anonymous Post", `No: ${postNumber}\nContent: ${content}`).catch(console.error);
    }

    return new Response(JSON.stringify({ id, deleteKey, postNumber, isAdmin }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function handleDeletePost(request, env, corsHeaders) {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const deleteKey = request.headers.get("X-Delete-Key");

    if (!id || !deleteKey) {
        return new Response(JSON.stringify({ error: "ID and Delete Key required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    let result;
    // Admin Override
    if (env.ADMIN_KEY && deleteKey === env.ADMIN_KEY) {
        result = await env.DB.prepare(
            "UPDATE posts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL"
        ).bind(Date.now(), id).run();
    } else {
        // Standard User Delete
        result = await env.DB.prepare(
            "UPDATE posts SET deleted_at = ? WHERE id = ? AND delete_key = ? AND deleted_at IS NULL"
        ).bind(Date.now(), id, deleteKey).run();
    }

    if (result.meta.changes > 0) {
        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } else {
        return new Response(JSON.stringify({ error: "Invalid ID or Key, or already deleted" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
}

async function hashIp(ip) {
    const myText = new TextEncoder().encode(ip);
    const myDigest = await crypto.subtle.digest(
        {
            name: 'SHA-256',
        },
        myText
    );
    const hashArray = Array.from(new Uint8Array(myDigest));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sendEmail(to, subject, content) {
    // MailChannels Send
    const send_request = new Request("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: {
            "content-type": "application/json",
        },
        body: JSON.stringify({
            personalizations: [
                {
                    to: [{ email: to, name: "Admin" }],
                },
            ],
            from: {
                email: "no-reply@anonymous-bbs.workers.dev",
                name: "Anonymous BBS",
            },
            subject: subject,
            content: [
                {
                    type: "text/plain",
                    value: content,
                },
            ],
        }),
    });

    const response = await fetch(send_request);
    if (!response.ok) {
        console.error("Failed to send email", await response.text());
    }
}
