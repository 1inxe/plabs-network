import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createServer as createViteServer, loadConfigFromFile } from 'vite';
import { createJubjubProxyHandler, jubjubProxyEnabled } from '../server/jubjub-proxy.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
async function fixture(options = {}, respond) {
  const calls = [];
  const mock = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    calls.push({ url: req.url, method: req.method, headers: req.headers, body });
    if (respond) return respond(req, res, body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, received: body ? JSON.parse(body) : null }));
  });
  const mockUrl = await listen(mock);
  const handler = createJubjubProxyHandler({
    transport: async (url, init) => {
      const target = new URL(url);
      assert.equal(target.origin, 'https://app.plabs.online');
      assert.ok(target.pathname.startsWith('/nft-jubjub/v1/'));
      assert.equal(init.redirect, 'error');
      assert.equal(init.credentials, 'omit');
      return fetch(`${mockUrl}${target.pathname}${target.search}`, init);
    },
    ...options,
  });
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  const url = await listen(server);
  return {
    url,
    calls,
    close: async () => {
      await close(server);
      await close(mock);
    },
  };
}
function rawRequest(url, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = httpRequest(
      { hostname: target.hostname, port: target.port, method, path, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('browser-origin JSON POST reaches the fixed upstream without Origin, cookies or forwarding headers', async () => {
  const f = await fixture();
  try {
    const payload = { evm: `0x${'11'.repeat(20)}`, raw: '22'.repeat(43) };
    const response = await fetch(`${f.url}/api/jubjub/auth/challenge`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        Origin: f.url,
        'Content-Type': 'application/json',
        Authorization: 'Bearer synthetic-token',
        Cookie: 'private-cookie=must-not-leak',
        Referer: `${f.url}/privasea/jubjub`,
        Forwarded: 'for=unknown;host=evil.test',
        'X-Forwarded-Host': 'evil.test',
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-For': '203.0.113.1',
        'User-Agent': 'Local regression client',
        'X-Unrelated': 'do-not-forward',
      },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).received, payload);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(f.calls.length, 1);
    const upstream = f.calls[0];
    assert.equal(upstream.url, '/nft-jubjub/v1/auth/challenge');
    assert.equal(upstream.headers.authorization, 'Bearer synthetic-token');
    assert.equal(upstream.headers['content-type'], 'application/json');
    assert.equal(upstream.headers['user-agent'], 'Local regression client');
    for (const name of [
      'origin',
      'referer',
      'cookie',
      'forwarded',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-forwarded-for',
      'x-unrelated',
    ])
      assert.equal(upstream.headers[name], undefined, name);
  } finally {
    await f.close();
  }
});
test('cross-site and opaque browser origins are rejected before any upstream request', async () => {
  const f = await fixture();
  try {
    for (const origin of [
      'https://other.example',
      'null',
      `${f.url}/`,
      'https://app.plabs.online',
    ]) {
      const response = await fetch(`${f.url}/api/jubjub/auth/challenge`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 403, origin);
      assert.match((await response.json()).error, /origin/);
    }
    const absent = await fetch(`${f.url}/api/jubjub/config`, {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    assert.equal(absent.status, 403);
    assert.equal(f.calls.length, 0);
    assert.equal(
      (await fetch(`${f.url}/api/jubjub/config`)).status,
      200,
      'Non-browser requests without Origin remain supported',
    );
  } finally {
    await f.close();
  }
});
test('only the known method/path/query combinations can be forwarded', async () => {
  const f = await fixture();
  try {
    for (const [path, method, status] of [
      ['/api/jubjub/bids/fund', 'POST', 404],
      ['/api/jubjub/config', 'POST', 405],
      ['/api/jubjub/auth/session', 'GET', 405],
      ['/api/jubjub/refund', 'DELETE', 405],
      ['/api/jubjub/history?after=1&after=2', 'GET', 400],
      ['/api/jubjub/history?after=-1', 'GET', 400],
      ['/api/jubjub/history?after=9007199254740992', 'GET', 400],
      ['/api/jubjub/config?url=https://evil.test', 'GET', 400],
      ['/api/jubjub/history?after=0&token=secret', 'GET', 400],
      ['/api/jubjub/%61uth/challenge', 'POST', 400],
      ['/api/jubjub/other/../auth/challenge', 'POST', 400],
      ['/api/jubjub/auth/challenge/', 'POST', 404],
    ]) {
      const response = await rawRequest(f.url, path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'POST' ? { body: '{}' } : {}),
      });
      assert.equal(response.status, status, `${method} ${path}`);
    }
    assert.equal(f.calls.length, 0);
    const response = await fetch(`${f.url}/api/jubjub/history?after=500`);
    assert.equal(response.status, 200);
    assert.equal(f.calls[0].url, '/nft-jubjub/v1/history?after=500');
  } finally {
    await f.close();
  }
});
test('non-JSON, malformed, encoded and oversized request bodies never reach the upstream', async () => {
  const f = await fixture({ maxBodyBytes: 64 });
  try {
    for (const [type, body, status] of [
      ['text/plain', '{}', 415],
      ['application/json', '{bad', 400],
      ['application/json', '[]', 400],
      ['application/json', JSON.stringify({ message: 'x'.repeat(100) }), 413],
    ]) {
      const response = await fetch(`${f.url}/api/jubjub/auth/session`, {
        method: 'POST',
        headers: { Origin: f.url, 'Content-Type': type },
        body,
      });
      assert.equal(response.status, status);
    }
    assert.equal(
      (
        await fetch(`${f.url}/api/jubjub/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
          body: '{}',
        })
      ).status,
      415,
    );
    assert.equal((await fetch(`${f.url}/api/jubjub/me`)).status, 401);
    assert.equal(
      (await fetch(`${f.url}/api/jubjub/me`, { headers: { Authorization: 'Basic synthetic' } }))
        .status,
      400,
    );
    assert.equal(f.calls.length, 0);
  } finally {
    await f.close();
  }
});
test('Vercel rewrite query mode supports history and authenticated POSTs without trusting external hosts', async () => {
  const f = await fixture({ routeMode: 'query', trustForwardedProto: true });
  try {
    const headers = {
      Host: 'project.vercel.app',
      Origin: 'https://project.vercel.app',
      'X-Forwarded-Proto': 'https',
      Authorization: 'Bearer synthetic-token',
      'Content-Type': 'application/json',
    };
    const response = await rawRequest(f.url, '/api/jubjub-proxy?route=bids/prepare', {
      method: 'POST',
      headers,
      body: '{"total":"100000000"}',
    });
    assert.equal(response.status, 200);
    assert.equal(f.calls[0].url, '/nft-jubjub/v1/bids/prepare');
    assert.equal(
      (await rawRequest(f.url, '/api/jubjub-proxy?route=history&after=100', { headers })).status,
      200,
    );
    assert.equal(f.calls[1].url, '/nft-jubjub/v1/history?after=100');
    for (const path of [
      '/api/jubjub-proxy?route=config&route=me',
      '/api/jubjub-proxy?route=../secret',
      '/api/jubjub-proxy?route=config&extra=1',
    ])
      assert.equal((await rawRequest(f.url, path, { headers })).status >= 400, true);
    assert.equal(
      (
        await rawRequest(f.url, '/api/jubjub-proxy?route=config', {
          headers: { ...headers, Origin: 'https://evil.test', 'X-Forwarded-Host': 'evil.test' },
        })
      ).status,
      403,
    );
    assert.equal(f.calls.length, 2);
  } finally {
    await f.close();
  }
  const untrusted = await fixture();
  try {
    assert.equal(
      (
        await rawRequest(untrusted.url, '/api/jubjub/config', {
          headers: {
            Host: 'project.vercel.app',
            Origin: 'https://project.vercel.app',
            'X-Forwarded-Proto': 'https',
          },
        })
      ).status,
      403,
    );
    assert.equal(
      untrusted.calls.length,
      0,
      'An arbitrary client cannot opt into trusted forwarded protocol',
    );
  } finally {
    await untrusted.close();
  }
});
test('upstream JSON errors preserve status and message, but cookies never reach the browser', async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    const f = await fixture({}, (_req, res) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Set-Cookie', 'upstream-cookie=private');
      res.setHeader('X-Request-Id', 'synthetic-request-id');
      res.end(JSON.stringify({ error: 'Synthetic upstream rejection', code: 'TEST_REJECTION' }));
    });
    try {
      const response = await fetch(`${f.url}/api/jubjub/summary`);
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), {
        error: 'Synthetic upstream rejection',
        code: 'TEST_REJECTION',
      });
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal(response.headers.get('x-request-id'), 'synthetic-request-id');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    } finally {
      await f.close();
    }
  }
});
test('timeout, redirects and non-JSON upstream responses fail as bounded JSON errors', async () => {
  for (const [respond, status] of [
    [(_req, _res) => {}, 504],
    [
      (_req, res) => {
        res.writeHead(302, { Location: 'https://unvisited.invalid/' });
        res.end();
      },
      502,
    ],
    [
      (_req, res) => {
        res.setHeader('Content-Type', 'text/html');
        res.end('<h1>Unavailable</h1>');
      },
      502,
    ],
    [
      (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end('{broken');
      },
      502,
    ],
  ]) {
    const f = await fixture({ timeoutMs: 80 }, respond);
    try {
      const response = await fetch(`${f.url}/api/jubjub/config`);
      assert.equal(response.status, status);
      assert.equal(typeof (await response.json()).error, 'string');
      assert.equal(f.calls.length, 1, 'No redirected endpoint or automatic retry is contacted');
    } finally {
      await f.close();
    }
  }
});
test('an explicit empty Vite proxy map keeps fixture requests local and installs no upstream handler', async () => {
  assert.equal(jubjubProxyEnabled({}), false);
  assert.equal(jubjubProxyEnabled(undefined), true);
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' });
  const config = loaded.config;
  config.configFile = false;
  config.logLevel = 'silent';
  config.server = { host: '127.0.0.1', port: 0, strictPort: false, proxy: {} };
  config.plugins.push({
    name: 'offline-test-responder',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/jubjub/auth/challenge') {
          res.setHeader('Content-Type', 'application/json');
          res.end('{"fixture":true}');
        } else next();
      });
    },
  });
  const server = await createViteServer(config);
  const original = globalThis.fetch;
  const upstreams = [];
  globalThis.fetch = (input, init) => {
    if (String(input).startsWith('https://app.plabs.online')) {
      upstreams.push(input);
      throw new Error('External request forbidden');
    }
    return original(input, init);
  };
  try {
    await server.listen();
    const response = await original(
      `http://127.0.0.1:${server.httpServer.address().port}/api/jubjub/auth/challenge`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    );
    assert.deepEqual(await response.json(), { fixture: true });
    assert.deepEqual(upstreams, []);
  } finally {
    globalThis.fetch = original;
    await server.close();
  }
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(
    vercel.rewrites.find((rule) => rule.source === '/api/jubjub/:path*').destination,
    '/api/jubjub-proxy?route=:path*',
  );
});
