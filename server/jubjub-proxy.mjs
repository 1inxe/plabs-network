const upstream = 'https://app.plabs.online/nft-jubjub/v1';
const methods = new Map([
  ['config', 'GET'],
  ['summary', 'GET'],
  ['history', 'GET'],
  ['me', 'GET'],
  ['auth/challenge', 'POST'],
  ['auth/session', 'POST'],
  ['bids/prepare', 'POST'],
  ['refund', 'POST'],
]);
const authenticated = new Set(['me', 'bids/prepare', 'refund']);
const jsonContentType = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;

class ProxyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function header(req, name) {
  const value = req.headers[name];
  if (value === undefined) return '';
  if (typeof value !== 'string' || /[\r\n]/.test(value))
    throw new ProxyError(400, 'Invalid request headers.');
  return value;
}
function verifyOrigin(req, trustForwardedProto) {
  const host = header(req, 'host');
  if (!host || /[\s/\\?#@]/.test(host)) throw new ProxyError(400, 'Invalid request host.');
  let protocol = req.socket?.encrypted ? 'https' : 'http';
  if (trustForwardedProto) {
    const forwarded = header(req, 'x-forwarded-proto');
    if (forwarded && !['http', 'https'].includes(forwarded))
      throw new ProxyError(400, 'Invalid trusted request protocol.');
    if (forwarded) protocol = forwarded;
  }
  let expected;
  try {
    expected = new URL(`${protocol}://${host}`).origin;
  } catch {
    throw new ProxyError(400, 'Invalid request host.');
  }
  const origin = header(req, 'origin');
  if (origin) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new ProxyError(403, 'Request origin is not allowed.');
    }
    if (parsed.origin !== origin || parsed.origin !== expected)
      throw new ProxyError(403, 'Request origin is not allowed.');
  } else {
    // Non-browser tools normally omit both headers. Cross-site browser fetches
    // cannot use a missing Origin to bypass the same-origin boundary.
    const site = header(req, 'sec-fetch-site');
    if (site && !['same-origin', 'none'].includes(site))
      throw new ProxyError(403, 'Request origin is not allowed.');
  }
}
function requestRoute(req, mode, protocol) {
  const target = req.url ?? '';
  if (
    !target.startsWith('/') ||
    target.startsWith('//') ||
    target.includes('\\') ||
    target.includes('#')
  )
    throw new ProxyError(400, 'Invalid API path.');
  const url = new URL(target, 'http://local.invalid');
  if (target.split('?')[0] !== url.pathname || url.pathname.includes('%'))
    throw new ProxyError(400, 'Invalid API path.');
  const query = new URLSearchParams(url.search);
  let route;
  if (mode === 'query') {
    // Vercel exposes rewrite query parameters through req.query. Depending on
    // the runtime, req.url may still contain the original public path.
    if (req.query && typeof req.query === 'object') {
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value !== 'string') throw new ProxyError(400, 'Duplicate or invalid API query.');
        const supplied = query.getAll(key);
        if (supplied.length > 1 || (supplied.length === 1 && supplied[0] !== value))
          throw new ProxyError(400, 'Conflicting API query.');
        if (!supplied.length) query.append(key, value);
      }
    }
    if (query.getAll('route').length !== 1)
      throw new ProxyError(400, 'Missing or duplicate API route.');
    route = query.get('route');
    if (url.pathname !== `/api/${protocol}-proxy` && url.pathname !== `/api/${protocol}/${route}`)
      throw new ProxyError(400, 'Invalid API function path.');
    query.delete('route');
  } else {
    const prefix = `/api/${protocol}/`;
    if (!url.pathname.startsWith(prefix)) throw new ProxyError(404, 'Unknown JubJub API path.');
    route = url.pathname.slice(prefix.length);
    // Do not accept encoded or normalized aliases for an allowlisted path.
    if (target.split('?')[0] !== `${prefix}${route}`)
      throw new ProxyError(400, 'Invalid API path.');
  }
  const nft = protocol === 'nft';
  const poolRoute = nft && /^pool\/0x[0-9a-f]{40}$/.test(route);
  const method = nft
    ? poolRoute
      ? 'GET'
      : route === 'whitelist/check'
        ? 'POST'
        : undefined
    : methods.get(route);
  if (!method) throw new ProxyError(404, 'Unknown JubJub API path.');
  if (req.method !== method)
    throw new ProxyError(405, 'Method is not allowed for this JubJub endpoint.');
  const keys = [...query.keys()];
  if (keys.length && (nft || route !== 'history' || keys.length !== 1 || keys[0] !== 'after'))
    throw new ProxyError(400, 'Unsupported API query.');
  const after = query.get('after');
  if (
    after !== null &&
    (after.trim() !== after ||
      !/^(0|[1-9][0-9]{0,15})$/.test(after) ||
      !Number.isSafeInteger(Number(after)))
  )
    throw new ProxyError(400, 'Invalid history cursor.');
  return {
    route,
    method,
    url: `${nft ? 'https://app.plabs.online/nft-intake/v1' : upstream}/${route}${after === null ? '' : `?after=${after}`}`,
  };
}
async function readBody(req, maxBodyBytes, signal) {
  const declared = header(req, 'content-length');
  if (declared && (!/^[0-9]+$/.test(declared) || Number(declared) > maxBodyBytes))
    throw new ProxyError(413, 'JubJub request body is too large.');
  let body;
  if (req.body !== undefined)
    body =
      typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? req.body.toString()
        : JSON.stringify(req.body);
  else
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      let bytes = 0;
      const cleanup = () => {
        req.off('data', data);
        req.off('end', end);
        req.off('error', error);
        signal.removeEventListener('abort', abort);
      };
      const error = (cause) => {
        cleanup();
        reject(cause);
      };
      const abort = () => {
        cleanup();
        req.resume();
        reject(new ProxyError(504, 'JubJub request timed out.'));
      };
      const data = (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBodyBytes) {
          cleanup();
          req.resume();
          reject(new ProxyError(413, 'JubJub request body is too large.'));
        } else chunks.push(Buffer.from(chunk));
      };
      const end = () => {
        cleanup();
        resolve(Buffer.concat(chunks).toString('utf8'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      req.on('data', data);
      req.on('end', end);
      req.on('error', error);
      signal.addEventListener('abort', abort, { once: true });
    });
  if (Buffer.byteLength(body) > maxBodyBytes)
    throw new ProxyError(413, 'JubJub request body is too large.');
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ProxyError(400, 'A valid JSON object is required.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new ProxyError(400, 'A JSON object is required.');
  return JSON.stringify(parsed);
}
async function readUpstream(response, maxBytes) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json'))
    throw new ProxyError(502, 'JubJub returned an unexpected response.');
  if (Number(response.headers.get('content-length') ?? '0') > maxBytes)
    throw new ProxyError(502, 'JubJub response is too large.');
  const reader = response.body?.getReader();
  if (!reader) throw new ProxyError(502, 'JubJub returned an empty response.');
  const chunks = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new ProxyError(502, 'JubJub response is too large.');
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ProxyError(502, 'JubJub returned unreadable JSON.');
  }
}
function reply(res, status, body, requestId) {
  if (res.destroyed || res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (requestId && /^[\x20-\x7e]{1,128}$/.test(requestId)) res.setHeader('X-Request-Id', requestId);
  res.end(JSON.stringify(body));
}

/** Fixed upstream protocol proxy. Never log request bodies or authorization. */
export function createJubjubProxyHandler({
  protocol = 'jubjub',
  transport = fetch,
  routeMode = 'path',
  trustForwardedProto = false,
  timeoutMs = 10000,
  maxBodyBytes = 16384,
  maxResponseBytes = 2_000_000,
} = {}) {
  if (!['jubjub', 'nft'].includes(protocol)) throw new Error('Unknown protocol proxy.');
  return async (req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    req.once('aborted', abort);
    try {
      verifyOrigin(req, trustForwardedProto);
      const target = requestRoute(req, routeMode, protocol);
      const headers = { Accept: 'application/json' };
      const authorization = header(req, 'authorization');
      if (authorization && !/^Bearer [\x21-\x7e]{1,16384}$/i.test(authorization))
        throw new ProxyError(400, 'Only Bearer authorization is supported.');
      if (authenticated.has(target.route) && !authorization)
        throw new ProxyError(401, 'Sign in to the campaign first.');
      if (authorization) headers.Authorization = authorization;
      const userAgent = header(req, 'user-agent');
      if (userAgent && userAgent.length <= 1024) headers['User-Agent'] = userAgent;
      let body;
      if (target.method === 'POST') {
        if (!jsonContentType.test(header(req, 'content-type')))
          throw new ProxyError(415, 'JSON content type is required.');
        if (header(req, 'content-encoding'))
          throw new ProxyError(415, 'Encoded request bodies are not supported.');
        body = await readBody(req, maxBodyBytes, controller.signal);
        headers['Content-Type'] = 'application/json';
      } else if (
        header(req, 'transfer-encoding') ||
        (header(req, 'content-length') && header(req, 'content-length') !== '0')
      )
        throw new ProxyError(400, 'GET request bodies are not supported.');
      const response = await transport(target.url, {
        method: target.method,
        headers,
        ...(body === undefined ? {} : { body }),
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400)
        throw new ProxyError(502, 'JubJub redirected an API request.');
      const result = await readUpstream(response, maxResponseBytes);
      reply(res, response.status, result, response.headers.get('x-request-id'));
    } catch (error) {
      const status =
        error instanceof ProxyError ? error.status : controller.signal.aborted ? 504 : 502;
      reply(res, status, {
        error:
          error instanceof ProxyError
            ? error.message.replaceAll('JubJub', protocol === 'nft' ? 'NFT Launch' : 'JubJub')
            : status === 504
              ? `${protocol === 'nft' ? 'NFT Launch' : 'JubJub'} request timed out. Please retry.`
              : `${protocol === 'nft' ? 'NFT Launch' : 'JubJub'} could not be reached. Please retry.`,
      });
    } finally {
      clearTimeout(timer);
      req.off('aborted', abort);
    }
  };
}

/** An explicit empty proxy map is the fixture/offline opt-out. */
export function jubjubProxyEnabled(proxy) {
  return proxy === undefined || Object.keys(proxy).length > 0;
}
