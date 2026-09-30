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
const { createHttpClient } = await import('../src/shared/api/http-client.ts');
const { checkQualification } = await import('../src/services/platform/qualification.ts');
const address = `0x${'12'.repeat(43)}`;
const account = `0x${'34'.repeat(20)}`;
const proof = {
  version: 'bjj-schnorr-v1',
  r_x_hex: '11'.repeat(32),
  r_y_hex: '22'.repeat(32),
  s_hex: '33'.repeat(32),
};
function harness(options = {}) {
  const calls = [],
    stages = [],
    controller = new AbortController();
  const result = {
    privacy_address: address,
    twitter_handle: 'tester',
    rewards: options.rewards ?? { nft: 2, p20: 100 },
  };
  const wallet = {
    session: async () => ({
      accounts: [account],
      chainId: 1,
      capabilities: { methods: { privacyOwnership: true } },
      privacy: { address: 'perc1display', scopes: ['address'] },
    }),
    privacyAddress: async () => ({ address: 'perc1display', rawAddress: address, chainId: 1 }),
    signMessage: async () => 'test-signature',
    provePrivacyOwnership: async (message, expected) => {
      assert.equal(message, 'ownership challenge');
      assert.equal(expected, address);
      return proof;
    },
  };
  const client = createHttpClient('/api/platform', async (url, init) => {
    const path = url.replace('/api/platform', '');
    calls.push({ path, ...init, body: JSON.parse(init.body) });
    const data = {
      '/auth/challenge': { nonce: 'test-nonce', message: 'login challenge' },
      '/auth/login': { access_token: 'test-token' },
      '/privasea/whitelist/qualification/challenge': {
        message: 'ownership challenge',
        ownership_challenge: 'test-challenge',
        proof_version: 'bjj-schnorr-v1',
      },
      '/privasea/whitelist/qualification/check': result,
    };
    if (options.failure === path)
      return new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } });
    return Response.json(data[path]);
  });
  return {
    calls,
    controller,
    wallet,
    result,
    stages,
    run: () =>
      checkQualification({
        client,
        wallet,
        account,
        chainId: 1,
        signal: controller.signal,
        onStage: (stage) => stages.push(stage),
      }),
  };
}
test('authenticated qualification passes the exact challenge and public proof and displays both rewards', async () => {
  const h = harness();
  assert.deepEqual(await h.run(), h.result);
  assert.deepEqual(h.stages, ['wallet', 'address', 'login', 'proof', 'checking']);
  assert.equal(h.calls.length, 4);
  assert.equal(h.calls[0].headers.Authorization, undefined);
  assert.equal(h.calls[2].headers.Authorization, 'Bearer test-token');
  assert.deepEqual(h.calls[3].body, {
    privacy_address: address,
    ownership_challenge: 'test-challenge',
    ownership_proof: proof,
  });
  assert.ok(h.calls.every((call) => call.credentials === 'omit' && call.redirect === 'error'));
});
test('zero allocation is a valid result, distinct from service errors', async () => {
  const h = harness({ rewards: { nft: 0, p20: 0 } });
  assert.deepEqual((await h.run()).rewards, { nft: 0, p20: 0 });
  await assert.rejects(
    harness({ failure: '/privasea/whitelist/qualification/check' }).run(),
    /unavailable/,
  );
});
test('rejecting login or proof never submits an eligibility check', async () => {
  for (const method of ['signMessage', 'provePrivacyOwnership']) {
    const h = harness();
    h.wallet[method] = async () => {
      throw new Error('User rejected');
    };
    await assert.rejects(h.run(), /User rejected/);
    assert.ok(!h.calls.some((call) => call.path.endsWith('/check')));
  }
});
test('abort and account changes during wallet approval discard stale work', async () => {
  for (const cancel of ['abort', 'account', 'privacy']) {
    const h = harness();
    h.wallet.provePrivacyOwnership = async () => {
      if (cancel === 'abort') h.controller.abort();
      else if (cancel === 'account')
        h.wallet.session = async () => ({ accounts: ['0xchanged'], chainId: 1 });
      else
        h.wallet.session = async () => ({
          accounts: [account],
          chainId: 1,
          privacy: { address: 'different', scopes: ['address'] },
        });
      return proof;
    };
    await assert.rejects(h.run());
    assert.ok(!h.calls.some((call) => call.path.endsWith('/check')));
  }
});
test('malformed proof and mismatched response addresses are rejected', async () => {
  const h = harness();
  h.wallet.provePrivacyOwnership = async () => ({ ...proof, s_hex: 'invalid' });
  await assert.rejects(h.run());
  assert.equal(h.calls.length, 3);
  const mismatch = harness();
  mismatch.result.privacy_address = `0x${'56'.repeat(43)}`;
  await assert.rejects(mismatch.run(), /different privacy address/);
});

test('a live capability check stops an outdated extension before authentication and can retry after reload', async () => {
  const h = harness();
  const updated = h.wallet.session;
  h.wallet.session = async () => ({ ...(await updated()), capabilities: { methods: {} } });
  await assert.rejects(h.run(), /reload the updated PLabs Wallet/i);
  assert.equal(h.calls.length, 0);
  h.wallet.session = updated;
  assert.deepEqual(await h.run(), h.result);
});
