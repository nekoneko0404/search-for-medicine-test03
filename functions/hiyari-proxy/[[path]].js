export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Extract the path after /hiyari-proxy/
    // Example: /hiyari-proxy/proxy?query=... -> proxy?query=...
    // context.params.path is an array for [[path]] catch-all

    const path = context.params.path ? context.params.path.join('/') : '';
    const search = url.search;

    const targetUrl = `https://hiyari-proxy-708146219355.asia-east1.run.app/${path}${search}`;

    try {
        const response = await fetch(targetUrl, {
            method: context.request.method,
            headers: {
                'Accept': 'application/xml, text/xml, */*',
                'User-Agent': 'Cloudflare-Pages-Proxy'
            }
        });

        // Create a new response to allow CORS and set headers
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');

        return newResponse;
    } catch (err) {
        return new Response(`Proxy Error: ${err.message}`, { status: 500 });
    }
}
