# PLabs Network

**English** | [简体中文](README.zh-CN.md)

PLabs Network is a web app for private asset transfers, PEX trading, wallet activity and public blockchain data. It connects to [PLabs Wallet](https://github.com/1inxe/plabs-wallet) through the [JavaScript SDK](https://github.com/1inxe/plabs-js-sdk). The wallet manages keys, generates proofs and confirms transactions.

## Run locally

Install Node.js 22.12+ and pnpm 9.15.4, then run:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:5180>. Public market and explorer data work without a wallet. Development API requests use the proxies configured in `vite.config.ts`; no environment file is required for the defaults.

## Connect and use

1. Install PLabs Wallet in the same browser, create or import an account, and unlock it.
2. Click **Connect** in the app and approve the requested access in the wallet.
3. Open **Assets** to deposit into a privacy pool, send a private transfer or withdraw to a public address. Select a supported network and asset, enter the amount and recipient where needed, then review and approve in the wallet.
4. Open **Trade** to view PEX markets and place supported orders. Order controls also provide status checks, cancellation and filled-asset synchronization through the wallet.
5. Open **Activity** for wallet history and current-session records, or **Explorer** for public pool statistics and transaction lookup.

Available actions depend on the connected wallet, network and pool. Public and private balances are shown separately. A pending or timed-out transaction may still be processing; check its status before retrying. Legacy imported PEX order references are read-only and cannot recover funds from the original web wallet.

The NFT gallery displays artwork and campaign information; registration and private holdings are unavailable. Token creation is also unavailable.

## API configuration

To override the defaults, copy `.env.example` to `.env.local` and edit the required values:

| Variable            | Default         | Data                              |
| ------------------- | --------------- | --------------------------------- |
| `VITE_MARKET_API`   | `/api/market`   | PEX markets and order books       |
| `VITE_MONAD_API`    | `/api/monad`    | Monad public indexer              |
| `VITE_ETHEREUM_API` | `/api/ethereum` | Ethereum public indexer           |
| `VITE_PLATFORM_API` | `/api/platform` | Platform and campaign information |

Values must be same-origin paths or HTTPS URLs. Restart the dev server after changes. These values are embedded at build time and must not contain secrets. When changing production endpoints, update the matching deployment proxy rules as well.

## Build and deploy

```sh
pnpm build
pnpm preview
```

The production output is `dist/`. Preview serves it locally at <http://127.0.0.1:5180>.

For **Vercel**, import this repository with its root as the project directory. `vercel.json` supplies the build command, output directory, API rewrites and SPA fallback.

For **Docker / Nginx**:

```sh
docker build -t plabs-network .
docker run --rm -p 8080:8080 plabs-network
```

Open <http://localhost:8080>. For public deployment, place it behind HTTPS. `deploy/nginx.conf` provides SPA routing, read-only API proxies and static caching; `deploy/security-headers.conf` provides response security headers. If deploying on the current market upstream domain, point the market proxy at the actual Matcher service to avoid a proxy loop.

Other static hosts need equivalent API proxy rules and an `index.html` fallback for application routes. Vite's proxy configuration is not part of `dist/`.

## Development

Built with React, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query and Lightweight Charts.

```text
src/app/       Routes, providers and application shell
src/features/  Assets, trading, wallet, activity and explorer views
src/services/  Public API clients and wallet SDK adapter
src/shared/    UI components, styles, configuration and utilities
public/        Application images and branding
vendor/        Packaged JavaScript SDK dependency
```

```sh
pnpm check       # Lint, formatting and production build with type checking
pnpm format      # Format source and documentation
```

SDK updates are described in [vendor/README.md](vendor/README.md). Image and font credits are listed in [asset sources](docs/asset-sources.md).

Update the English and Chinese READMEs together when changing documentation.

## License

This repository does not yet declare a repository-wide open-source license. Dependencies retain their own licenses; the SDK's MIT license does not automatically license this application. See the [licensing guide](LICENSING.md) for options and adoption steps.
