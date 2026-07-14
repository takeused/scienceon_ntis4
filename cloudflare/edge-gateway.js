const ALLOWED_PATHS = new Set([
  '/api',
  '/cerebras',
  '/_edge/ready',
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

    // Cloudflare Access protects the workers.dev route before this Worker runs.
    // Do not change the route back to public: the local proxy accepts requests
    // only from this Worker through ORIGIN_SHARED_SECRET.

    if (!env.ORIGIN_API_BASE || !env.ORIGIN_SHARED_SECRET) {
      return json(503, { error: 'Edge gateway is not configured' });
    }

    const headers = new Headers();
    for (const name of ['accept', 'content-type']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Quick Tunnels have no Access policy of their own. This secret is checked
    // by the local proxy, so only this Worker can use the temporary tunnel URL.
    headers.set('X-Origin-Token', env.ORIGIN_SHARED_SECRET);
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
