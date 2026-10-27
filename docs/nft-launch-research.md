# PrivaSea NFT Launch integration

Reviewed on 2026-10-27 (Asia/Shanghai) against <https://app.plabs.online/privasea/launch>.

## Observed deployment

The production interface and shipped `LaunchPage`, `LaunchCard`, `chainLaunches`,
`catalog`, `onchain`, and `MintProgressModal` modules were inspected. These are
observations of the deployed application, not a versioned API specification.

- Chain: Ethereum mainnet, chain ID `1`.
- Market: `0x48269ee92a420fb1ba3db94a1593c233fa33068e`.
- Factory: `0x7c573e4a37ae1cd826678df732508aa6619e3196`.
- Intake service: `https://app.plabs.online/nft-intake/v1`.
- Media origin: `https://media.plabs.online`.
- The live catalog contained **Jubjub Bird Test** (`JUBTEST`), pool
  `0x9b8567c7a5ea98db6330be5945e8d14abba25758`, with 2 of 5 editions minted.
  This is an observed mainnet collection named “Test”, not a testnet deployment
  or a value to hardcode into the application.

The existing JubJub P20 auction remains a separate campaign on Monad. Its
payment pool, identity session, and sponsored transfer cannot mint these NFTs.

## Implemented behavior

`/privasea/launch` reads `poolCount()`, `pools(uint256)` and `launches(address)`
from the reviewed market, then reads each pool's name, symbol and immutable
metadata commitment. Reads within each catalog request use one Ethereum block.
The page displays 12 collections per page and searches the current page. No
wallet connection is needed for public reads. Ethereum RPC endpoints were
selected from the official registry's current mainnet listing; both are fixed
HTTPS endpoints, with chain ID verification before reading the catalog.

`GET /pool/<pool>` supplies live mint progress. The public response observed:
`pool`, `creator`, `supply`, `minted`, `reserved`, `remaining`, `soldOut`,
`primaryOpen`, `registered`, `asOf`, `snapshotBlock`, `snapshotBlockHash`,
`revision`, `stale`, `joined`, `bidCount`, `average`, `listings`, `mints`, and
`whitelist`. `asOf` is Unix milliseconds. The page refreshes every ten seconds,
distinguishes minted out from fully reserved, and retains the last known values
with an explicit warning if refresh fails. Catalog refreshes every minute.

Metadata must be under the fixed media origin's `/collections/<hash>` path and
match the on-chain SHA-256 commitment byte for byte. Chain, creator, collection
name, symbol and token count must match the contract. Cover thumbnails must use
the content-addressed `/objects/<sha256>.webp` path; their bytes are verified
before a blob URL is rendered. Blob URLs are revoked when their view unmounts.
Media is fetched through the same-origin `/api/nft-media` proxy because the
official media service permits CORS only for approved production origins.

## Allocation proof

The official shipped client obtains its privacy-wallet tag as Keccak-256 of the
43 raw privacy-address bytes. It constructs this exact check-only message:

```text
PrivaSea allowlist eligibility check only
Chain ID: 1
Market: <lowercase market address>
Pool: <lowercase collection pool>
Privacy wallet: <0x-prefixed Keccak tag>
Raw address: <86 lowercase hex characters, without 0x>
Nonce: <new UUID>
Expires: <Unix milliseconds, five minutes from creation>
```

PLabs Wallet's existing `plabs_provePrivacyOwnership` returns the public
`bjj-schnorr-v1` proof without exporting viewing keys or note openings.
`POST /whitelist/check` sends:

```text
{ pool, wallet: tag,
  authorization: { rawAddressHex, nonce, expires, proof } }
```

The shipped official client consumes `{ok, accessToken, whitelist}`;
`whitelist` contains `enabled`, `connected`, `checked`, `eligible`, `allowance`,
`minted`, `reserved`, `remaining`. This authenticated response shape was inferred
from shipped client code and tested with synthetic fixtures, not observed with
a real wallet. No real ownership proof was signed during development.

Our query rechecks account, Ethereum chain and authorized privacy address around
every asynchronous step. A rejected proof, expired proof, aborted request or
changed identity cannot display an allocation result. The result is local to
the current component/session, becomes visibly stale after a minute, and is
cleared on identity, network, access or adapter changes. The returned access
token is discarded. No personal-sign login is required for this check.

## Minting and other official flows

The official mint path reserves an edition, optionally obtains a distinct
allowlisted **mint** authorization, generates an NFT proof, persists private
recovery material, obtains a permit and requests an EVM transaction. It also
supports recovering jobs and indexing the resulting private NFT note. These
steps require an NFT proof/recovery interface that the current local extension
and published SDK do not provide.

This implementation therefore labels the action **Mint on PLabs** or **Bid on
PLabs**, linking to `/privasea/collection/<pool>` on the official origin. It
also provides explicit external links to the official collection creation,
market and profile pages. The site does not call a nonexistent wallet method,
export wallet seeds, reserve editions during an eligibility check, or treat a
check-only proof as permission to mint. An allocation checked here can only
apply there when the user continues with the same underlying privacy wallet;
connecting the same EVM address alone does not establish this.

## Deployment and verification

Vite development/preview and the Vercel function use the existing bounded JSON
proxy with an NFT protocol profile. The profile allows only `GET pool/<pool>`
and `POST whitelist/check`, rejects arbitrary queries and cross-site origins,
and fixes the upstream to the official intake service. Origin, Referer, cookies
and forwarding headers are stripped; redirects are rejected and JSON responses
are `no-store`. The Docker/Nginx configuration exposes the same routes and
permits the two public RPC origins and blob artwork in its CSP.

- `node --test tests/nft-launch.test.mjs tests/nft-proxy.test.mjs` checks contract
  decoding, deployment/chain scope, proof binding, rejected/stale approvals,
  metadata/image verification and actual local HTTP proxy boundaries.
- `node tests/browser/nft-launch-regression.mjs` starts an isolated local Vite
  server and fresh headless browser with synthetic wallet responses. It checks
  allocation, details, search, unlock continuation, account changes, approval
  rejection, Ethereum switching, failed status recovery and sold-out updates.
  All external RPC URLs are intercepted with synthetic replies; unexpected
  external requests are blocked. No production proof, reservation or transaction
  is submitted. Desktop/mobile screenshots go to the temporary
  `plabs-nft-browser` directory, or `NFT_ARTIFACT_DIR` when set.
- Read-only live checks confirmed that the deployed catalog, intake response,
  verified artwork and layouts render on desktop and at 390 px without overflow.

Real wallet ownership verification, native NFT minting, private NFT recovery,
collection creation and secondary-market transactions were not exercised.
