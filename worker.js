function jsonError(message, status) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (requestUrl.pathname !== '/api' && !requestUrl.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (!env.PHP_API_ORIGIN) {
      return jsonError('The PHP API origin is not configured.', 503);
    }

    let apiOrigin;
    try {
      apiOrigin = new URL(env.PHP_API_ORIGIN);
    } catch {
      return jsonError('The PHP API origin is invalid.', 503);
    }

    if (
      apiOrigin.protocol !== 'https:'
      || apiOrigin.pathname !== '/'
      || apiOrigin.search
      || apiOrigin.hash
      || apiOrigin.username
      || apiOrigin.password
    ) {
      return jsonError('The PHP API origin must be an HTTPS origin without a path.', 503);
    }

    const apiUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
    try {
      return await fetch(new Request(apiUrl, request));
    } catch {
      return jsonError('The PHP API could not be reached.', 502);
    }
  },
};
