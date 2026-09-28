# Product structure and terminology

The primary workspace has four entries: Assets, Trade, Activity and Explorer. NFT gallery is a read-only discovery page. Token launch is visibly unavailable. Labels describe existing actions instead of implying separate products that reuse the same form.

| Entry or action  | Meaning                                                  | Availability                                          |
| ---------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Assets           | One place to deposit, transfer privately and withdraw    | `/assets`                                             |
| Deposit          | Public token → privacy pool; also called shielding       | Wallet capability and supported pool required         |
| Private transfer | Private balance → recipient perc1 address                | Wallet capability and supported pool required         |
| Withdraw         | Private balance → public wallet; also called unshielding | Wallet capability and supported pool required         |
| Trade            | PEX spot order book                                      | Existing PEX wallet integration; no perpetuals claim  |
| Activity         | Wallet history and this site's session transactions      | Scoped wallet access                                  |
| Explorer         | Public pool statistics and transaction commitments       | Official public data                                  |
| NFT gallery      | Artwork previews and official campaign status            | Read only; registration and private holdings disabled |
| Token launch     | Token creation                                           | Disabled; no connection or approval prompt            |

`/shield` and `/pay` redirect to the corresponding Assets action. `/pefi` and `/privacyfi` redirect to Assets. Existing URLs remain valid, while the sidebar no longer presents these aliases as separate products. The selected action is reflected in `?mode=deposit|transfer|withdraw` and follows browser history.

PeFi was a product label without a distinct implemented financial service in this app. It is removed from navigation. “Confidential yield”, “vault deposits” and “Spot & Perps” are not used to describe the current capabilities. This does not rename the on-chain protocol, pools, assets or SDK methods.

Public and private holdings remain separate. USDC in the public wallet and sUSDC in a privacy pool are not duplicate balances and must not be merged by symbol. A perc1 privacy address is distinct from the wallet's public EVM address. Private notes represent units of a private balance, not additional assets. Deposits and withdrawals remain visible on the public chain.

The wallet drawer is 420 px on desktop and viewport-width on mobile. It shows two compact address rows, with full-address expansion and complete-value copy actions. Deposit/transfer/withdraw shortcuts respect the connected wallet's network capabilities. Public and private asset lists share one compact view; transaction history has its own Activity tab. Private note details are collapsed under Advanced. Connection permissions and disconnect are in the footer settings menu.

Unavailable actions use native disabled controls with explanatory text, not a connect-first flow that ends at an unavailable operation. Display availability never grants transaction authority: the wallet retains its existing approval and validation requirements.
