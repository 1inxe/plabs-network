import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createJubjubProxyHandler } from '../server/jubjub-proxy.mjs';

const pool = `0x${'56'.repeat(20)}`;
async function fixture(t, routeMode = 'path', rewriteQuery) {
  const calls = [];
  const handler = createJubjubProxyHandler({
    protocol: 'nft',
    routeMode,
    transport: async (url, init) => {
      calls.push({ url, init });
      return Response.json({ synthetic: true });
    },
  });
  const server = createServer((req, res) => {
    if (rewriteQuery) req.query = rewriteQuery;
    void handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return { calls, url: `http://127.0.0.1:${server.address().port}` };
}
test('NFT proxy forwards only public status and check-only proof to its fixed intake service', async (t) => {
  const f = await fixture(t);
  assert.equal((await fetch(`${f.url}/api/nft/pool/${pool}`)).status, 200);
  const proof = { pool, authorization: { proof: 'synthetic' } };
  const response = await fetch(`${f.url}/api/nft/whitelist/check`, {
    method: 'POST',
    headers: {
      Origin: f.url,
      'Content-Type': 'application/json',
      Cookie: 'never-forward=1',
      'X-Forwarded-Host': 'other.invalid',
    },
    body: JSON.stringify(proof),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(f.calls[0].url, `https://app.plabs.online/nft-intake/v1/pool/${pool}`);
  assert.equal(f.calls[1].url, 'https://app.plabs.online/nft-intake/v1/whitelist/check');
  assert.deepEqual(JSON.parse(f.calls[1].init.body), proof);
  for (const call of f.calls) {
    assert.equal(call.init.headers.Origin, undefined);
    assert.equal(call.init.headers.Cookie, undefined);
    assert.equal(call.init.headers['X-Forwarded-Host'], undefined);
    assert.equal(call.init.redirect, 'error');
  }
});
test('NFT proxy rejects writes, arbitrary endpoints, pool aliases, queries and cross-site callers', async (t) => {
  const f = await fixture(t);
  for (const [path, method, status] of [
    ['/api/nft/reserve', 'POST', 404],
    ['/api/nft/jobs/private', 'GET', 404],
    ['/api/nft/whitelist/check', 'GET', 405],
    [`/api/nft/pool/${pool}?wallet=private`, 'GET', 400],
    [`/api/nft/pool/${pool}`, 'POST', 405],
    ['/api/nft/config', 'GET', 404],
    ['/api/nft/pool/anything', 'GET', 404],
  ]) {
    const response = await fetch(f.url + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    assert.equal(response.status, status, path);
  }
  const denied = await fetch(`${f.url}/api/nft/whitelist/check`, {
    method: 'POST',
    headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(denied.status, 403);
  assert.equal(f.calls.length, 0);
});
test('Vercel NFT rewrite carries the selected route without allowing API scope escape', async (t) => {
  const f = await fixture(t, 'query');
  const response = await fetch(`${f.url}/api/nft-proxy?route=pool/${pool}`);
  assert.equal(response.status, 200);
  assert.equal(f.calls[0].url, `https://app.plabs.online/nft-intake/v1/pool/${pool}`);
  assert.equal((await fetch(`${f.url}/api/nft-proxy?route=pool/${pool}&route=config`)).status, 400);
  assert.equal((await fetch(`${f.url}/api/nft-proxy?route=../config`)).status, 404);
  assert.equal(f.calls.length, 1);
});

test('Vercel named pool capture is accepted only when it exactly matches the selected public route', async (t) => {
  const f = await fixture(t, 'query', { route: `pool/${pool}`, pool });
  assert.equal((await fetch(`${f.url}/api/nft/pool/${pool}`)).status, 200);
  assert.equal(f.calls[0].url, `https://app.plabs.online/nft-intake/v1/pool/${pool}`);
  const direct = await fixture(t, 'query');
  assert.equal(
    (await fetch(`${direct.url}/api/nft-proxy?route=pool/${pool}&pool=${pool}`)).status,
    200,
  );
  for (const query of [
    `pool=0x${'ab'.repeat(20)}`,
    `pool=${pool}&pool=${pool}`,
    `pool=${pool}&wallet=private`,
  ])
    assert.equal(
      (await fetch(`${direct.url}/api/nft-proxy?route=pool/${pool}&${query}`)).status,
      400,
    );
  assert.equal(direct.calls.length, 1);
});
