# PLabs Network

**English** | [简体中文](README.zh-CN.md)

PLabs Network brings privacy asset management, PEX trading and on-chain activity into one place. Connect PLabs Wallet to manage your assets and approve transactions while keeping keys and proof generation in your wallet.

- **Assets** — Deposit, transfer and withdraw supported privacy assets.
- **PEX** — Explore markets and manage supported trading orders.
- **Activity** — View wallet activity and transaction status.
- **Explorer** — Browse public pool statistics and blockchain transactions.
- **NFT Launch** — Browse Ethereum NFT drops, inspect live mint progress and verified artwork, and check your privacy wallet’s allocation at `/privasea/launch`. Supported free mints run directly through the updated PLabs Wallet; collection creation, the NFT market, and the official NFT profile remain external links.
- **JubJub auction** — Follow the live P20 auction, authenticate your privacy identity, bid or raise your total, resume a pending payment, and check settlement at `/privasea/jubjub`.

NFT allocation checks use a check-only privacy ownership proof from PLabs Wallet. Free minting uses the updated wallet’s `nftMinting` capability: the extension independently verifies the Ethereum collection, reserves one edition using a distinct mint authorization, generates its private proof, and asks for final ETH gas approval. The site only receives public mint status and can resume the original request after reload. The extension also provides a separate private NFT holdings section with local chain synchronization. Paid mints and auctions retain explicit official-page links. The auction’s sponsored P20 transfer remains a separate protocol. Existing extensions without NFT support show update/reload guidance. This app uses the typed NFT, ownership-proof and sponsored-payment methods from `plabs-js-sdk@0.3.0`.

`VITE_NFT_API` defaults to `/api/nft`. Development, preview, Vercel, and Nginx expose only `GET pool/<address>` and `POST whitelist/check` from the fixed official NFT intake service. Artwork is fetched through `/api/nft-media`, checked against the on-chain manifest hash, and verified again against the image digest. The catalog reads the reviewed Ethereum market through public Ethereum RPC; no EVM write RPC is sent. See [NFT Launch integration notes](docs/nft-launch-research.md) for deployment details and verification limits.

The auction page includes funded bidder counts, confirmed bid counts, seat demand, per-bidder averages, and 15-minute/hourly/all-time activity analysis. Public activity uses aggregate snapshot changes; bidder identities are not published. After sign-in, **My bid orders** shows each bid's total, additional payment, campaign status, and transaction links, with recovery for pending bids.

**First-bid distribution** groups inferred initial payments into seven P20 bands: 100–<500, 500–<1,000, 1,000–<5,000, 5,000–<10,000, 10,000–<50,000, 50,000–100,000, and >100,000. It shows participant counts, shares, initial amounts, and unclassified positions. Public history does not identify who made each later increase, so this is explicitly not a distribution of current total bids.

Run `pnpm dev` and open `http://127.0.0.1:5180/privasea/jubjub`. Payments use the wallet's generic `sponsoredPrivacyTransfers` capability with a `plabs-custody-v1` descriptor. Installed extensions with the earlier `jubjubBidding` capability remain compatible. Experimental privacy writes must be enabled in wallet settings. The wallet creates the private payment proof and retains its recovery record; the website never receives private note openings. Wallets with neither payment capability can still view the auction and authenticate.

Auction rules and the public memo prefix belong to the dApp. The generic wallet interface verifies the official service profile, authenticates the current wallet independently, and binds the approved asset, amount, recipient and intent. It currently supports the reviewed PLabs custody protocol on Monad; another campaign using that protocol does not need its own wallet RPC. New chains, proof formats or sponsor protocols may still need wallet support. The frontend uses the published SDK 0.3.0 generic sponsored-transfer API. A rejected or uncertain generic submission is never retried through the legacy interface.

`VITE_JUBJUB_API` defaults to `/api/jubjub`. Vite development/preview and the Vercel function use the shared server handler in `server/jubjub-proxy.mjs`. The Vercel rewrite routes to `/api/jubjub-proxy?route=…`, whose handler fixes the upstream to `https://app.plabs.online/nft-jubjub/v1`. Browser requests must match this site's Host and protocol; cross-site origins are rejected. The server forwards the campaign Bearer token and JSON body but strips Origin, Referer, cookies, and forwarding headers. It does not pretend the browser originated from the official PLabs domain. This avoids the upstream's `origin is not allowed` rejection while retaining a same-origin boundary at our own server.

Only `GET config/summary/history/me` and `POST auth/challenge/auth/session/bids/prepare/refund` are accepted. Request bodies are bounded to 16 KiB, history accepts only a numeric `after` cursor, redirects are disabled, and responses are `no-store`. Upstream JSON errors retain their HTTP status and message. Proof funding stays in the extension and is not exposed through this proxy. Vercel's trusted protocol header is used only in the Vercel runtime; ordinary local Node servers use their socket protocol.

The included Nginx configuration applies the same endpoint, content-type, size, header, and origin restrictions. Its `geo`/`map` declarations belong in the `http` context (the supplied `conf.d` include location). When TLS terminates at a load balancer, add only that balancer's source IP/CIDR to `jubjub_trusted_proxy` and have it replace `X-Forwarded-Proto`. Otherwise Nginx deliberately uses its own socket scheme rather than trusting arbitrary forwarded headers. Do not trust all client addresses.

`node --test tests/jubjub-proxy.test.mjs` exercises real local HTTP requests against a mock upstream, including browser origins, authorization, route/query restrictions, body limits, timeouts and error propagation. Browser fixture servers set `server.proxy: {}`; that explicit empty map disables the server proxy plugin so their synthetic requests remain offline. Preview fixtures can likewise set `preview.proxy: {}`. See [JubJub protocol research](docs/jubjub-research.md) for the observed rules and verification limits.

[PLabs Wallet](https://github.com/1inxe/plabs-wallet) · [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk)
