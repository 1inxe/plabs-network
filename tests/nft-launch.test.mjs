import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/'))
      return next(new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href, context);
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier))
        return next(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts'))
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const {
  createNftLaunchService,
  loadNftCatalog,
  loadNftArtwork,
  nftPhase,
  NFT_MARKET,
  keccakBytes,
} = await import('../src/services/platform/nft-launch.ts');
const { createHash } = await import('node:crypto');
const pool = `0x${'56'.repeat(20)}`;
const creator = `0x${'78'.repeat(20)}`;
const raw = `0x${'12'.repeat(43)}`;
const account = `0x${'34'.repeat(20)}`;
const proof = {
  version: 'bjj-schnorr-v1',
  r_x_hex: '11'.repeat(32),
  r_y_hex: '22'.repeat(32),
  s_hex: '33'.repeat(32),
};
const allocation = {
  enabled: true,
  connected: true,
  checked: true,
  eligible: true,
  allowance: 3,
  minted: 1,
  reserved: 0,
  remaining: 2,
};
const uint = (n) => BigInt(n).toString(16).padStart(64, '0');
const encodedText = (s) =>
  '0x' +
  uint(32) +
  uint(Buffer.byteLength(s)) +
  Buffer.from(s)
    .toString('hex')
    .padEnd(Math.ceil(Buffer.byteLength(s) / 32) * 64, '0');
const sig = (s) => keccakBytes(new TextEncoder().encode(s)).slice(0, 10);
function catalogTransport(overrides = {}) {
  const calls = [];
  const replies = {
    'poolCount()': `0x${uint(1)}`,
    'pools(uint256)': `0x${uint(pool)}`,
    'launches(address)': `0x${[creator, 0, 0, 0, 1700000000, 0, 0, 0, 1, 0, 5, 2].map(uint).join('')}`,
    'name()': encodedText('Synthetic birds'),
    'symbol()': encodedText('BIRD'),
    'metadataBaseURI()': encodedText(`https://media.plabs.online/collections/${'ab'.repeat(32)}`),
    'metadataManifestHash()': `0x${'ab'.repeat(32)}`,
    ...overrides,
  };
  const bySelector = Object.fromEntries(Object.entries(replies).map(([s, v]) => [sig(s), v]));
  return {
    calls,
    transport: async (_url, init) => {
      const request = JSON.parse(init.body);
      calls.push(request);
      return Response.json({
        id: 1,
        result:
          request.method === 'eth_chainId'
            ? '0x1'
            : request.method === 'eth_blockNumber'
              ? '0x123456'
              : bySelector[request.params[0].data.slice(0, 10)],
      });
    },
  };
}
test('catalog reads authoritative deployment and pins all contract reads to one block', async () => {
  const fixture = catalogTransport();
  const data = await loadNftCatalog(new AbortController().signal, 0, fixture.transport);
  assert.equal(data.total, 1);
  assert.equal(data.collections[0].name, 'Synthetic birds');
  assert.equal(data.collections[0].supply, 5);
  assert.equal(data.collections[0].minted, 2);
  assert.equal(data.collections[0].metadataManifestHash, `0x${'ab'.repeat(32)}`);
  for (const call of fixture.calls.filter((c) => c.method === 'eth_call')) {
    assert.equal(call.params[1], '0x123456');
    assert.ok([NFT_MARKET, pool].includes(call.params[0].to));
  }
  assert.deepEqual(
    new Set(fixture.calls.map((c) => c.method)),
    new Set(['eth_chainId', 'eth_blockNumber', 'eth_call']),
  );
});
test('bad chain, truncated contracts and invalid sale types never create launch cards', async () => {
  await assert.rejects(
    loadNftCatalog(new AbortController().signal, 0, async () =>
      Response.json({ id: 1, result: '0x89' }),
    ),
    /unavailable/,
  );
  await assert.rejects(
    loadNftCatalog(
      new AbortController().signal,
      0,
      catalogTransport({ 'launches(address)': '0x1234' }).transport,
    ),
    /incomplete/,
  );
  await assert.rejects(
    loadNftCatalog(
      new AbortController().signal,
      0,
      catalogTransport({ 'name()': `0x${uint(999)}${uint(10)}` }).transport,
    ),
    /text/,
  );
});
function authFixture() {
  const controller = new AbortController(),
    calls = [];
  let evm = account;
  const wallet = {
    session: async () => ({
      accounts: [evm],
      chainId: 1,
      capabilities: { methods: { privacyOwnership: true } },
      privacy: { address: 'perc1synthetic', chainId: '0x1', scopes: ['address'] },
    }),
    privacyAddress: async () => ({ address: 'perc1synthetic', rawAddress: raw, chainId: 1 }),
    provePrivacyOwnership: async (message, address) => {
      calls.push({ message, address });
      return proof;
    },
  };
  const service = createNftLaunchService('/api/nft', async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json({ ok: true, accessToken: 'synthetic-access', whitelist: allocation });
  });
  return {
    wallet,
    calls,
    controller,
    service,
    change: () => {
      evm = `0x${'90'.repeat(20)}`;
    },
    run() {
      return service.checkAllocation({ pool, wallet, account, signal: controller.signal });
    },
  };
}
test('allocation uses a check-only ownership proof bound to Ethereum, pool and privacy address', async () => {
  const f = authFixture();
  const result = await f.run();
  assert.deepEqual(result, allocation);
  assert.equal(f.calls.length, 2);
  const { message, address: actual } = f.calls[0];
  assert.equal(actual, raw);
  assert.ok(
    message.startsWith(
      `PrivaSea allowlist eligibility check only\nChain ID: 1\nMarket: ${NFT_MARKET}`,
    ),
  );
  assert.ok(message.includes(`Pool: ${pool}`));
  assert.ok(message.includes(`Raw address: ${raw.slice(2)}`));
  const { body, url } = f.calls[1];
  assert.equal(url, '/api/nft/whitelist/check');
  assert.equal(body.wallet, keccakBytes(Buffer.from(raw.slice(2), 'hex')));
  assert.equal(body.authorization.rawAddressHex, raw.slice(2));
  assert.deepEqual(body.authorization.proof, proof);
  assert.ok(message.endsWith(`Expires: ${body.authorization.expires}`));
  assert.equal('token' in result, false);
});
test('rejected approval and wallet changes while approving never send eligibility requests', async () => {
  for (const kind of ['reject', 'account', 'abort']) {
    const f = authFixture();
    f.wallet.provePrivacyOwnership = async () => {
      if (kind === 'reject') throw new Error('Rejected approval');
      if (kind === 'account') f.change();
      else f.controller.abort();
      return proof;
    };
    await assert.rejects(f.run());
    assert.equal(f.calls.length, 0);
  }
});
test('mismatched collection status and unverified allocation responses are rejected', async () => {
  const f = authFixture();
  const service = createNftLaunchService('/api/nft', async () =>
    Response.json({
      ok: true,
      accessToken: 'unused',
      whitelist: { ...allocation, checked: false },
    }),
  );
  await assert.rejects(
    service.checkAllocation({ pool, wallet: f.wallet, account, signal: f.controller.signal }),
    /did not verify/,
  );
});
test('phase distinguishes future, sold out, fully reserved and closed issuances', () => {
  const collection = {
    supply: 5,
    minted: 2,
    primaryOpen: true,
    startedAt: 100,
    durationSec: 10,
    saleKind: 'free',
  };
  assert.equal(nftPhase(collection, undefined, 99), 'Upcoming');
  assert.equal(nftPhase(collection, undefined, 100), 'Live');
  assert.equal(nftPhase({ ...collection, minted: 5 }, undefined, 100), 'Minted out');
  assert.equal(
    nftPhase(
      collection,
      { minted: 2, supply: 5, registered: true, primaryOpen: true, remaining: 0, soldOut: true },
      100,
    ),
    'Fully reserved',
  );
  assert.equal(nftPhase({ ...collection, primaryOpen: false }, undefined, 100), 'Ended');
  assert.equal(nftPhase({ ...collection, saleKind: 'privacy' }, undefined, 10100), 'Ended');
});
test('artwork verifies manifest commitment, collection scope and image bytes before display', async () => {
  const image = Buffer.from('synthetic-image');
  const imageHash = createHash('sha256').update(image).digest('hex');
  const imageUrl = `https://media.plabs.online/objects/${imageHash}.webp`;
  const entry = {
    name: 'Synthetic birds',
    symbol: 'BIRD',
    image: imageUrl,
    image_sha256: imageHash,
    thumbnail: imageUrl,
    thumbnail_sha256: imageHash,
  };
  const manifest = Buffer.from(
    JSON.stringify({ chainId: 1, creator, collection: entry, tokens: { 1: entry } }),
  );
  const commitment = createHash('sha256').update(manifest).digest('hex');
  const collection = {
    pool,
    creator,
    name: 'Synthetic birds',
    symbol: 'BIRD',
    supply: 1,
    metadataBaseURI: `https://media.plabs.online/collections/${commitment}`,
    metadataManifestHash: `0x${commitment}`,
  };
  const urls = [];
  const transport = async (url) => {
    urls.push(url);
    return new Response(url.endsWith('manifest.json') ? manifest : image);
  };
  const result = await loadNftArtwork(collection, new AbortController().signal, transport);
  assert.equal(result.image.size, image.length);
  assert.ok(urls.every((u) => u.startsWith('/api/nft-media/')));
  await assert.rejects(
    loadNftArtwork({ ...collection, creator: account }, new AbortController().signal, transport),
    /does not match/,
  );
  await assert.rejects(
    loadNftArtwork(
      collection,
      new AbortController().signal,
      async (url) =>
        new Response(url.endsWith('manifest.json') ? manifest : Buffer.from('altered')),
    ),
    /failed verification/,
  );
});
