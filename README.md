# PLabs Network

**English** | [简体中文](README.zh-CN.md)

PLabs Network brings privacy asset management, PEX trading and on-chain activity into one place. Connect PLabs Wallet to manage your assets and approve transactions while keeping keys and proof generation in your wallet.

- **Assets** — Deposit, transfer and withdraw supported privacy assets.
- **PEX** — Explore markets and manage supported trading orders.
- **Activity** — View wallet activity and transaction status.
- **Explorer** — Browse public pool statistics and blockchain transactions.
- **JubJub auction** — Follow the live P20 auction, authenticate your privacy identity, bid or raise your total, resume a pending payment, and check settlement at `/privasea/jubjub`.

The auction page includes funded bidder counts, confirmed bid counts, seat demand, per-bidder averages, and 15-minute/hourly/all-time activity analysis. Public activity uses aggregate snapshot changes; bidder identities are not published. After sign-in, **My bid orders** shows each bid's total, additional payment, campaign status, and transaction links, with recovery for pending bids.

Run `pnpm dev` and open `http://127.0.0.1:5180/privasea/jubjub`. Payments use the wallet's generic `sponsoredPrivacyTransfers` capability with a `plabs-custody-v1` descriptor. Installed extensions with the earlier `jubjubBidding` capability remain compatible. Experimental privacy writes must be enabled in wallet settings. The wallet creates the private payment proof and retains its recovery record; the website never receives private note openings. Wallets with neither payment capability can still view the auction and authenticate.

Auction rules and the public memo prefix belong to the dApp. The generic wallet interface verifies the official service profile, authenticates the current wallet independently, and binds the approved asset, amount, recipient and intent. It currently supports the reviewed PLabs custody protocol on Monad; another campaign using that protocol does not need its own wallet RPC. New chains, proof formats or sponsor protocols may still need wallet support. The frontend bridges the generic RPC directly while the published SDK remains at 0.2.0. A rejected or uncertain generic submission is never retried through the legacy interface.

`VITE_JUBJUB_API` defaults to `/api/jubjub`. Development, Vercel rewrites, and the included Nginx configuration proxy this path to `https://app.plabs.online/nft-jubjub/v1`; the campaign's bearer authorization must be forwarded. See [JubJub protocol research](docs/jubjub-research.md) for the observed rules, endpoints, and verification limits.

[PLabs Wallet](https://github.com/1inxe/plabs-wallet) · [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk)
