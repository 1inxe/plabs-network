# PLabs Network

**English** | [简体中文](README.zh-CN.md)

PLabs Network brings privacy asset management, PEX trading and on-chain activity into one place. Connect PLabs Wallet to manage your assets and approve transactions while keeping keys and proof generation in your wallet.

- **Assets** — Deposit, transfer and withdraw supported privacy assets.
- **PEX** — Explore markets and manage supported trading orders.
- **Activity** — View wallet activity and transaction status.
- **Explorer** — Browse public pool statistics and blockchain transactions.
- **JubJub auction** — Follow the live P20 auction, authenticate your privacy identity, bid or raise your total, resume a pending payment, and check settlement at `/privasea/jubjub`.

Run `pnpm dev` and open `http://127.0.0.1:5180/privasea/jubjub`. Bidding requires the updated PLabs Wallet extension with `jubjubBidding` support and experimental privacy writes enabled in the wallet settings. The wallet creates the private payment proof and retains its recovery record; the website never receives private note openings. An older extension can still view the auction and authenticate, but cannot fund bids.

`VITE_JUBJUB_API` defaults to `/api/jubjub`. Development, Vercel rewrites, and the included Nginx configuration proxy this path to `https://app.plabs.online/nft-jubjub/v1`; the campaign's bearer authorization must be forwarded. See [JubJub protocol research](docs/jubjub-research.md) for the observed rules, endpoints, and verification limits.

[PLabs Wallet](https://github.com/1inxe/plabs-wallet) · [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk)
