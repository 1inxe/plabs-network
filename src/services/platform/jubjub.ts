import { keccak_256 } from '@noble/hashes/sha3.js';
import { z } from 'zod';
import type { WalletAdapter } from '@/services/wallet/types';
import { ApiError } from '@/shared/api/errors';
import { createHttpClient, type Transport } from '@/shared/api/http-client';
import { ownershipProofSchema } from './qualification';

export const JUBJUB_CHAIN_ID = 143;
export const JUBJUB_PAYMENT_POOL = '0x59df8637654d1ecb090ab7881b703b5a856d2780';
export const JUBJUB_RECIPIENT_RAW =
  '4449ad291565b82847b77c7d1358898a4094cacef26e518867d1485ef4f8b6656e64b12827bbaa7d357a0d';
export const P20_SCALE = 1_000_000n;
export const JUBJUB_RESERVE_UNITS = 100n * P20_SCALE;
export const JUBJUB_BID_STEP_UNITS = 50n * P20_SCALE;
const maxNoteUnits = 18_446_744_073_709_551_615n;
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = count.positive();
const units = z.string().regex(/^(0|[1-9][0-9]{0,31})$/);
const noteUnits = units.pipe(z.string().refine((value) => BigInt(value) <= maxNoteUnits));
const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const accountAddress = z.string().regex(/^0x[0-9a-f]{40}$/i);
const privacyRawAddress = z.string().regex(/^0x[0-9a-f]{86}$/i);
const tokenSchema = z.string().min(1).max(16_384).regex(/^\S+$/);
const identifier = z.string().min(1).max(256);

const rulesSchema = z
  .strictObject({
    auctionOnly: z.literal(true),
    auctionSeats: count.min(1).max(100_000),
    chainId: z.literal(JUBJUB_CHAIN_ID),
    custody: z.strictObject({
      asset: z.literal('P20'),
      bidStepUnits: z.literal('50000000'),
      decimals: z.literal(6),
      recipientRaw: z.literal(JUBJUB_RECIPIENT_RAW),
      settlement: z.literal('pay-as-bid'),
    }),
    enabled: z.boolean(),
    endsAt: timestamp,
    id: z.string().regex(/^jubjub-[a-z0-9-]{1,57}$/),
    market: z.literal(JUBJUB_PAYMENT_POOL),
    maxContributions: count.min(1).max(64),
    maxPositions: count.min(1).max(100_000),
    paymentPool: z.literal(JUBJUB_PAYMENT_POOL),
    reserveUnits: z.literal('100000000'),
    staged: z.literal(true),
    startsAt: timestamp,
    title: z.string().min(1).max(150),
  })
  .refine((rules) => rules.endsAt > rules.startsAt && rules.auctionSeats <= rules.maxPositions);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

/** Match the official client's Keccak commitment over recursively sorted JSON. */
export function jubjubRulesHash(rules: unknown): string {
  return `0x${Array.from(keccak_256(new TextEncoder().encode(canonicalJson(rules))), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

export const jubjubConfigSchema = z
  .object({
    rules: rulesSchema,
    rulesHash: hash,
    indexerUrl: z.literal('https://monad-indexer.plabs.online'),
    participationLimit: count.max(100_000).nullable(),
    testnet: z.literal(false),
    nativeSymbol: z.literal('MON'),
    feeSymbol: z.literal('P20'),
    collectorRaw: z.literal(JUBJUB_RECIPIENT_RAW),
    secondaryEnabled: z.literal(false),
    feePolicy: z.object({
      fixedUnits: z.literal('0'),
      marginBps: z.literal(0),
      priceMode: z.literal('sponsored'),
    }),
    apiBase: z.literal('/nft-jubjub/v1'),
    spendChecks: z.object({ continuous: z.boolean(), final: z.boolean() }),
  })
  .refine(
    (config) =>
      config.rulesHash === jubjubRulesHash(config.rules) &&
      (config.participationLimit === null ||
        config.participationLimit >= config.rules.auctionSeats),
  );
export type JubjubConfig = z.infer<typeof jubjubConfigSchema>;

export const jubjubSummarySchema = z.object({
  phase: z.enum(['scheduled', 'bidding', 'ended', 'settled']),
  serverTime: timestamp,
  refundOpen: z.boolean(),
  committedUnits: units,
  positions: count,
  bidTransactions: count,
  snapshotHash: hash.nullable(),
  mergedRoot: hash.nullable(),
  campaignId: z.string().min(1).max(64),
  rulesHash: hash,
  bidAttempts: count.optional(),
  participationLimit: count.nullable().optional(),
  registeredPositions: count.optional(),
  bidPaused: z.boolean(),
  unavailable: z.boolean().optional(),
  averageBidUnits: units,
  highestBidUnits: units,
  qualifyingBidUnits: units,
  stage: z.string().min(1).max(32),
  auctionSeats: count.min(1),
  qualificationCount: count.optional(),
  whitelistFrozen: z.boolean().optional(),
});
export type JubjubSummary = z.infer<typeof jubjubSummarySchema>;

export const jubjubHistorySchema = z.object({
  campaignId: z.string().min(1).max(64),
  rulesHash: hash,
  rows: z.array(
    z.object({
      at: timestamp,
      sequence: count,
      committedUnits: units,
      positions: count,
      averageBidUnits: units,
      averageVersion: count.optional(),
      highestBidUnits: units,
      qualifyingBidUnits: units,
    }),
  ),
  cursor: count,
  more: z.boolean(),
});
export type JubjubHistory = z.infer<typeof jubjubHistorySchema>;

export const jubjubBidIntentSchema = z
  .object({
    id: hash,
    status: z.string().min(1).max(32),
    total: noteUnits,
    delta: noteUnits,
    version: count,
    createdAt: timestamp,
    psi: z.string().max(256).nullish(),
  })
  .refine(
    (intent) =>
      noteUnits.safeParse(intent.delta).success &&
      noteUnits.safeParse(intent.total).success &&
      BigInt(intent.delta) > 0n &&
      BigInt(intent.delta) <= BigInt(intent.total),
  );
export type JubjubBidIntent = z.infer<typeof jubjubBidIntentSchema>;
const jobSchema = z.object({
  id: identifier,
  purpose: z.string().min(1).max(32),
  intentId: hash.nullish(),
  status: z.string().min(1).max(32),
  txHash: hash.nullish(),
  error: z.string().max(2048).nullish(),
  units: noteUnits.optional(),
  createdAt: timestamp.optional(),
});
const custodySchema = z.object({
  settled: z.boolean(),
  expectedRefundUnits: units,
  refundedUnits: units,
  chargedUnits: units.optional(),
  refundableUnits: units.optional(),
  refundsReleased: z.boolean().optional(),
});
export const jubjubMeSchema = z.object({
  owner: z.unknown().optional(),
  position: z
    .object({ version: count, total: noteUnits.optional(), updatedAt: timestamp.optional() })
    .nullish(),
  intents: z.array(jubjubBidIntentSchema),
  jobs: z.array(jobSchema),
  summary: jubjubSummarySchema,
  qualification: z
    .object({
      rank: count.positive().nullable(),
      eligible: z.boolean().nullable(),
      final: z.boolean(),
    })
    .default({ rank: null, eligible: null, final: false }),
  custody: custodySchema.nullish(),
});
export type JubjubMe = z.infer<typeof jubjubMeSchema>;
export const jubjubRefundSchema = z.object({
  refundsReleased: z.boolean(),
  settled: z.boolean(),
  refundableUnits: units,
  refundedUnits: units,
  chargedUnits: units,
});
export type JubjubRefund = z.infer<typeof jubjubRefundSchema>;
const challengeSchema = z.object({ id: identifier, message: z.string().min(1).max(8192) });
const sessionSchema = z.object({ token: tokenSchema, expires: timestamp });
export type JubjubAuthStage = 'wallet' | 'address' | 'signature' | 'proof' | 'session';
export type JubjubAuthSession = z.infer<typeof sessionSchema> & {
  account: string;
  chainId: number;
  privacyAddress: string;
  /** 43-byte privacy address, including the 0x prefix used by the wallet API. */
  rawAddress: string;
  campaignId: string;
  rulesHash: string;
};

export function parseP20(value: string): bigint {
  const input = value.trim();
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(input))
    throw new Error('Enter a P20 amount with at most 6 decimal places.');
  const [whole = '0', fraction = ''] = input.split('.');
  const result = BigInt(whole) * P20_SCALE + BigInt(fraction.padEnd(6, '0'));
  if (result > maxNoteUnits) throw new Error('This P20 amount exceeds the wallet note limit.');
  return result;
}

export function formatP20(
  value: string | bigint,
  {
    group = true,
    maximumFractionDigits = 6,
  }: { group?: boolean; maximumFractionDigits?: number } = {},
): string {
  const raw = units.parse(String(value));
  if (
    !Number.isInteger(maximumFractionDigits) ||
    maximumFractionDigits < 0 ||
    maximumFractionDigits > 6
  )
    throw new Error('P20 precision must be between 0 and 6.');
  const padded = raw.padStart(7, '0');
  const whole = padded.slice(0, -6);
  const fraction = padded.slice(-6).slice(0, maximumFractionDigits).replace(/0+$/, '');
  return `${group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : whole}${fraction ? `.${fraction}` : ''}`;
}

/** The input is the desired total bid; only the increase is transferred. */
export function validateBid(total: bigint | string, previous: bigint | string = 0n) {
  const totalUnits = BigInt(noteUnits.parse(String(total)));
  const previousUnits = BigInt(noteUnits.parse(String(previous)));
  if (totalUnits < JUBJUB_RESERVE_UNITS) throw new Error('The minimum total bid is 100 P20.');
  if (totalUnits % JUBJUB_BID_STEP_UNITS !== 0n)
    throw new Error('The total bid must be a multiple of 50 P20.');
  if (totalUnits <= previousUnits || totalUnits - previousUnits < JUBJUB_BID_STEP_UNITS)
    throw new Error('Increase your total bid by at least 50 P20.');
  return { totalUnits: String(totalUnits), deltaUnits: String(totalUnits - previousUnits) };
}

export function createJubjubService(
  baseUrl: string,
  transport: Transport = (...args) => fetch(...args),
) {
  const client = createHttpClient(baseUrl.replace(/\/$/, ''), transport);
  let currentConfig: JubjubConfig | undefined;
  const authorized = (token: string) => {
    tokenSchema.parse(token);
    return createHttpClient(baseUrl.replace(/\/$/, ''), (input, init) =>
      transport(input, {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      }),
    );
  };
  async function guarded<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const result = await run();
    signal?.throwIfAborted();
    return result;
  }
  function checkCampaign<T extends { campaignId: string; rulesHash: string }>(result: T): T {
    if (
      currentConfig &&
      (result.campaignId !== currentConfig.rules.id || result.rulesHash !== currentConfig.rulesHash)
    )
      throw new ApiError(
        'invalid-response',
        'JubJub data belongs to a different campaign. Refresh and retry.',
      );
    return result;
  }
  async function config(signal?: AbortSignal) {
    const result = await guarded(() => client.get('/config', jubjubConfigSchema, signal), signal);
    currentConfig = result;
    return result;
  }
  async function me(token: string, signal?: AbortSignal) {
    const result = await guarded(
      () => authorized(token).get('/me', jubjubMeSchema, signal),
      signal,
    );
    checkCampaign(result.summary);
    return result;
  }
  return {
    config,
    async summary(signal?: AbortSignal) {
      return checkCampaign(
        await guarded(() => client.get('/summary', jubjubSummarySchema, signal), signal),
      );
    },
    async history(signal?: AbortSignal, after = 0) {
      count.parse(after);
      const rows = new Map<number, JubjubHistory['rows'][number]>();
      let cursor = after;
      let identity: Pick<JubjubHistory, 'campaignId' | 'rulesHash'> | undefined;
      for (let pageNumber = 0; pageNumber < 64; pageNumber++) {
        const page = checkCampaign(
          await guarded(
            () => client.get(`/history?after=${cursor}`, jubjubHistorySchema, signal),
            signal,
          ),
        );
        if (
          identity &&
          (page.campaignId !== identity.campaignId || page.rulesHash !== identity.rulesHash)
        )
          throw new ApiError(
            'invalid-response',
            'The JubJub campaign changed while loading history. Retry.',
          );
        identity = { campaignId: page.campaignId, rulesHash: page.rulesHash };
        for (const row of page.rows) {
          const prior = rows.get(row.sequence);
          if (prior && canonicalJson(prior) !== canonicalJson(row))
            throw new ApiError(
              'invalid-response',
              'JubJub history contains conflicting bid records.',
            );
          rows.set(row.sequence, row);
        }
        if (rows.size > 100_000)
          throw new ApiError(
            'invalid-response',
            'JubJub history exceeds the supported size; the chart was not loaded.',
          );
        if (!page.more)
          return {
            ...identity,
            rows: [...rows.values()].sort((a, b) => a.sequence - b.sequence),
            cursor: page.cursor,
            more: false,
          };
        if (page.cursor <= cursor || page.rows.length === 0)
          throw new ApiError(
            'invalid-response',
            'JubJub history did not advance. Retry loading the chart.',
          );
        cursor = page.cursor;
      }
      throw new ApiError(
        'invalid-response',
        'JubJub history could not be loaded completely within 64 pages. Retry later.',
      );
    },
    me,
    async prepareBid(
      token: string,
      input: { id: string; total: string; version: number },
      signal?: AbortSignal,
    ) {
      tokenSchema.parse(token);
      hash.parse(input.id);
      count.parse(input.version);
      validateBid(input.total);
      const result = await guarded(
        () => client.post('/bids/prepare', input, jubjubBidIntentSchema, signal, token),
        signal,
      );
      if (
        result.id !== input.id ||
        result.total !== input.total ||
        result.version !== input.version ||
        !['prepared', 'funded'].includes(result.status)
      )
        throw new ApiError(
          'invalid-response',
          'The prepared bid does not match your requested total.',
        );
      return result;
    },
    async refund(token: string, signal?: AbortSignal) {
      tokenSchema.parse(token);
      return guarded(() => client.post('/refund', {}, jubjubRefundSchema, signal, token), signal);
    },
    async authenticate({
      wallet,
      account,
      chainId,
      signal,
      onStage = () => {},
    }: {
      wallet: WalletAdapter;
      account: string;
      chainId: number;
      signal: AbortSignal;
      onStage?: (stage: JubjubAuthStage) => void;
    }): Promise<JubjubAuthSession> {
      signal.throwIfAborted();
      const evm = accountAddress.parse(account).toLowerCase();
      if (chainId !== JUBJUB_CHAIN_ID)
        throw new Error('Switch to Monad mainnet before signing in to JubJub.');
      if (!wallet.signMessage || !wallet.provePrivacyOwnership)
        throw new Error('Reload the updated PLabs Wallet extension to sign in to JubJub.');
      let expectedAddress: string | undefined;
      const current = async () => {
        signal.throwIfAborted();
        const session = await wallet.session();
        signal.throwIfAborted();
        if (session.accounts[0]?.toLowerCase() !== evm || session.chainId !== chainId)
          throw new Error('Wallet account or network changed. Sign in to JubJub again.');
        if (
          !session.capabilities.methods.privacyOwnership ||
          session.capabilities.methods.personalSign === false
        )
          throw new Error(
            'Reload the updated PLabs Wallet extension to enable privacy ownership proofs.',
          );
        if (
          expectedAddress &&
          (session.privacy?.address?.toLowerCase() !== expectedAddress.toLowerCase() ||
            !session.privacy.scopes.includes('address') ||
            Number(session.privacy.chainId) !== chainId)
        )
          throw new Error('Privacy wallet or access changed. Sign in to JubJub again.');
      };
      onStage('wallet');
      await current();
      const profile = await config(signal);
      await current();
      onStage('address');
      const address = await wallet.privacyAddress();
      signal.throwIfAborted();
      if (address.chainId !== chainId)
        throw new Error('Privacy wallet network changed. Sign in to JubJub again.');
      const rawAddress = privacyRawAddress
        .parse(address.rawAddress ?? address.address)
        .toLowerCase();
      expectedAddress = address.address;
      await current();
      const challenge = await guarded(
        () =>
          client.post(
            '/auth/challenge',
            { evm, raw: rawAddress.slice(2) },
            challengeSchema,
            signal,
          ),
        signal,
      );
      await current();
      onStage('signature');
      const signature = await wallet.signMessage(challenge.message, evm);
      await current();
      onStage('proof');
      const proof = ownershipProofSchema.parse(
        await wallet.provePrivacyOwnership(challenge.message, rawAddress),
      );
      await current();
      onStage('session');
      const session = await guarded(
        () =>
          client.post(
            '/auth/session',
            { id: challenge.id, signature, proof },
            sessionSchema,
            signal,
          ),
        signal,
      );
      await current();
      if (session.expires <= Date.now() / 1000)
        throw new ApiError('invalid-response', 'The JubJub sign-in session has already expired.');
      return {
        ...session,
        account: evm,
        chainId,
        privacyAddress: address.address,
        rawAddress,
        campaignId: profile.rules.id,
        rulesHash: profile.rulesHash,
      };
    },
  };
}
