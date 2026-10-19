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

The seven assertions cover real page interactions with synthetic responses:

1. Reject a 125 P20 total, place a 100 P20 bid, resume the same pending payment
   after a page reload, then raise the total to 150 P20 with a 50 P20 payment.
2. An ended auction reports a 150 P20 refund queued to the privacy wallet.
3. A rejected wallet signature creates no authenticated session or prepared bid.
4. An Ethereum wallet must explicitly switch to Monad before campaign sign-in.
5. An account change while a signature is pending discards the stale approval.
6. An older extension can read its position but cannot prepare or fund bids.
7. A locked privacy wallet unlocks and signs in at a 390 px viewport without
   horizontal overflow.

Every test rejects all requests outside its local fixture origin and checks for
browser runtime errors. Funding calls contain only the intent ID and temporary
session token. Signatures, wallet responses, funds, and refunds are synthetic;
the fixture never reaches the production API. The fixture preserves the reviewed
deployment addresses and recomputes the official Keccak rules commitment for its
test schedule. It does not test real proof generation or on-chain confirmation.

For manual inspection, run `node tests/browser/jubjub-fixture.mjs` and open
`http://127.0.0.1:5182/privasea/jubjub`. Select another scenario with
`?scenario=refund`, `reject`, `network`, `stale`, `old`, or `locked`. The `stale`
scenario holds the signature until the browser console calls
`window.__jubjubFixture.changeAccount()` followed by
`window.__jubjubFixture.releaseSignature()`. All pages display a test banner.

Validation on 2026-10-19: all seven browser regressions passed with the existing
REA Playwright runtime and local Google Chrome. Desktop confirmation, desktop
refund, and mobile sign-in screenshots are generated on each run.
