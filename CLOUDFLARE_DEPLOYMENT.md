# Cloudflare external deployment

## Architecture

`Cloudflare Worker static assets (app hostname) -> Access-protected Worker API routes -> Access service token -> Tunnel -> 127.0.0.1:3737 proxy -> ScienceON/NTIS`

The public UI and its API use the same `app` hostname. The proxy hostname is separate and accepts only the Worker service token. Do not expose port 3737 through a firewall rule or router port forwarding.

## 1. Prepare the PC

1. Keep `SC_CLIENT_ID`, `SC_API_KEY`, `SC_MAC_ADDR`, `NTIS_API_KEY`, and `CEREBRAS_API_KEY` only in `.env` on this PC.
2. Start the proxy with `node proxy-server.js`. It now listens only on `127.0.0.1:3737`.
3. In Cloudflare Zero Trust, create a **remotely managed** Tunnel and add public hostname `origin-api.<domain>` with service `http://127.0.0.1:3737`.
4. Install the generated Tunnel token as a Windows service on this PC. Use the Cloudflare dashboard command exactly; do not store that token in this repository.

## 2. Lock the two Cloudflare applications

1. Create an Access application for `app.<domain>` and allow only the intended user emails or identity-provider group.
2. Create a separate Access application for `origin-api.<domain>`. Its only allow policy must be **Service Auth** for a new service token named `scienceon-edge-gateway`; do not allow human users on this hostname.
3. Set `workers_dev = false` as included in the Worker configuration so the custom app hostname cannot be bypassed through a `workers.dev` URL.
4. Configure Cloudflare WAF/rate limiting on the Worker routes. Begin with a conservative per-user policy and tune after observing normal search traffic.

## 3. Connect GitHub to Cloudflare Workers Builds

1. In Cloudflare Workers > `scienceon-ntis4` > **Settings > Builds**, set the production branch to `main`. Do not use the repository's old `master` branch or the auto-generated `cloudflare/workers-autoconfig` branch.
2. Set Root directory to `/`, leave Build command empty, and set Deploy command to `npx wrangler deploy --config wrangler.toml --keep-vars`.
3. In the Worker's **Settings > Variables and Secrets**, add text variable `ORIGIN_API_BASE` with `https://origin-api.<domain>`.
4. In the same **Variables and Secrets** screen, add secrets `ORIGIN_ACCESS_CLIENT_ID` and `ORIGIN_ACCESS_CLIENT_SECRET` using the Access service token created in step 2. `--keep-vars` is required so Git-based deployments preserve these dashboard-managed runtime values.
5. Connect a custom domain `app.<domain>` to this Worker, then apply the Access policy to that hostname. The checked-in `wrangler.toml` disables `workers.dev` and preview URLs so the custom Access-protected hostname is the only public entry point.
6. The root `.assetsignore` prevents repository metadata, source-only server code, configuration, test files, and `.env` files from being uploaded as public static assets. The Worker serves only `index.html`, `css/`, `js/`, and `vendor/` while forwarding the listed API paths to the Tunnel.

## 4. Verify before enabling users

1. Confirm an unauthenticated browser receives an Access login or 401 for `/health`.
2. Sign in as an allowed user and verify `https://app.<domain>/health` returns `scienceOnConfigured: true` and `ntisConfigured: true` without revealing values.
3. From an external network, perform one ScienceON search and one NTIS search.
4. Confirm a direct request to `https://origin-api.<domain>/health` is denied without the Worker service token.
5. Reboot the PC and verify both the proxy and Tunnel service recover automatically.

## Operational notes

- The PC and its Internet connection are a single point of failure. Migrate the proxy to an approved always-on server before relying on it for a broad user group.
- Rotate the Access service token and all upstream API keys immediately if a secret is suspected to have been exposed.
- Confirm ScienceON and NTIS terms permit the intended external-user access before go-live.
