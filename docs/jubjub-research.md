# JubJub implementation notes

Research date: 2026-10-19 (Asia/Shanghai). Official page: <https://app.plabs.online/privasea/jubjub>.

## Evidence and scope

The parent task inspected the live interface with REA and confirmed the P20 auction and 1,623 slots. Public `config`, `summary`, and `history` responses and the official shipped `AuctionPage`, `client`, `onchain`, and entry-point JavaScript were inspected. These are observations of the current production deployment, not a published versioned API specification.

No real wallet was connected or signed in for this research, and no bid, transfer, refund, or other funds transaction was executed. Protected response schemas below are the fields consumed by the official client; they are not authenticated live-response captures. Unknown server fields must not be invented or treated as verified.

## How this campaign works

- This is a privacy auction for JubJub qualification. The deployed rules contain `auctionOnly: true` and no collection or claim window. Do not show an implemented NFT mint or claim action.
- Payment is native private P20 on Monad mainnet, chain ID `143`, with six decimals.
- There are **1,623 auction seats**. Read `rules.auctionSeats`; the older `1665` constant in the client is a fallback/demo value.
- Reserve is **100 P20**. A new total must be a multiple of **50 P20** and exceed the confirmed total by at least 50 P20. Enter the desired **new total**, not the extra contribution. Increasing a confirmed 100 P20 bid to 150 P20 pays an additional 50 P20.
- Settlement is `pay-as-bid`: a winning bidder pays their own final winning bid. Do not describe this as clearing-price settlement.
- Start: **2026-10-19 20:00:00 Asia/Shanghai** (`1792411200`). End: **2026-10-21 20:00:00 Asia/Shanghai** (`1792584000`). Use live configuration and server time for countdowns.
- Funds go to the official privacy receiving address and are held for settlement. Gas is sponsored; published campaign fees are zero. Do not send a separate ordinary payment or pay a separate bid gas quote.
- Each increase needs **one confirmed, spendable P20 note** covering the entire difference. A sufficient aggregate balance split among smaller notes is insufficient until the user consolidates or receives a large enough note.
- The qualifying price is the bid at the last qualifying seat; it remains the reserve while the list is not full. The client shows average, highest, qualifying, and personal bid history. It does not establish a public tie-breaking rule or a guaranteed winning bid threshold.
- Display the server-provided average, not `committedUnits / positions`. An observed live sample had 115 positions, 161,600 P20 committed and an average of 192.483056 P20, which equals `(161600 + (1623 - 115) × 100) / 1623`, rounded down to base units. The shipped simulator also averages qualifying seats with vacant seats filled at the reserve; this formula is inferred for production from matching evidence, not verified server code.
- Eligibility is final only when `/me.qualification.final` is true. The client displays Confirming before then.
- Ending the auction does not by itself release funds. Custodial refund timing is controlled by `refundsReleased` and `settled`; a winning bid may be charged in full with no refund.
- `maxContributions` is 64. `maxPositions` is 1623, but the live override `participationLimit` is null. Do not mistake seat count for a hard current registration cap.

## Reviewed production configuration

```json
{
  "apiBase": "/nft-jubjub/v1",
  "campaignId": "jubjub-p20-mainnet-20261019",
  "rulesHash": "0xe3409160d1f4baf260a9e0d60358b23acaf6da10d3815af2c9996154d53fd0f9",
  "chainId": 143,
  "paymentPool": "0x59df8637654d1ecb090ab7881b703b5a856d2780",
  "market": "0x59df8637654d1ecb090ab7881b703b5a856d2780",
  "indexerUrl": "https://monad-indexer.plabs.online",
  "recipientRaw": "4449ad291565b82847b77c7d1358898a4094cacef26e518867d1485ef4f8b6656e64b12827bbaa7d357a0d",
  "reserveUnits": "100000000",
  "bidStepUnits": "50000000",
  "confirmations": 12,
  "feePolicy": { "fixedUnits": "0", "marginBps": 0, "priceMode": "sponsored" }
}
```

Verify `rulesHash` as Keccak-256 of UTF-8 canonical JSON of the entire `rules` object. Canonical JSON recursively sorts object keys with `localeCompare`, preserves array order, and rejects undefined values. A hash establishes integrity against the published commitment; the wallet also needs to enforce the reviewed chain, pool, recipient, asset, and sponsored-payment policy. Public responses may change during the campaign; invalidate cached auth/display state when `rulesHash` changes.

## Public API

Distribution audit (2026-10-20): the shipped client still exposes only `/config`, `/summary`, and `/history` as public auction data. Neither summary nor history contains individual position IDs or current per-position bid totals. First-entry payments can be estimated from consecutive snapshots with exactly one added funded position and a valid positive change in committed P20. Grouped additions, missing snapshots, and inconsistent amounts remain unclassified. Later top-ups are excluded from participant counts and never move a historical first bid to another band. Negative adjustments make the distribution unavailable because affected identities cannot be identified.

Even a complete public history cannot determine the current distribution uniquely. For example, initial bids `[100, 400, 500, 1000]` followed by an anonymous 100 P20 increase can become `[100, 500, 500, 1000]` or `[100, 400, 600, 1000]`. Both produce the same public total, count, highest bid and qualifying minimum, but different counts below 500 P20. The UI therefore labels these bands **First-bid distribution**, explicitly describes inference from public snapshots, and shows the source snapshot time and classification coverage.

All paths below are relative to `/nft-jubjub/v1` on the official application origin. Requests use JSON, a 60-second client timeout, and `Authorization: Bearer <token>` only for authenticated operations. A 401 invalidates the cached campaign session. Server errors use `{ "error": "..." }`.

| Request                       | Consumed response                                                                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /config`                 | `{rules, rulesHash, apiBase, indexerUrl, participationLimit, testnet, nativeSymbol, feeSymbol, collectorRaw, secondaryEnabled, feePolicy, spendChecks}`                                                                                                                                                         |
| `GET /summary`                | `{phase, serverTime, refundOpen, committedUnits, positions, bidTransactions, snapshotHash, mergedRoot, campaignId, rulesHash, bidAttempts, participationLimit, registeredPositions, bidPaused, averageBidUnits, highestBidUnits, qualifyingBidUnits, stage, auctionSeats, qualificationCount, whitelistFrozen}` |
| `GET /history?after=<cursor>` | `{campaignId, rulesHash, rows, cursor, more}`                                                                                                                                                                                                                                                                   |

`serverTime`, `rows[].at`, and configured times are Unix seconds. Monetary fields ending in `Units` are integer decimal strings. History rows observed live: `{at, sequence, committedUnits, positions, averageBidUnits, averageVersion, highestBidUnits, qualifyingBidUnits}`. Continue fetching while `more` is true; never use row timestamps in place of the returned cursor. The official page refreshes roughly once per second and fetches up to 32 history pages on initialization.

## Authentication

Implementation update (2026-10-20): the application now prefers `plabs_sendSponsoredPrivacyTransaction` with a typed `plabs-custody-v1` payment descriptor. Auction constants stay in the application. The wallet's common transfer engine supports reviewed Monad privacy pools and approved PLabs campaign namespaces, independently verifies the current identity and exact intent, generates the memo using the authenticated intent psi, and preserves the encrypted proof for retries. The older `plabs_fundJubjubBid` method is a compatibility adapter into that same engine and journal. The generic interface is protocol-specific, not a promise that arbitrary sponsor backends or proof formats will work. The SDK source exports the generic method; no npm release is required by the site's provider bridge.

1. `POST /auth/challenge` with `{evm, raw}`. `evm` is the lowercase 20-byte EVM address with `0x`; `raw` is the lowercase 43-byte privacy address (86 hexadecimal characters), without `0x`.
2. Response is `{id, message}`. Sign the exact UTF-8 message with EVM `personal_sign` (official EIP-1193 params are `[utf8MessageHex, evm]`).
3. Separately call the local prover ownership signing method with `{bn254IvkHex, rawAddressHex: raw, message}`. The current extension provides `plabs_provePrivacyOwnership`; privacy keys stay inside the extension. The public proof is `{version: "bjj-schnorr-v1", r_x_hex, r_y_hex, s_hex}`.
4. `POST /auth/session` with `{id, signature, proof}`. The official client consumes `{token, expires}` with numeric `expires` in Unix seconds.
5. The official client caches the session in memory bound to API scope, EVM address, raw privacy address, wallet identity, and rules hash. It reauthenticates when fewer than 60 seconds remain. A wallet change must invalidate the session.

A campaign bearer token must not be treated as a generic PLabs platform token. The exact production `/me.owner` format has not been observed and must not be guessed when binding funds to a wallet. The extension integration therefore treats the site-supplied token only as a preview: after explicit wallet approval, it independently obtains a fresh official challenge, signs with the current EVM wallet and privacy keys, creates its own session, and requires that the approved intent exist unchanged in that session before preparing any payment.

## Authenticated account schema

`GET /me` consumes at least:

```ts
{
  position?: { version: number };
  intents: Array<{
    id: string;
    status: string; // "prepared" and "funded" are consumed by the client
    total: string;
    delta: string;
    version: number;
    psi: string;
    createdAt: number;
  }>;
  jobs: Array<{
    id: string;
    purpose: string; // "bid" or "refund" in this screen
    intentId?: string;
    callHash?: string;
    txHash?: string;
    status: string; // "reverted" and "confirmed" are handled explicitly
    error?: string;
    inputCmx?: string;
    contributionCmx?: string;
    units?: string;
  }>;
  summary: CampaignSummary;
  qualification?: { rank: number | null; eligible: boolean | null; final: boolean };
  custody?: { settled: boolean; expectedRefundUnits: string; refundedUnits: string };
}
```

The simulated object also declares `owner` and `credits`; their live formats are not established by the client. Do not infer additional required fields from the simulator. The confirmed personal bid is the `total` of the funded intent with highest version, never a merely prepared intent or unconfirmed transaction.

## Prepare, prove, fund, and resume

1. Load `/me`. Prefer an existing intent with `status === "prepared"` and its original total. Do not create a second payment while a prepared or broadcast action exists.
2. For a new intent, `POST /bids/prepare` with `{id, total, version}`: `id` is a random 32-byte hex identifier (the official client hashes 32 random bytes); `total` is the new total in base units; `version` is `me.position?.version ?? 0`.
3. Response is the intent object including `{id, total, delta, version, psi, createdAt}`. Before making the proof, the official client repeats `/bids/prepare` with `{id: intent.id, total: intent.total, version: intent.version}` to validate/resume that intent.
4. Select one confirmed, unspent note with value at least `delta`. Build a normal private transfer proof with the campaign chain/pool, current confirmed root, valid Merkle paths, and the following output:

```ts
transfer_output: {
  value_sats: Number(intent.delta), // reject outside safe integer range
  recipient_raw_address_hex: rules.custody.recipientRaw,
  memo_hex: "0x5045524332302d4a55424a55422d5032302d763100" + word32BE(intent.psi)
}
```

The memo prefix is fixed. Unlike the noncustodial campaign, do **not** set `psi_new_hex` to the intent psi. The intent psi is embedded in this memo, and the generated funding note has its own psi.

5. Validate `proof.funding_notes[0]`: it must contain `rho_hex`, `psi_hex`, and `rcm_hex`; its value must equal `delta`; and its recipient must equal the reviewed receiver. Preserve the original proof and note reservation in encrypted wallet state **before** making an external submission.
6. `POST /bids/fund` with the following body. There is no fee quote for the live P20 custody branch:

```ts
{
  intentId: intent.id,
  material: { note: opening(proof.funding_notes[0]) },
  envelope: {
    bundle: jsonSafeProofBundle(proof.bundle),
    outputs: [
      opening(proof.funding_notes[0]),
      // include opening(proof.output_note) when a change note exists
    ]
  }
}
```

`opening(note)` is exactly:

```ts
{
  cmx_hex: "0x" + strip0x(note.cmx_hex).toLowerCase(),
  value: String(note.value_sats),
  rho_hex: "0x" + reverseBytes(strip0x(note.rho_hex).padStart(64, "0")),
  psi_hex: "0x" + reverseBytes(strip0x(note.psi_hex).padStart(64, "0")),
  rcm_hex: "0x" + reverseBytes(strip0x(note.rcm_hex).padStart(64, "0")),
  address_raw_hex: strip0x(note.recipient_raw_address_hex).toLowerCase()
}
```

Only rho/psi/rcm are byte-reversed; the commitment and recipient are not. `material.view` is absent in this custody branch. The bundle is the raw prover bundle, not ABI calldata: preserve actions, byte arrays and `binding_proof_bn254`. The official serialization recursively converts Map to object and safely converts BigInt to number, rejecting values outside the safe-integer range.

7. `/bids/fund` returns the **job directly**, not `{job}`. If it already contains `txHash`, reuse it. If `status === "reverted"` and there is no hash, surface its error. Otherwise poll `/me.jobs` by the original job ID every three seconds, for up to 180 seconds. On timeout, preserve the exact proof and intent and tell the user to resume.
8. Wait for the matching transaction receipt with **12 confirmations** on the configured chain. A failed receipt is not success. Then poll `/me` until the same intent is `funded`; the official client allows another 60 three-second attempts. A confirmed job can still contain a campaign acceptance `error`.
9. Refresh public/account state and display the confirmed total only after campaign acceptance. Resuming must reuse the same saved proof/job, including after a lost HTTP response or app reload.

`transact({kind:"send"})` followed by a transaction hash cannot implement this contract: ordinary transfers lack the committed campaign memo and required single-note selection, and public indexing cannot recover private note openings. `/bids/fund` itself provides the sponsor and broadcasts the prepared proof. Do not send an ordinary transfer first and try to register it afterward.

## Settlement and refund

After the auction, `POST /refund` with `{}`. For this custody campaign, the response consumed is:

```ts
{
  refundsReleased: boolean;
  settled: boolean;
  refundableUnits: string;
  refundedUnits: string;
  chargedUnits: string;
}
```

Display these states accurately:

- `!refundsReleased`: funds remain at the official receiver and refund timing is pending.
- `refundsReleased && !settled`: settlement is still being confirmed.
- `settled && refundableUnits > 0`: return to the privacy wallet is queued, with sponsored gas.
- `settled && refundedUnits > 0`: returned amount is reported.
- Otherwise: `chargedUnits` is the final winning payment.

The official refunded indicator requires `custody.settled`, positive `expectedRefundUnits`, and equality of `refundedUnits` and `expectedRefundUnits`. Do not promise an immediate full refund for all bidders. There is no implemented collection claim endpoint in this deployed auction-only page.

## Still unconfirmed

- Authenticated response examples, `/me.owner` identity encoding, and undocumented server-side rejection codes.
- Tie breaking, all qualification/final-roster server rules, and the precise timing of refund release.
- Successful proof acceptance, sponsored transaction confirmation, and actual refund delivery using the newly integrated wallet path; these require an authorized real wallet interaction and were not exercised during research.
