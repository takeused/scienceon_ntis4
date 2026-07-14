# Free Cloudflare external deployment

## Scope and limitation

This is the no-domain-purchase deployment path:

`Access-protected workers.dev UI -> Worker API gateway -> temporary Quick Tunnel -> 127.0.0.1:3737 proxy -> ScienceON/NTIS`

It requires no paid domain, but a Quick Tunnel hostname changes whenever its process or this PC restarts. It is suitable only for limited-user, temporary use. Do not treat it as a production SLA or expose port 3737 through a firewall or router.

## 1. Prepare the PC

1. Keep upstream credentials only in this PC's `.env` file.
2. Create a long random `ORIGIN_SHARED_SECRET` in `.env`. Never commit it.
3. Start the proxy with `node proxy-server.js` (or `서버시작.bat`). It listens on `127.0.0.1:3737`.
4. In a second terminal, run `tools\start-quick-tunnel.bat`. Keep the terminal open and copy its `https://*.trycloudflare.com` URL.

The proxy rejects API requests without `X-Origin-Token`; this header is added only by the Worker using the shared secret.

## 2. Cloudflare Worker configuration

1. In **Workers & Pages > scienceon-ntis4 > Settings > Builds**, use production branch `main`, root directory `/`, no build command, and deploy command `npx wrangler deploy --config wrangler.toml --keep-vars`.
2. In the **top Variables and Secrets** section of **Settings** (not **Builds > Variables and Secrets**), set text variable `ORIGIN_API_BASE` to the current `https://*.trycloudflare.com` URL from step 1.
3. In that same top section, add secret `ORIGIN_SHARED_SECRET` with exactly the value in the PC `.env` file.
4. In **Settings > Domains & Routes**, enable `workers.dev` and choose **Enable Cloudflare Access**. Limit the policy to the intended user emails.

The public address is `https://scienceon-ntis4.takeused.workers.dev/`. Cloudflare Access must remain enabled; the Worker rejects API requests without its Access assertion.

## 3. After every restart

1. Restart the proxy, then `tools\start-quick-tunnel.bat`.
2. Copy the newly displayed Quick Tunnel URL.
3. Replace `ORIGIN_API_BASE` in the Worker settings with that URL.
4. Test `/_edge/ready` after signing in through Cloudflare Access, then perform one ScienceON and one NTIS search externally.

## Operational notes

- The PC must remain on, connected to the Internet, and running both the proxy and Quick Tunnel terminals.
- Quick Tunnels are anonymous, temporary debug infrastructure. Move to a company-managed domain and named Tunnel before broad or business-critical use.
- Confirm ScienceON and NTIS terms permit the intended external-user access before sharing the URL.
