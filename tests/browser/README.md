# Whitelist browser regression

Run `node tests/browser/qualification-fixture.mjs` from the repository root, then open
`http://127.0.0.1:5181/p-sea`. This separate server injects a synthetic wallet and
responds to API requests locally. The banner identifies the fixture; no real wallet
is used, no signatures are produced, and no requests reach the production API.

Verify each entry independently:

1. Click the hero's **Check whitelist** button. The result must appear directly under the NFT image, without a dialog.
2. Select **The collection**, and click **Check your eligibility** at the
   bottom. It must switch to Genesis and show the inline result, not merely scroll.
3. Click **Check again** in the card. It must query again.
4. Open `/p-sea?locked`, then click **Unlock and check whitelist** once. After the
   mock privacy authorization, the query must continue without a second click.
5. Open `/p-sea?reject` and click **Check whitelist**. The rejected signature must
   appear as an error and no qualification check should be sent.

The browser console records `FIXTURE RPC personal_sign` followed by
`FIXTURE RPC plabs_provePrivacyOwnership`. The terminal records these POSTs in order:

- `/api/platform/auth/challenge`
- `/api/platform/auth/login`
- `/api/platform/privasea/whitelist/qualification/challenge`
- `/api/platform/privasea/whitelist/qualification/check`

The initial capabilities response deliberately omits ownership support to exercise
refreshing an old discovery snapshot. Rewards and identity are synthetic test data.

# JubJub browser regression

Run the complete browser regression from the repository root:

```sh
node tests/browser/jubjub-regression.mjs
```

The runner starts and closes its own local fixture server and a fresh headless
Chromium profile. It uses an existing `playwright-core` installation (including
the local REA installation at `~/Workspace/ai/rea/node_modules/playwright-core`)
and an installed Chrome/Chromium browser. It does not install dependencies. On
another machine, point `JUBJUB_PLAYWRIGHT_PATH` to the existing module entry file
and `JUBJUB_BROWSER_PATH` to the browser executable. `JUBJUB_ARTIFACT_DIR` can set
the screenshot output directory; the default is `plabs-jubjub-browser` inside the
system temporary directory.

The eighteen cases cover real page interactions with synthetic responses:

1. Reject a 125 P20 total, place a 100 P20 bid, resume the same pending payment
   after a page reload, then raise the total to 150 P20 with a 50 P20 payment.
2. An ended auction reports a 150 P20 refund queued to the privacy wallet.
3. A rejected wallet signature creates no authenticated session or prepared bid.
4. An Ethereum wallet must explicitly switch to Monad before campaign sign-in.
5. An account change while a signature is pending discards the stale approval.
6. An older extension can read its position but cannot prepare or fund bids.
7. A locked privacy wallet unlocks and signs in at a 390 px viewport without
   horizontal overflow.
8. The activity panel compares fixed, consistent public snapshots across 15-minute,
   one-hour, and all-time windows. An injected public update changes the bidder
   count, confirmed bid count, committed amount, and average through normal polling.
9. Hiding the highest-bid series removes its outlier from the chart scale. The
   final visible series cannot be hidden.
10. My bid orders distinguish accepted, pending, and rejected sponsor jobs. Resuming
    the selected pending order preserves its ID and additional payment even when a
    different rejected, still-prepared intent precedes it. Changing the wallet
    account clears private order rows.
11. Populated analysis and private order panels fit a 390 px viewport without
    horizontal overflow.
12. A wallet exposing only the generic sponsored-transfer capability can submit a bid.
13. A wallet exposing only the earlier JubJub capability remains compatible.
14. Rejecting a generic payment never triggers a second attempt through the legacy API.
15. Thirteen distinct first-entry payments populate all seven amount bands with counts
    `[2, 2, 2, 2, 2, 2, 1]`. A later 500 P20 increase does not add a participant or
    change the entry capital. A new 650 P20 participant changes only the second band.
16. Three public snapshots that each add two positions remain six unclassified
    positions; only individually identifiable first entries enter the price bands.
17. A failed history request shows an unavailable state instead of seven zero counts.
18. All seven bands and their entry amounts remain readable at a 390 px viewport
    without horizontal overflow.

Every test rejects all requests outside its local fixture origin and checks for
browser runtime errors. Generic funding calls contain the public protocol, service,
campaign, intent, payment fields, and temporary session token. Proof material and
private notes never enter these calls. Legacy calls keep their original intent ID
and token shape. Signatures, wallet responses, funds, and refunds are synthetic;
the fixture never reaches the production API. The fixture preserves the reviewed
deployment addresses and recomputes the official Keccak rules commitment for its
test schedule. It does not test real proof generation or on-chain confirmation.

For manual inspection, run `node tests/browser/jubjub-fixture.mjs` and open
`http://127.0.0.1:5182/privasea/jubjub`. Select another scenario with
`?scenario=refund`, `reject`, `network`, `stale`, `old`, `locked`, `analytics`,
`generic-only`, `legacy`, `generic-reject`, `distribution`, or `distribution-error`. The `stale`
scenario holds the signature until the browser console calls
`window.__jubjubFixture.changeAccount()` followed by
`window.__jubjubFixture.releaseSignature()`. All pages display a test banner.

The `analytics` scenario uses a fixed auction time and matching public summary and
history: 8 funded positions, 10 confirmed bids, and 12,900 P20 committed. Its
15-minute window changes by 2 positions and 1,100 P20; the one-hour window changes
by 4 and 12,300 P20. Call `await window.__jubjubFixture.publishUpdate()` to append
one public change of 1 position and 450 P20. This remains entirely local.

The `distribution` scenario uses first-entry amounts of 100, 450, 500, 950, 1,000,
4,950, 5,000, 9,950, 10,000, 49,950, 50,000, 100,000, and 100,050 P20. Their
combined entry capital is 332,900 P20. A separate 500 P20 increase makes public
committed capital 333,400 P20 while participant count remains 13. In this scenario,
`publishUpdate()` adds a new 650 P20 participant. Exactly 100,000 belongs in the
sixth band; the last band is strictly greater than 100,000. The `distribution-error`
scenario exposes the same public totals but deliberately fails history requests.
These distributions estimate first participation from public snapshots, not each
participant's current bid after later increases.

Screenshots include desktop confirmation, desktop refund, mobile sign-in, live
analysis, private orders, mobile analysis with populated orders, complete/partial
first-bid distributions, and the seven bands on mobile.
