const ALLOWED_PATHS = new Set([
  '/api',
  '/cerebras',
  '/health',
  '/ntis',
  '/ntis/connection',
  '/ntis/related',
  '/token',
  '/token/probe',
  '/token/refresh',
]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function permittedRequest(request, pathname) {
  if (!ALLOWED_PATHS.has(pathname)) return false;
  if (pathname === '/cerebras') return request.method === 'POST';
  return request.method === 'GET';
}

function targetUrl(base, pathname, search) {
  const origin = new URL(base);
  const target = new URL(pathname, origin);
  target.search = search;
  return target;
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (!permittedRequest(request, requestUrl.pathname)) {
      return json(404, { error: 'Not found' });
    }

    // The Worker must be protected by a Cloudflare Access application. Keeping
    // workers.dev disabled prevents bypassing that Access policy.
    if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
      return json(401, { error: 'Cloudflare Access authentication required' });
    }

    if (!env.ORIGIN_API_BASE || !env.ORIGIN_ACCESS_CLIENT_ID || !env.ORIGIN_ACCESS_CLIENT_SECRET) {
      return json(503, { error: 'Edge gateway is not configured' });
    }

    const headers = new Headers();
    for (const name of ['accept', 'content-type']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // These credentials authenticate this Worker to the separate Access policy
    // that protects the Tunnel hostname. They are Worker secrets, never browser values.
    headers.set('CF-Access-Client-ID', env.ORIGIN_ACCESS_CLIENT_ID);
    headers.set('CF-Access-Client-Secret', env.ORIGIN_ACCESS_CLIENT_SECRET);
    headers.set('X-Request-Source', 'scienceon-edge-gateway');

    let upstream;
    try {
      upstream = await fetch(targetUrl(env.ORIGIN_API_BASE, requestUrl.pathname, requestUrl.search), {
        method: request.method,
        headers,
        body: request.method === 'GET' ? undefined : request.body,
        redirect: 'error',
      });
    } catch {
      return json(502, { error: 'The internal API proxy is unavailable' });
    }

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('set-cookie');
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.set('Cache-Control', 'no-store');
    responseHeaders.set('X-Content-Type-Options', 'nosniff');

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  },
};
