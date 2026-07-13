# audit-proxy

Cloudflare Worker that transparently reverse-proxies Django audit-app paths from
`aiauditforcompanies.com` to `srj-audit-web-gor5.onrender.com`. Address bar stays
on the branded apex.

## Paths proxied

`/startaiaudit*`, `/q/*`, `/r/*`, `/billing/*`, `/admin/*`, `/static/*`,
`/healthz`, `/django-rq/*`

Anything not matching falls through to whatever else is bound to the hostname
(the marketing site).

## Deploy

```powershell
cd "C:\SRJ AI Audit Platform\aiauditforcompanies-web\worker\audit-proxy"
npm install -g wrangler        # first time only
npx wrangler login             # first time only — opens browser
npx wrangler deploy
```

## Wire up the routes (Cloudflare dashboard, first time only)

Workers & Pages -> audit-proxy -> Settings -> Triggers -> Add Route

Zone `aiauditforcompanies.com`, add each route:

```
aiauditforcompanies.com/startaiaudit*
aiauditforcompanies.com/q/*
aiauditforcompanies.com/r/*
aiauditforcompanies.com/billing/*
aiauditforcompanies.com/admin/*
aiauditforcompanies.com/static/*
aiauditforcompanies.com/healthz
aiauditforcompanies.com/django-rq/*
```

## Verify

```powershell
curl -I https://aiauditforcompanies.com/startaiaudit
# Expect: 200 OK, address bar stays on aiauditforcompanies.com
```

## Django env sanity (Render dashboard)

`ALLOWED_HOSTS` must include: `aiauditforcompanies.com,www.aiauditforcompanies.com,srj-audit-web-gor5.onrender.com`

`CSRF_TRUSTED_ORIGINS` must include: `https://aiauditforcompanies.com,https://www.aiauditforcompanies.com`

Both are honored via `X-Forwarded-Host` / `X-Forwarded-Proto` that this Worker sets.
