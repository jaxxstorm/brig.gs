export interface Env {
    LINKS: KVNamespace;
    API_KEY?: string;
  }
  
  export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      if (!env.API_KEY) {
        return new Response("Server not configured with an API_KEY", { status: 500 });
      }
  
      const url = new URL(request.url);
      const path = url.pathname;    
      const method = request.method; 
  
      const jsonResponse = (data: unknown, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });
  
      const textResponse = (text: string, status = 200) =>
        new Response(text, { status, headers: { "Content-Type": "text/plain" } });
  
      const redirectResponse = (location: string) =>
        new Response(null, { status: 302, headers: { Location: location } });
  
      function isAuthorized(req: Request) {
        const authHeader = req.headers.get("Authorization") || "";
        return authHeader === env.API_KEY;
      }
  
      if (path.startsWith("/api/")) {
        if (!isAuthorized(request)) {
          return textResponse("Unauthorized", 401);
        }
  
        if (path === "/api/create" && method === "POST") {
          try {
            const data = await request.json<{ short_id?: string; target_url?: string }>();
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
            return jsonResponse(
              { message: "Link created", short_id, target_url },
              201
            );
          } catch (err) {
            return textResponse(`Error parsing JSON: ${String(err)}`, 400);
          }
        }
  
        if (path === "/api/list" && method === "GET") {
          try {
            const result = await env.LINKS.list();
            const keys = result.keys;
            const data: Record<string, string | null> = {};
            for (const k of keys) {
              const val = await env.LINKS.get(k.name);
              data[k.name] = val;
            }
            return jsonResponse(data, 200);
          } catch (err) {
            return textResponse(`Error listing links: ${String(err)}`, 500);
          }
        }
  
        if (path.startsWith("/api/delete/") && method === "DELETE") {
          // Extract the short_id from the path after /api/delete/
          // This handles namespace-style links like "yt/video" by taking everything after /api/delete/
          const encodedShortId = path.substring("/api/delete/".length);
          if (!encodedShortId) {
            return textResponse("Invalid delete path - missing short ID", 400);
          }
          
          // Decode the URL-encoded short_id to handle namespace-style links
          const short_id = decodeURIComponent(encodedShortId);
          
          const existing = await env.LINKS.get(short_id);
          if (!existing) {
            return textResponse(`Not Found: '${short_id}' does not exist`, 404);
          }
          await env.LINKS.delete(short_id);
          return jsonResponse({ message: `Deleted '${short_id}'` }, 200);
        }
  
        return textResponse("Not Found or method not allowed", 404);
      }
  
      if (path === "/") {
        const htmlContent = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>brig.gs - URL Shortener</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                margin: 0;
                padding: 0;
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
              }
              .container {
                text-align: center;
                background: rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 3rem;
                box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37);
                border: 1px solid rgba(255, 255, 255, 0.18);
                max-width: 500px;
                margin: 2rem;
              }
              h1 {
                font-size: 2.5rem;
                margin-bottom: 1rem;
                font-weight: 700;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
              }
              .domain {
                color: #ffd700;
                font-weight: 800;
              }
              p {
                font-size: 1.2rem;
                line-height: 1.6;
                margin-bottom: 1.5rem;
                opacity: 0.9;
              }
              .emoji {
                font-size: 2rem;
                margin: 1rem 0;
              }
              .footer {
                font-size: 0.9rem;
                opacity: 0.7;
                margin-top: 2rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Welcome to <span class="domain">brig.gs</span></h1>
              <div class="emoji">🔗✨</div>
              <p>This is a URL shortener for brig.gs</p>
              <p>Thanks for visiting!</p>
              <div class="footer">
                Making long URLs short, one link at a time
              </div>
            </div>
          </body>
          </html>
        `;
        return new Response(htmlContent, {
          status: 200,
          headers: { "Content-Type": "text/html" }
        });
      }
  
      if (method === "GET") {
        const short_id = path.slice(1); // Remove leading slash
        if (!short_id) {
          return textResponse("Missing short ID", 400);
        }
        
        // Support namespace-style links like /yt/something or /gh/repo
        // The short_id can now contain slashes
        const target_url = await env.LINKS.get(short_id);
        if (target_url) {
          return redirectResponse(target_url);
        } else {
          return textResponse("Not Found", 404);
        }
      }
  
      return textResponse("Method Not Allowed", 405);
    },
  };
  