# Native PrivaSea reconstruction

Observed with REA on 2026-10-27. Reference collection:
`0xd4adb555b62dd50eb74be7650129f5c7e010e83e` (Ethereum, Jubjub Bird).

## Evidence

- `capture_browser_scenario`: direct collection navigation, DOM/accessibility and network response bodies. Evidence `ev_60b737fb39a14d4f4945b7846bd1f721fefba2576a3553d44ac4fd67a23b5149`.
- `capture_browser_scenario`: Launch, Market, Create, Profile and Home navigation. Evidence `ev_04827f48f6bc42c6c36d5e015a341650eb0f407f0247b84b836489664c49f658`.
- `capture_browser_scenario`: Launch → collection by its title button, then collection accessibility tree. Evidence `ev_c53fe21e13ce1aacea89edc0faca7e53fde7bf2e1253f5297b48675e03824322`.
- `analyze_javascript_application`: captured `PrivaSeaPanel-BTW_t3k7.js`, 1 parsed JavaScript file, 2,779 visited AST nodes, 109 findings, no parse failures. Evidence `ev_28086957958c5c3f4de805939dc8c5982667ba11776048bcae4fe35baa97c38d`.
- Reviewed captured `CollectionPage-DY6vPKa_.js`, `catalog-B2j0qeBP.js` and `onchain-Braq_JOX.js` as inert source. Source inspection establishes intended behavior; it does not establish that a financial transaction succeeded.

## Observed behavior and local routes

| Surface       | Observation                                                                                                                                     | Local implementation                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home          | Featured art and launch entry                                                                                                                   | `/privasea`, verified live collection covers and launch/profile links                                                                                    |
| Launch        | Collection covers, issuance status, allocation check                                                                                            | `/privasea/launch`, existing native allocation/mint preserved                                                                                            |
| Collection    | Name/symbol, supply/minted/reserved, mint, numbered item grid and pagination                                                                    | `/privasea/collection/:pool`, direct chain lookup also works after a fresh reload; adds search/status filters and mint activity                          |
| Item          | Artwork, token number, minted status, private owner display, note commitment, transaction, pool and chain                                       | `/privasea/collection/:pool/:tokenId`; indexed mint hashes link to the block explorer                                                                    |
| Profile       | Private notes belonging to the wallet                                                                                                           | `/privasea/profile`, extension scan includes received NFTs and cross-site mints after explicit `nfts` consent; site mint requests remain a separate list |
| Whitelist     | Genesis qualification                                                                                                                           | `/privasea/whitelist`, existing ownership-proof check; `/p-sea` remains an alias                                                                         |
| JubJub        | Auction                                                                                                                                         | `/privasea/jubjub`, existing native auction; shared local navigation                                                                                     |
| Market/Create | Production `privasea-market` and `privasea-create` flags disabled. Original direct routes fall back to Launch; buttons do not open these flows. | Local collection discovery and explicit unavailable state for creation/trading. No invented transaction or external handoff.                             |

The original direct collection URL initially produced “Collection not found” without first visiting Launch. The local detail loader reads the requested deployed pool directly and does not depend on an in-memory catalog populated by another page.

## Data boundaries

- Chain: the fixed Ethereum market, one fixed block for collection reads, bounded edition size. Retired mainnet test drops are excluded from production launch cards.
- Mint identities: `issuedTokenIds` in bounded concurrent chunks at one fixed Ethereum block, followed by a canonical block-hash check. Token IDs are never inferred from the mint count.
- Public index: same-origin `/api/nft/pool/:pool`; preserves mint identities, hashes and listings, validates token bounds/duplicates. Missing entries in stale/incomplete snapshots are not presented as unminted. Indexed data is not represented as proof of current ownership.
- Artwork: chain-bound manifest SHA-256, matching creator/name/symbol/edition set, fixed media origin, image SHA-256; displayed with local Blob URLs. Shared manifest/image queries avoid refetching the manifest per grid item.
- Ownership: wallet-only scanning and spent-Note checks. SDK `getNftAssets` requires independent `nfts` consent, checks session again after asynchronous reads, and returns summaries without Note openings or keys. Account, network, privacy session or permission changes discard stale results.
- Navigation: no product links to `app.plabs.online`; official service URLs used as data endpoints are not browser navigation. Block explorer links remain available for transaction inspection.

## Validation

`tests/browser/nft-launch-regression.mjs` covers native navigation, collection/item reloads, pagination/back state, nonsequential mint identities, stale index state, mobile layout, explicit NFT consent, received assets, account changes, stale responses and the existing mint/resume cases. Synthetic wallet data is used for financial actions; no real mint, payment or deployment is submitted by these tests.
