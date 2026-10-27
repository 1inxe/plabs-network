import { keccak_256 } from '@noble/hashes/sha3.js';
import { z } from 'zod';
import type { WalletAdapter } from '@/services/wallet/types';
import { createHttpClient, type Transport } from '@/shared/api/http-client';
import { ownershipProofSchema } from './qualification';

export const NFT_CHAIN_ID = 1;
export const NFT_MARKET = '0x48269ee92a420fb1ba3db94a1593c233fa33068e';
export const NFT_PAGE_SIZE = 12;
export const NFT_MEDIA_ORIGIN = 'https://media.plabs.online';
// The official release retired the five-edition mainnet test collection.
const retiredPools = new Set(['0x9b8567c7a5ea98db6330be5945e8d14abba25758']);
const rpcEndpoints = ['https://ethereum-rpc.publicnode.com/', 'https://eth.drpc.org/'];
const address = z.string().regex(/^0x[0-9a-f]{40}$/);
const hash = z.string().regex(/^0x[0-9a-f]{64}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hex = z.string().regex(/^0x(?:[0-9a-f]{2})*$/i);
const saleKinds = ['free', 'fixed', 'english', 'privacy'] as const;
export type NftCollection = {
  pool: string;
  creator: string;
  name: string;
  symbol: string;
  saleKind: (typeof saleKinds)[number];
  startPriceUnits: string;
  startedAt: number;
  durationSec: number;
  primaryOpen: boolean;
  supply: number;
  minted: number;
  metadataBaseURI?: string;
  metadataManifestHash?: string;
};
export const nftAllocationSchema = z
  .object({
    enabled: z.boolean(),
    connected: z.boolean(),
    checked: z.boolean(),
    eligible: z.boolean(),
    allowance: count,
    minted: count,
    reserved: count,
    remaining: count,
  })
  .refine((value) => !value.checked || value.connected);
export type NftAllocation = z.infer<typeof nftAllocationSchema>;
export const nftPoolSchema = z.object({
  pool: address,
  supply: count,
  minted: count,
  reserved: count,
  remaining: count,
  soldOut: z.boolean(),
  primaryOpen: z.boolean(),
  registered: z.boolean(),
  asOf: count,
  stale: z.boolean(),
  whitelist: nftAllocationSchema,
  bidCount: count,
  average: z.number().nonnegative().nullable(),
  auctionEnd: count.optional(),
  snapshotBlock: z
    .string()
    .regex(/^0x[0-9a-f]+$/i)
    .optional(),
  snapshotBlockHash: hash.optional(),
  mints: z
    .array(
      z.object({
        tokenId: z
          .string()
          .max(78)
          .regex(/^[1-9][0-9]*$/),
        mintTxHash: hash,
        mintCmx: hash.optional(),
      }),
    )
    .max(100_000)
    .default([]),
  listings: z
    .array(
      z.object({
        tokenId: z
          .string()
          .max(78)
          .regex(/^[1-9][0-9]*$/),
        price: z.string().regex(/^[0-9]+$/),
      }),
    )
    .max(100_000)
    .default([]),
});
export type NftPool = z.infer<typeof nftPoolSchema>;
export type NftPhase = 'Upcoming' | 'Live' | 'Minted out' | 'Fully reserved' | 'Ended';
export function nftPhase(collection: NftCollection, pool?: NftPool, now = Date.now()): NftPhase {
  if (retiredPools.has(collection.pool)) return 'Ended';
  if ((pool?.minted ?? collection.minted) >= (pool?.supply ?? collection.supply))
    return 'Minted out';
  if (pool && !pool.registered) return 'Ended';
  if (!(pool?.primaryOpen ?? collection.primaryOpen)) return 'Ended';
  if (pool?.soldOut || pool?.remaining === 0) return 'Fully reserved';
  if (now < collection.startedAt) return 'Upcoming';
  if (
    ['english', 'privacy'].includes(collection.saleKind) &&
    now >= (pool?.auctionEnd ?? collection.startedAt + collection.durationSec * 1000)
  )
    return 'Ended';
  return 'Live';
}
export const nftCollectionPath = (pool: string, tokenId?: string) => {
  address.parse(pool);
  if (tokenId && !/^[1-9][0-9]*$/.test(tokenId)) throw new Error('Invalid NFT identity.');
  return `/privasea/collection/${pool}${tokenId ? `/${tokenId}` : ''}`;
};

export function keccakBytes(bytes: Uint8Array): string {
  return `0x${Array.from(keccak_256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
function bytes(value: string): Uint8Array {
  return Uint8Array.from(value.replace(/^0x/, '').match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}
const selector = (value: string) => keccakBytes(new TextEncoder().encode(value)).slice(0, 10);
function word(data: string, index: number): bigint {
  const value = data.slice(2 + index * 64, 2 + (index + 1) * 64);
  if (value.length !== 64) throw new Error('The NFT contract returned incomplete data.');
  return BigInt(`0x${value}`);
}
function integer(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('Invalid NFT contract count.');
  return result;
}
function contractAddress(data: string, index: number): string {
  const value = word(data, index).toString(16).padStart(64, '0');
  if (!/^0{24}/.test(value)) throw new Error('Invalid NFT contract address.');
  return address.parse(`0x${value.slice(24)}`);
}
function contractText(data: string): string {
  const offset = integer(word(data, 0));
  if (offset !== 32) throw new Error('Invalid NFT contract text.');
  const length = integer(word(data, 1));
  if (length > 2048 || data.length < 130 + length * 2)
    throw new Error('Invalid NFT contract text.');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes(data.slice(130, 130 + length * 2)));
}

/** Read the deployed market at one block; no wallet connection or transaction is needed. */
export async function loadNftCatalog(
  signal: AbortSignal,
  offset = 0,
  transport: Transport = fetch,
  requestedPool?: string,
) {
  count.parse(offset);
  if (requestedPool) address.parse(requestedPool);
  let endpoint = '';
  const rpc = async (url: string, method: string, params: unknown[]) => {
    signal.throwIfAborted();
    const response = await transport(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error('Ethereum RPC is unavailable. Retry loading the collections.');
    const result = z
      .object({ id: z.literal(1), result: z.string().regex(/^0x[0-9a-f]+$/i) })
      .parse(await response.json());
    return result.result;
  };
  for (const url of rpcEndpoints) {
    try {
      if ((await rpc(url, 'eth_chainId', [])) !== '0x1') throw new Error('Unexpected NFT network.');
      endpoint = url;
      break;
    } catch {
      signal.throwIfAborted();
    }
  }
  if (!endpoint) throw new Error('Ethereum RPC is unavailable. Retry loading the collections.');
  const block = await rpc(endpoint, 'eth_blockNumber', []);
  const call = async (to: string, data: string) =>
    hex.parse(await rpc(endpoint, 'eth_call', [{ to, data }, block]));
  const total = requestedPool
    ? 1
    : integer(word(await call(NFT_MARKET, selector('poolCount()')), 0));
  if (total > 100_000) throw new Error('The NFT catalog exceeds the supported size.');
  const collections: NftCollection[] = [];
  for (let i = offset; i < Math.min(total, offset + NFT_PAGE_SIZE); i++) {
    const pool =
      requestedPool ??
      contractAddress(
        await call(
          NFT_MARKET,
          selector('pools(uint256)') + BigInt(i).toString(16).padStart(64, '0'),
        ),
        0,
      );
    if (BigInt(pool) === 0n) throw new Error('The NFT catalog contains an invalid collection.');
    const encodedPool = pool.slice(2).padStart(64, '0');
    const [launch, name, symbol, metadataURI, metadataHash] = await Promise.all([
      call(NFT_MARKET, selector('launches(address)') + encodedPool),
      call(pool, selector('name()')),
      call(pool, selector('symbol()')),
      call(pool, selector('metadataBaseURI()')).catch(() => null),
      call(pool, selector('metadataManifestHash()')).catch(() => null),
    ]);
    signal.throwIfAborted();
    const saleKind = saleKinds[integer(word(launch, 1))];
    if (!saleKind) throw new Error('The NFT collection uses an unsupported sale type.');
    if (BigInt(contractAddress(launch, 0)) === 0n)
      throw new Error('Collection not found in the Ethereum market.');
    const collection: NftCollection = {
      pool,
      creator: contractAddress(launch, 0),
      name: contractText(name),
      symbol: contractText(symbol),
      saleKind,
      startPriceUnits: String(word(launch, 2)),
      startedAt: integer(word(launch, 4)) * 1000,
      durationSec: integer(word(launch, 5)),
      primaryOpen: word(launch, 8) === 1n,
      supply: integer(word(launch, 10)),
      minted: integer(word(launch, 11)),
    };
    if (
      collection.supply < 1 ||
      collection.supply > 100_000 ||
      collection.minted > collection.supply
    )
      throw new Error('Invalid NFT supply.');
    if (metadataURI && metadataHash && hash.safeParse(metadataHash).success) {
      const uri = contractText(metadataURI);
      if (uri === `${NFT_MEDIA_ORIGIN}/collections/${metadataHash.slice(2)}`) {
        collection.metadataBaseURI = uri;
        collection.metadataManifestHash = metadataHash;
      }
    }
    collections.push(collection);
  }
  // Keep the full chain count for cursor pagination; retired test drops are not production launches.
  return {
    collections: collections.filter((collection) => !retiredPools.has(collection.pool)),
    total,
    block,
  };
}

const mediaHash = z.string().regex(/^[0-9a-f]{64}$/);
const manifestEntry = z.object({
  name: z.string().max(120),
  image: z.string(),
  image_sha256: mediaHash,
  thumbnail: z.string(),
  thumbnail_sha256: mediaHash,
});
const manifestSchema = z.object({
  chainId: z.literal(NFT_CHAIN_ID),
  creator: address,
  collection: manifestEntry.extend({
    symbol: z.string().max(20),
    description: z.string().max(10000).optional(),
  }),
  tokens: z.record(
    z
      .string()
      .max(78)
      .regex(/^[1-9][0-9]*$/),
    manifestEntry,
  ),
});
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
async function boundedMedia(
  url: string,
  signal: AbortSignal,
  maxBytes: number,
  transport: Transport,
) {
  const response = await transport(url.replace(`${NFT_MEDIA_ORIGIN}/`, '/api/nft-media/'), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    credentials: 'omit',
    redirect: 'error',
  });
  if (!response.ok || !response.body) throw new Error('Collection artwork is unavailable.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Collection artwork exceeds the supported size.');
    }
    chunks.push(value);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  signal.throwIfAborted();
  return data.buffer;
}
export async function loadNftManifest(
  collection: NftCollection,
  signal: AbortSignal,
  transport: Transport = fetch,
) {
  const { metadataBaseURI: uri, metadataManifestHash: commitment } = collection;
  if (!uri || !commitment) throw new Error('Verified collection artwork is unavailable.');
  if (uri !== `${NFT_MEDIA_ORIGIN}/collections/${hash.parse(commitment).slice(2)}`)
    throw new Error('Invalid collection metadata origin.');
  const raw = await boundedMedia(`${uri}/manifest.json`, signal, 2_000_000, transport);
  if (`0x${await sha256Hex(raw)}` !== commitment)
    throw new Error('Collection metadata failed verification.');
  const manifest = manifestSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
  if (
    manifest.creator !== collection.creator ||
    Object.keys(manifest.tokens).length !== collection.supply ||
    Object.keys(manifest.tokens).some((id) => BigInt(id) > BigInt(collection.supply)) ||
    manifest.collection.name !== collection.name ||
    manifest.collection.symbol !== collection.symbol
  )
    throw new Error('Collection metadata does not match the contract.');
  return manifest;
}
export type NftManifest = Awaited<ReturnType<typeof loadNftManifest>>;
export async function loadNftImage(
  cover: NftManifest['collection'] | NftManifest['tokens'][string],
  signal: AbortSignal,
  transport: Transport = fetch,
) {
  const expectedUrl = `${NFT_MEDIA_ORIGIN}/objects/${cover.thumbnail_sha256}.webp`;
  if (cover.thumbnail !== expectedUrl) throw new Error('Invalid collection artwork commitment.');
  const image = await boundedMedia(expectedUrl, signal, 2_000_000, transport);
  if ((await sha256Hex(image)) !== cover.thumbnail_sha256)
    throw new Error('Collection artwork failed verification.');
  return {
    image: new Blob([image], { type: 'image/webp' }),
  };
}

export async function loadNftArtwork(
  collection: NftCollection,
  signal: AbortSignal,
  transport: Transport = fetch,
) {
  const manifest = await loadNftManifest(collection, signal, transport);
  return {
    ...(await loadNftImage(manifest.collection, signal, transport)),
    description: manifest.collection.description ?? '',
  };
}
export async function loadNftCollection(
  pool: string,
  signal: AbortSignal,
  transport: Transport = fetch,
) {
  const collection = (await loadNftCatalog(signal, 0, transport, address.parse(pool.toLowerCase())))
    .collections[0];
  if (!collection) throw new Error('Collection not found.');
  return collection;
}

/** Read issued identities, including gaps, from one canonical Ethereum block. */
export async function loadNftIssued(
  collection: NftCollection,
  signal: AbortSignal,
  transport: Transport = fetch,
) {
  address.parse(collection.pool);
  if (
    !Number.isSafeInteger(collection.supply) ||
    collection.supply < 1 ||
    collection.supply > 100_000
  )
    throw new Error('Unsupported NFT edition size.');
  const rpc = async (url: string, method: string, params: unknown[]) => {
    signal.throwIfAborted();
    const response = await transport(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      credentials: 'omit',
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Ethereum mint status is unavailable.');
    const body = z.object({ id: z.literal(1), result: z.unknown() }).parse(await response.json());
    return body.result;
  };
  let endpoint = '';
  for (const url of rpcEndpoints) {
    try {
      if ((await rpc(url, 'eth_chainId', [])) === '0x1') {
        endpoint = url;
        break;
      }
    } catch {
      signal.throwIfAborted();
    }
  }
  if (!endpoint) throw new Error('Ethereum mint status is unavailable.');
  const header = z.object({ number: z.string().regex(/^0x[0-9a-f]+$/i), hash });
  const block = header.parse(await rpc(endpoint, 'eth_getBlockByNumber', ['latest', false]));
  const tokenIds: string[] = [];
  // Bound concurrent reads for RPCs that limit batch sizes.
  for (let start = 1; start <= collection.supply; start += 1024) {
    const batches = await Promise.all(
      Array.from(
        { length: Math.min(4, Math.ceil((collection.supply - start + 1) / 256)) },
        async (_, index) => {
          const first = start + index * 256,
            size = Math.min(256, collection.supply - first + 1);
          const data =
            selector('issuedTokenIds(uint256,uint256)') +
            BigInt(first).toString(16).padStart(64, '0') +
            BigInt(size).toString(16).padStart(64, '0');
          const result = hex
            .max(130 + size * 64)
            .parse(await rpc(endpoint, 'eth_call', [{ to: collection.pool, data }, block.number]));
          const length = integer(word(result, 1));
          if (word(result, 0) !== 32n || length > size || result.length !== 130 + length * 64)
            throw new Error('Incomplete NFT mint status.');
          let previous = BigInt(first - 1);
          return Array.from({ length }, (_, i) => {
            const id = word(result, i + 2);
            if (id <= previous || id >= BigInt(first + size))
              throw new Error('Invalid NFT mint identity.');
            previous = id;
            return id.toString();
          });
        },
      ),
    );
    tokenIds.push(...batches.flat());
  }
  const canonical = header.parse(
    await rpc(endpoint, 'eth_getBlockByNumber', [block.number, false]),
  );
  signal.throwIfAborted();
  if (canonical.number !== block.number || canonical.hash !== block.hash)
    throw new Error('Ethereum changed while checking NFT identities. Retry mint status.');
  return { tokenIds, block: block.number, blockHash: block.hash };
}

export function createNftLaunchService(baseUrl: string, transport: Transport = fetch) {
  const client = createHttpClient(baseUrl, transport);
  return {
    async pool(pool: string, signal?: AbortSignal) {
      const result = await client.get(`/pool/${address.parse(pool)}`, nftPoolSchema, signal);
      if (result.pool !== pool) throw new Error('NFT status belongs to a different collection.');
      if (result.minted > result.supply || result.remaining > result.supply)
        throw new Error('Invalid NFT mint progress.');
      for (const rows of [result.mints, result.listings]) {
        if (
          new Set(rows.map((row) => row.tokenId)).size !== rows.length ||
          rows.some((row) => BigInt(row.tokenId) > BigInt(result.supply))
        )
          throw new Error('Invalid NFT item identities.');
      }
      return result;
    },
    async checkAllocation({
      pool,
      wallet,
      account,
      signal,
      onStage = () => {},
    }: {
      pool: string;
      wallet: WalletAdapter;
      account: string;
      signal: AbortSignal;
      onStage?: (stage: 'wallet' | 'proof' | 'checking') => void;
    }) {
      address.parse(pool);
      const evm = address.parse(account.toLowerCase());
      let expectedAddress: string | undefined;
      const current = async () => {
        signal.throwIfAborted();
        const session = await wallet.session();
        signal.throwIfAborted();
        if (session.accounts[0]?.toLowerCase() !== evm || session.chainId !== NFT_CHAIN_ID)
          throw new Error('Wallet account or network changed. Check allocation again.');
        if (!session.capabilities.methods.privacyOwnership || !wallet.provePrivacyOwnership)
          throw new Error('Reload the updated PLabs Wallet to enable ownership proofs.');
        if (
          expectedAddress &&
          (session.privacy?.address !== expectedAddress ||
            !session.privacy.scopes.includes('address') ||
            Number(session.privacy.chainId) !== NFT_CHAIN_ID)
        )
          throw new Error('Privacy wallet or access changed. Check allocation again.');
      };
      onStage('wallet');
      await current();
      const privacy = await wallet.privacyAddress();
      if (privacy.chainId !== NFT_CHAIN_ID)
        throw new Error('Switch your privacy wallet to Ethereum.');
      const raw = z
        .string()
        .regex(/^0x[0-9a-f]{86}$/)
        .parse((privacy.rawAddress ?? privacy.address).toLowerCase())
        .slice(2);
      expectedAddress = privacy.address;
      await current();
      const tag = keccakBytes(bytes(raw));
      const nonce = crypto.randomUUID();
      const expires = Date.now() + 5 * 60_000;
      const message = [
        'PrivaSea allowlist eligibility check only',
        `Chain ID: ${NFT_CHAIN_ID}`,
        `Market: ${NFT_MARKET}`,
        `Pool: ${pool}`,
        `Privacy wallet: ${tag}`,
        `Raw address: ${raw}`,
        `Nonce: ${nonce}`,
        `Expires: ${expires}`,
      ].join('\n');
      onStage('proof');
      const proof = ownershipProofSchema.parse(
        await wallet.provePrivacyOwnership?.(message, `0x${raw}`),
      );
      await current();
      if (Date.now() >= expires)
        throw new Error('The ownership proof expired. Check allocation again.');
      onStage('checking');
      const response = await client.post(
        '/whitelist/check',
        {
          pool,
          wallet: tag,
          authorization: { rawAddressHex: raw, nonce, expires, proof },
        },
        z.object({
          ok: z.literal(true),
          accessToken: z.string().min(1).max(16384),
          whitelist: nftAllocationSchema,
        }),
        signal,
      );
      await current();
      if (!response.whitelist.checked)
        throw new Error('The service did not verify this privacy wallet.');
      return response.whitelist;
    },
  };
}
