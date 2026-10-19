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
  createJubjubService,
  jubjubConfigSchema,
  jubjubRulesHash,
  formatP20,
  parseP20,
  validateBid,
  JUBJUB_PAYMENT_POOL,
  JUBJUB_RECIPIENT_RAW,
} = await import('../src/services/platform/jubjub.ts');

// Public campaign response captured from the official site on 2026-10-19.
const config = {
  rules: {
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
  },
  rulesHash: '0xe3409160d1f4baf260a9e0d60358b23acaf6da10d3815af2c9996154d53fd0f9',
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
const summary = {
  phase: 'bidding',
  serverTime: 1792415616,
  refundOpen: false,
  committedUnits: '161600000000',
  positions: 115,
  bidTransactions: 121,
  snapshotHash: null,
  mergedRoot: null,
  campaignId: config.rules.id,
  rulesHash: config.rulesHash,
  bidAttempts: 149,
  participationLimit: null,
  registeredPositions: 142,
  bidPaused: false,
  averageBidUnits: '192483056',
  highestBidUnits: '11000000000',
  qualifyingBidUnits: '100000000',
  stage: 'auction',
  auctionSeats: 1623,
  qualificationCount: 0,
  whitelistFrozen: false,
};
const account = `0x${'ab'.repeat(20)}`;
const rawAddress = `0x${'12'.repeat(43)}`;
const proof = {
  version: 'bjj-schnorr-v1',
  r_x_hex: '11'.repeat(32),
  r_y_hex: '22'.repeat(32),
  s_hex: '33'.repeat(32),
};
const intent = {
  id: `0x${'ef'.repeat(32)}`,
  status: 'prepared',
  total: '150000000',
  delta: '50000000',
  version: 1,
  createdAt: 1792415500,
};
function harness() {
  const calls = [],
    stages = [],
    approvals = [];
  const controller = new AbortController();
  const results = {
    '/config': structuredClone(config),
    '/summary': structuredClone(summary),
    '/history?after=0': {
      campaignId: config.rules.id,
      rulesHash: config.rulesHash,
      rows: [
        {
          at: 1792411200,
          sequence: 0,
          committedUnits: '0',
          positions: 0,
          averageBidUnits: '100000000',
          averageVersion: 2,
          highestBidUnits: '100000000',
          qualifyingBidUnits: '100000000',
        },
      ],
      cursor: 1,
      more: false,
    },
    '/auth/challenge': { id: 'challenge-1', message: 'Sign this exact official challenge\nJubJub' },
    '/auth/session': { token: 'test-jubjub-token', expires: Math.floor(Date.now() / 1000) + 3600 },
    '/me': {
      owner: account,
      position: { version: 1 },
      intents: [{ ...intent, status: 'funded' }],
      jobs: [],
      summary: structuredClone(summary),
      qualification: { rank: null, eligible: null, final: false },
      custody: { settled: false, expectedRefundUnits: '0', refundedUnits: '0' },
    },
    '/bids/prepare': structuredClone(intent),
    '/refund': {
      refundsReleased: false,
      settled: false,
      refundableUnits: '0',
      refundedUnits: '0',
      chargedUnits: '0',
    },
  };
  const wallet = {
    session: async () => ({
      accounts: [account],
      chainId: 143,
      capabilities: { methods: { privacyOwnership: true, personalSign: true } },
      privacy: { address: 'perc1display', chainId: '0x8f', scopes: ['address'] },
    }),
    privacyAddress: async () => ({ address: 'perc1display', rawAddress, chainId: 143 }),
    signMessage: async (message, address) => {
      approvals.push({ method: 'evm', message, address });
      return `0x${'aa'.repeat(65)}`;
    },
    provePrivacyOwnership: async (message, address) => {
      approvals.push({ method: 'privacy', message, address });
      return proof;
    },
  };
  const service = createJubjubService('/api/jubjub', async (url, init) => {
    const path = url.replace('/api/jubjub', '');
    calls.push({
      path,
      ...init,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    });
    return Response.json(results[path]);
  });
  return {
    service,
    calls,
    stages,
    approvals,
    controller,
    wallet,
    results,
    run: () =>
      service.authenticate({
        wallet,
        account: account.toUpperCase().replace('0X', '0x'),
        chainId: 143,
        signal: controller.signal,
        onStage: (stage) => stages.push(stage),
      }),
  };
}

test('the live public fixture verifies against its actual Keccak rules commitment', async () => {
  assert.equal(jubjubRulesHash(config.rules), config.rulesHash);
  assert.deepEqual(jubjubConfigSchema.parse(config), config);
  const h = harness();
  assert.deepEqual(await h.service.config(), config);
  assert.deepEqual(await h.service.summary(), summary);
  assert.equal((await h.service.history()).rows.length, 1);
  assert.ok(h.calls.every((call) => call.method === 'GET' && !call.headers.Authorization));
});

test('tampered rules, alternate collectors, paid gas, and unsupported deployments fail closed', () => {
  for (const change of [
    (c) => {
      c.rules.endsAt += 60;
    },
    (c) => {
      c.rules.custody.recipientRaw = '11'.repeat(43);
    },
    (c) => {
      c.collectorRaw = '11'.repeat(43);
    },
    (c) => {
      c.rules.chainId = 10143;
    },
    (c) => {
      c.rules.paymentPool = `0x${'11'.repeat(20)}`;
    },
    (c) => {
      c.feePolicy.fixedUnits = '1';
    },
    (c) => {
      c.feePolicy.priceMode = 'market';
    },
    (c) => {
      c.rules.custody.settlement = 'uniform-price';
    },
    (c) => {
      c.rules.custody.bidStepUnits = '1';
    },
    (c) => {
      c.rules.reserveUnits = '1';
    },
    (c) => {
      c.rules.collection = `0x${'11'.repeat(20)}`;
    },
  ]) {
    const changed = structuredClone(config);
    change(changed);
    assert.equal(jubjubConfigSchema.safeParse(changed).success, false);
  }
  const updated = structuredClone(config);
  updated.rules.endsAt += 60;
  updated.rulesHash = jubjubRulesHash(updated.rules);
  assert.equal(jubjubConfigSchema.safeParse(updated).success, true);
});

test('P20 conversion retains six decimal places and integer precision beyond Number limits', () => {
  assert.equal(parseP20('9007199254.740993'), 9007199254740993n);
  assert.equal(formatP20(9007199254740993n), '9,007,199,254.740993');
  assert.equal(formatP20('100000001', { group: false }), '100.000001');
  assert.equal(formatP20('100000000'), '100');
  assert.equal(formatP20('1'), '0.000001');
  assert.equal(parseP20('18446744073709.551615'), 18446744073709551615n);
  for (const amount of ['1e2', '-100', 'NaN', '1.0000001', '1,000', '01', '18446744073709.551616'])
    assert.throws(() => parseP20(amount));
  assert.deepEqual(validateBid(parseP20('100')), {
    totalUnits: '100000000',
    deltaUnits: '100000000',
  });
  assert.deepEqual(validateBid(parseP20('200'), parseP20('150')), {
    totalUnits: '200000000',
    deltaUnits: '50000000',
  });
  for (const [total, previous] of [
    ['50', '0'],
    ['125', '0'],
    ['150', '150'],
    ['100', '150'],
    ['200', '175'],
  ])
    assert.throws(() => validateBid(parseP20(total), parseP20(previous)));
});

test('authentication uses the exact same challenge for both approvals and keeps tokens off public requests', async () => {
  const h = harness();
  const session = await h.run();
  assert.deepEqual(h.stages, [
    'wallet',
    'campaign',
    'address',
    'challenge',
    'signature',
    'proof',
    'session',
  ]);
  assert.equal(session.rawAddress, rawAddress);
  assert.equal(session.account, account);
  assert.deepEqual(h.calls.find((call) => call.path === '/auth/challenge').body, {
    evm: account,
    raw: rawAddress.slice(2),
  });
  assert.deepEqual(
    h.approvals.map((approval) => approval.message),
    [h.results['/auth/challenge'].message, h.results['/auth/challenge'].message],
  );
  assert.equal(h.approvals[1].address, rawAddress);
  assert.deepEqual(h.calls.find((call) => call.path === '/auth/session').body, {
    id: 'challenge-1',
    signature: `0x${'aa'.repeat(65)}`,
    proof,
  });
  assert.equal((await h.service.me(session.token)).qualification.eligible, null);
  assert.equal(h.calls.at(-1).headers.Authorization, 'Bearer test-jubjub-token');
  await h.service.summary();
  assert.equal(h.calls.at(-1).headers.Authorization, undefined);
  assert.ok(
    h.calls.every(
      (call) =>
        call.credentials === 'omit' && call.redirect === 'error' && call.cache === 'no-store',
    ),
  );
});

test('wallet approval rejection or invalid proofs never create an authenticated session', async () => {
  for (const method of ['signMessage', 'provePrivacyOwnership']) {
    const h = harness();
    h.wallet[method] = async () => {
      throw new Error('User rejected');
    };
    await assert.rejects(h.run(), /User rejected/);
    assert.ok(!h.calls.some((call) => call.path === '/auth/session'));
  }
  const h = harness();
  h.wallet.provePrivacyOwnership = async () => ({ ...proof, s_hex: 'invalid' });
  await assert.rejects(h.run());
  assert.ok(!h.calls.some((call) => call.path === '/auth/session'));
});

test('abort, EVM changes, privacy changes, and revoked scopes discard approvals before session creation', async () => {
  for (const kind of ['abort', 'account', 'chain', 'privacy', 'privacy-chain', 'scope']) {
    const h = harness();
    const before = await h.wallet.session();
    h.wallet.provePrivacyOwnership = async () => {
      if (kind === 'abort') h.controller.abort();
      else {
        const next = structuredClone(before);
        if (kind === 'account') next.accounts = [`0x${'cd'.repeat(20)}`];
        if (kind === 'chain') next.chainId = 1;
        if (kind === 'privacy') next.privacy.address = 'other';
        if (kind === 'privacy-chain') next.privacy.chainId = '0x1';
        if (kind === 'scope') next.privacy.scopes = [];
        h.wallet.session = async () => next;
      }
      return proof;
    };
    await assert.rejects(h.run());
    assert.ok(!h.calls.some((call) => call.path === '/auth/session'), kind);
  }
});

test('pre-aborted requests and stale responses are rejected, even if a transport ignores AbortSignal', async () => {
  const h = harness();
  h.controller.abort();
  await assert.rejects(h.service.summary(h.controller.signal), { name: 'AbortError' });
  assert.equal(h.calls.length, 0);
  const controller = new AbortController();
  const service = createJubjubService('/api/jubjub', async () => {
    controller.abort();
    return Response.json(config);
  });
  await assert.rejects(service.config(controller.signal), { name: 'AbortError' });
});

test('mismatched campaign responses and expired authentication sessions are rejected', async () => {
  const h = harness();
  await h.service.config();
  h.results['/summary'].rulesHash = `0x${'ff'.repeat(32)}`;
  await assert.rejects(h.service.summary(), /different campaign/);
  h.results['/me'].summary.campaignId = 'other';
  await assert.rejects(h.service.me('token'), /different campaign/);
  h.results['/auth/session'].expires = 1;
  await assert.rejects(h.run(), /expired/);
});

test('prepare and refund use their authenticated official contracts and reject changed bid responses', async () => {
  const h = harness();
  const input = { id: intent.id, total: intent.total, version: intent.version };
  assert.deepEqual(await h.service.prepareBid('token', input), intent);
  assert.equal(h.calls.at(-1).headers.Authorization, 'Bearer token');
  assert.deepEqual(h.calls.at(-1).body, input);
  assert.equal((await h.service.refund('token')).refundsReleased, false);
  assert.deepEqual(h.calls.at(-1).body, {});
  h.results['/bids/prepare'].total = '200000000';
  await assert.rejects(h.service.prepareBid('token', input), /does not match/);
  const countBefore = h.calls.length;
  await assert.rejects(h.service.prepareBid('token', { ...input, total: '125000000' }));
  assert.equal(h.calls.length, countBefore);
});

test('history follows official cursors through all pages and deduplicates overlapping records', async () => {
  const h = harness();
  const first = h.results['/history?after=0'];
  const initial = first.rows[0];
  first.more = true;
  h.results['/history?after=1'] = {
    ...first,
    rows: [initial, { ...initial, sequence: 1, positions: 1 }],
    cursor: 2,
    more: true,
  };
  h.results['/history?after=2'] = {
    ...first,
    rows: [{ ...initial, sequence: 2, positions: 2 }],
    cursor: 3,
    more: false,
  };
  const history = await h.service.history();
  assert.deepEqual(
    h.calls.map((call) => call.path),
    ['/history?after=0', '/history?after=1', '/history?after=2'],
  );
  assert.deepEqual(
    history.rows.map((row) => row.sequence),
    [0, 1, 2],
  );
  assert.equal(history.cursor, 3);
  assert.equal(history.more, false);
});

test('history rejects changing campaigns, conflicting records, and cursors that stop advancing', async () => {
  for (const kind of ['campaign', 'hash', 'conflict', 'stalled']) {
    const h = harness();
    const first = h.results['/history?after=0'];
    first.more = true;
    const second = structuredClone(first);
    second.cursor = 2;
    second.more = false;
    if (kind === 'campaign') second.campaignId = 'different';
    if (kind === 'hash') second.rulesHash = `0x${'ff'.repeat(32)}`;
    if (kind === 'conflict') second.rows[0].positions = 1;
    if (kind === 'stalled') {
      second.cursor = 1;
      second.more = true;
    }
    h.results['/history?after=1'] = second;
    await assert.rejects(h.service.history(), (error) => error.code === 'invalid-response', kind);
  }
});

test('history reports its page limit instead of returning a partial chart', async () => {
  const first = harness().results['/history?after=0'];
  let requests = 0;
  const service = createJubjubService('/api/jubjub', async () => {
    const sequence = requests++;
    return Response.json({
      ...first,
      rows: [{ ...first.rows[0], sequence }],
      cursor: sequence + 1,
      more: true,
    });
  });
  await assert.rejects(service.history(), /completely within 64 pages/);
  assert.equal(requests, 64);
});

test('malformed monetary fields fail as contract errors and absent qualification stays unconfirmed', async () => {
  const h = harness();
  const input = { id: intent.id, total: intent.total, version: intent.version };
  h.results['/bids/prepare'].delta = 'not-an-integer';
  await assert.rejects(
    h.service.prepareBid('token', input),
    (error) => error.code === 'invalid-response',
  );
  delete h.results['/me'].qualification;
  delete h.results['/me'].owner;
  assert.deepEqual((await h.service.me('token')).qualification, {
    rank: null,
    eligible: null,
    final: false,
  });
});

test('missing and null qualification metadata load orders without claiming a final result', async () => {
  for (const qualification of [undefined, null, {}, { rank: null, eligible: null }]) {
    const h = harness();
    h.results['/me'].qualification = qualification;
    const result = await h.service.me('token');
    assert.deepEqual(result.intents, h.results['/me'].intents);
    assert.deepEqual(result.qualification, { rank: null, eligible: null, final: false });
  }
  const h = harness();
  h.results['/me'].qualification = { eligible: false };
  assert.deepEqual((await h.service.me('token')).qualification, {
    rank: null,
    eligible: false,
    final: false,
  });
  h.results['/me'].qualification = { rank: null, eligible: false, final: true };
  assert.deepEqual((await h.service.me('token')).qualification, {
    rank: null,
    eligible: false,
    final: true,
  });
});

test('nullable sponsor and position metadata preserve authenticated bid records', async () => {
  const h = harness();
  h.results['/me'].jobs = [
    {
      id: 'job-null-metadata',
      purpose: 'bid',
      intentId: intent.id,
      status: 'submitted',
      units: null,
      createdAt: null,
    },
    { id: 'job-no-metadata', purpose: 'bid', intentId: intent.id, status: 'confirmed' },
  ];
  h.results['/me'].position = { version: 1, total: null, updatedAt: null };
  h.results['/me'].qualification = null;
  const result = await h.service.me('token');
  assert.deepEqual(result.intents, h.results['/me'].intents);
  assert.deepEqual(result.jobs, h.results['/me'].jobs);
  assert.deepEqual(result.position, { version: 1, total: null, updatedAt: null });
  assert.equal(result.qualification.final, false);
});

test('optional account metadata never weakens amounts, bid identity or campaign binding', async () => {
  const job = { id: 'job', purpose: 'bid', status: 'submitted', intentId: intent.id };
  const cases = [
    (me) => {
      me.position = { version: 1, total: 'not-money', updatedAt: null };
    },
    (me) => {
      me.jobs = [{ ...job, units: '-1', createdAt: null }];
    },
    (me) => {
      me.jobs = [{ ...job, units: null, createdAt: 'yesterday' }];
    },
    (me) => {
      me.position = { version: null, total: null };
    },
    (me) => {
      me.qualification = { eligible: 'false' };
    },
    (me) => {
      me.qualification = { final: null };
    },
    (me) => {
      me.summary.campaignId = 'other-campaign';
    },
    (me) => {
      me.summary.rulesHash = `0x${'ff'.repeat(32)}`;
    },
    ...['id', 'total', 'delta', 'version', 'status'].flatMap((key) => [
      (me) => {
        delete me.intents[0][key];
      },
      (me) => {
        me.intents[0][key] = null;
      },
    ]),
  ];
  for (const mutate of cases) {
    const h = harness();
    await h.service.config();
    h.results['/me'].qualification = null;
    mutate(h.results['/me']);
    await assert.rejects(h.service.me('token'), (error) => error.code === 'invalid-response');
  }
});
