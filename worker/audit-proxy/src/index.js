// audit-proxy: transparent reverse proxy from aiauditforcompanies.com to the Django
// audit backend on Render. Only paths declared in APP_PATHS are proxied; anything
// else falls through to the marketing site (Cloudflare Pages / Workers static assets).
//
// Bound at the edge via Worker Routes in the Cloudflare dashboard. See wrangler.toml.

const APP_PATHS = /^\/(startaiaudit|q|r|billing|admin|static|healthz|django-rq)(\/|$)/;

export default {
  /**
   * @param {Request} request
   * @param {{ UPSTREAM: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!APP_PATHS.test(url.pathname)) {
      // Not a Django path — let the request fall through to whatever else
      // is bound to this hostname (marketing site).
      return fetch(request);
    }

    const upstream = new URL(url.pathname + url.search, env.UPSTREAM);

    // Clone the incoming request onto the upstream URL. Preserve method,
    // body, and headers; overlay the Host + X-Forwarded-* signals Django
    // needs for ALLOWED_HOSTS / CSRF_TRUSTED_ORIGINS / absolute URL building.
    const headers = new Headers(request.headers);
    headers.set("Host", new URL(env.UPSTREAM).host);
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

    // If Django issues a redirect that points at the Render hostname, rewrite
    // the Location back to the apex so the address bar stays branded.
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.get("Location");
      if (loc) {
        const upstreamHost = new URL(env.UPSTREAM).host;
        try {
          const locUrl = new URL(loc, upstream);
          if (locUrl.host === upstreamHost) {
            const rewritten = new URL(locUrl.pathname + locUrl.search + locUrl.hash, url.origin);
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Location", rewritten.toString());
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          }
        } catch (_) { /* fall through with original response */ }
      }
    }

    return response;
  },
};
