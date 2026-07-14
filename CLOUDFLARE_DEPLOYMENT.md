# Cloudflare external deployment

## Architecture

`Cloudflare Pages (app hostname) -> Access-protected Worker routes -> Access service token -> Tunnel -> 127.0.0.1:3737 proxy -> ScienceON/NTIS`

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

## 3. Connect GitHub to Cloudflare

1. In Cloudflare Pages, create a project by connecting this GitHub repository. Use production branch `main`, no build command, and output directory `/`.
2. Connect the Pages project to `app.<domain>`. Cloudflare Pages now automatically deploys the static UI on each GitHub push to `main`.
3. In this repository's GitHub **Settings > Secrets and variables > Actions**, add these secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ORIGIN_ACCESS_CLIENT_ID`, and `ORIGIN_ACCESS_CLIENT_SECRET`.
4. Add GitHub Actions repository variable `ORIGIN_API_BASE` with `https://origin-api.<domain>`.
5. The tracked `.github/workflows/deploy.yml` deploys `cloudflare/edge-gateway.js` whenever `main` changes under `cloudflare/`. It skips safely until `ORIGIN_API_BASE` is configured.
6. In Cloudflare Workers, create routes from `app.<domain>/api*`, `/cerebras`, `/health`, `/ntis*`, and `/token*` to `scienceon-edge-gateway`. Pages continues to serve every other route.

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
