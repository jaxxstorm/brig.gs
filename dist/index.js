export default {
    async fetch(request, env, ctx) {
        if (!env.API_KEY) {
            return new Response("Server not configured with an API_KEY", { status: 500 });
        }
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;
        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
        });
        const textResponse = (text, status = 200) => new Response(text, { status, headers: { "Content-Type": "text/plain" } });
        const redirectResponse = (location) => new Response(null, { status: 302, headers: { Location: location } });
        function isAuthorized(req) {
            const authHeader = req.headers.get("Authorization") || "";
            return authHeader === env.API_KEY;
        }
        if (path.startsWith("/api/")) {
            if (!isAuthorized(request)) {
                return textResponse("Unauthorized", 401);
            }
            if (path === "/api/create" && method === "POST") {
                try {
                    const data = await request.json();
                    const short_id = data.short_id;
                    const target_url = data.target_url;
                    if (!short_id || !target_url) {
                        return textResponse("Missing 'short_id' or 'target_url'", 400);
                    }
                    const existing = await env.LINKS.get(short_id);
                    if (existing) {
                        return textResponse(`Conflict: '${short_id}' already exists`, 409);
                    }
                    await env.LINKS.put(short_id, target_url);
                    return jsonResponse({ message: "Link created", short_id, target_url }, 201);
                }
                catch (err) {
                    return textResponse(`Error parsing JSON: ${String(err)}`, 400);
                }
            }
            if (path === "/api/list" && method === "GET") {
                try {
                    const result = await env.LINKS.list();
                    const keys = result.keys;
                    const data = {};
                    for (const k of keys) {
                        const val = await env.LINKS.get(k.name);
                        data[k.name] = val;
                    }
                    return jsonResponse(data, 200);
                }
                catch (err) {
                    return textResponse(`Error listing links: ${String(err)}`, 500);
                }
            }
            if (path.startsWith("/api/delete/") && method === "DELETE") {
                const parts = path.split("/");
                if (parts.length === 4 && parts[3]) {
                    const short_id = parts[3];
                    const existing = await env.LINKS.get(short_id);
                    if (!existing) {
                        return textResponse(`Not Found: '${short_id}' does not exist`, 404);
                    }
                    await env.LINKS.delete(short_id);
                    return jsonResponse({ message: `Deleted '${short_id}'` }, 200);
                }
                else {
                    return textResponse("Invalid delete path", 404);
                }
            }
            return textResponse("Not Found or method not allowed", 404);
        }
        if (path === "/") {
            return textResponse("Welcome to the TypeScript URL Shortener!", 200);
        }
        if (method === "GET") {
            const short_id = path.slice(1);
            if (!short_id) {
                return textResponse("Missing short ID", 400);
            }
            const target_url = await env.LINKS.get(short_id);
            if (target_url) {
                return redirectResponse(target_url);
            }
            else {
                return textResponse("Not Found", 404);
            }
        }
        return textResponse("Method Not Allowed", 405);
    },
};
