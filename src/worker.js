// aiauditforcompanies.com — combined marketing + audit-proxy worker.
//
// Wrangler config (wrangler.jsonc) points `main` at this file and sets
// `assets.directory` to the Astro build output (./dist/client). Requests
// hit this handler first; if the path is not a Django audit-app path we
// delegate to env.ASSETS.fetch(request) to serve the static marketing site.
//
// If the Render backend URL changes, update UPSTREAM below.

const UPSTREAM = "https://srj-audit-web-gor5.onrender.com";
const APP_PATHS = /^\/(startaiaudit|q|r|billing|admin|static|healthz|django-rq)(\/|$)/;

export default {
  /**
   * @param {Request} request
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!APP_PATHS.test(url.pathname)) {
      // Marketing / static asset request — hand to the assets binding.
      return env.ASSETS.fetch(request);
    }

    const upstream = new URL(url.pathname + url.search, UPSTREAM);
    const upstreamHost = new URL(UPSTREAM).host;

    // Build the outbound request. Preserve method, body, and headers;
    // overlay Host + X-Forwarded-* so Django's ALLOWED_HOSTS / CSRF /
    // absolute-URL building see the branded hostname.
    const headers = new Headers(request.headers);
    headers.set("Host", upstreamHost);
    headers.set("X-Forwarded-Host", url.hostname);
    headers.set("X-Forwarded-Proto", "https");
    const cfIp = request.headers.get("CF-Connecting-IP");
    if (cfIp) headers.set("X-Forwarded-For", cfIp);

    const proxied = new Request(upstream.toString(), {
      method: request.method,
      headers,
      body: (request.method === "GET" || request.method === "HEAD") ? undefined : request.body,
      redirect: "manual",
    });

    const response = await fetch(proxied);

    // Rewrite any Location header that points at the Render origin so
    // redirects (e.g., /startaiaudit -> /startaiaudit/) stay branded.
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("Location");
      if (loc) {
        try {
          const locUrl = new URL(loc, upstream);
          if (locUrl.host === upstreamHost) {
            const rewritten = new URL(
              locUrl.pathname + locUrl.search + locUrl.hash,
              url.origin
            );
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Location", rewritten.toString());
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          }
        } catch (_) {
          /* fall through with original response */
        }
      }
    }

    return response;
  },
};
