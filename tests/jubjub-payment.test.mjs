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
const { jubjubRulesHash, JUBJUB_PAYMENT_POOL, JUBJUB_RECIPIENT_RAW } = await import(
  '../src/services/platform/jubjub.ts'
);
const { submitJubjubPayment, jubjubPaymentRequest, supportsJubjubPayment } = await import(
  '../src/services/platform/jubjub-payment.ts'
);
const rules = {
  auctionOnly: true,
  auctionSeats: 1623,
  chainId: 143,
  custody: {
    asset: 'P20',
    bidStepUnits: '50000000',
    decimals: 6,
    recipientRaw: JUBJUB_RECIPIENT_RAW,
    settlement: 'pay-as-bid',
  },
  enabled: true,
  endsAt: 1792584000,
  id: 'jubjub-p20-mainnet-20261019',
  market: JUBJUB_PAYMENT_POOL,
  maxContributions: 64,
  maxPositions: 1623,
  paymentPool: JUBJUB_PAYMENT_POOL,
  reserveUnits: '100000000',
  staged: true,
  startsAt: 1792411200,
  title: 'JubJub',
};
const config = {
  rules,
  rulesHash: jubjubRulesHash(rules),
  indexerUrl: 'https://monad-indexer.plabs.online',
  participationLimit: null,
  testnet: false,
  nativeSymbol: 'MON',
  feeSymbol: 'P20',
  collectorRaw: JUBJUB_RECIPIENT_RAW,
  secondaryEnabled: false,
  feePolicy: { fixedUnits: '0', marginBps: 0, priceMode: 'sponsored' },
  apiBase: '/nft-jubjub/v1',
  spendChecks: { continuous: false, final: false },
};
const intent = {
  id: `0x${'12'.repeat(32)}`,
  status: 'prepared',
  total: '150000000',
  delta: '50000000',
  version: 1,
  createdAt: 1792411200,
  psi: '0x01',
};
function harness(methods = { sponsoredPrivacyTransfers: true, jubjubBidding: true }) {
  const calls = [];
  const result = { id: 'opaque-payment-id', intentId: intent.id, state: 'pending' };
  const wallet = {
    sendSponsoredTransaction: async (input) => {
      calls.push({ method: 'generic', input });
      return result;
    },
    fundJubjubBid: async (input) => {
      calls.push({ method: 'legacy', input });
      return result;
    },
  };
  return {
    calls,
    result,
    wallet,
    run: () =>
      submitJubjubPayment({
        wallet,
        capabilities: { methods },
        config,
        intent,
        token: 'synthetic-token',
      }),
  };
}
test('JubJub uses the generic payment API with only the additional amount and public intent metadata', async () => {
  const h = harness();
  assert.equal((await h.run()).state, 'pending');
  assert.equal(h.calls.length, 1);
  const { method, input } = h.calls[0];
  assert.equal(method, 'generic');
  assert.deepEqual(input.payment, {
    chainId: 143,
    poolAddress: JUBJUB_PAYMENT_POOL,
    recipientRaw: JUBJUB_RECIPIENT_RAW,
    amountRaw: '50000000',
    memoPrefixHex: '0x5045524332302d4a55424a55422d5032302d763100',
  });
  assert.equal(input.protocol, 'plabs-custody-v1');
  assert.equal(input.apiBase, 'https://app.plabs.online/nft-jubjub/v1');
  assert.equal(input.intentId, intent.id);
  assert.equal(input.rulesHash, config.rulesHash);
  assert.equal('psi' in input, false);
  assert.equal('proof' in input, false);
  assert.equal('envelope' in input, false);
});
test('installed legacy-capable wallets still fund without a mandatory generic upgrade', async () => {
  const h = harness({ jubjubBidding: true });
  await h.run();
  assert.deepEqual(h.calls, [
    { method: 'legacy', input: { intentId: intent.id, token: 'synthetic-token' } },
  ]);
  assert.equal(supportsJubjubPayment({ methods: { sponsoredPrivacyTransfers: true } }), true);
  assert.equal(supportsJubjubPayment({ methods: {} }), false);
});
test('rejection and unknown submission outcomes never trigger a second payment through legacy fallback', async () => {
  for (const message of ['User rejected', 'Unknown outcome after broadcast']) {
    const h = harness();
    h.wallet.sendSponsoredTransaction = async () => {
      h.calls.push({ method: 'generic' });
      throw new Error(message);
    };
    await assert.rejects(h.run(), new RegExp(message));
    assert.deepEqual(h.calls, [{ method: 'generic' }]);
  }
});
test('invalid sponsor profiles, unusable amounts and mismatched results cannot be treated as accepted bids', async () => {
  assert.throws(() =>
    jubjubPaymentRequest({ ...config, rulesHash: `0x${'ff'.repeat(32)}` }, intent, 'synthetic'),
  );
  for (const delta of ['0', '-1', '1.1', '9007199254740992'])
    assert.throws(() => jubjubPaymentRequest(config, { ...intent, delta }, 'synthetic'));
  const h = harness();
  h.result.intentId = `0x${'34'.repeat(32)}`;
  await assert.rejects(h.run(), /different payment/);
  const malformed = harness();
  malformed.result.state = 'broadcast';
  await assert.rejects(malformed.run());
  const unsupported = harness({});
  await assert.rejects(unsupported.run(), /cannot submit/);
  assert.equal(unsupported.calls.length, 0);
});
