# Whitelist browser regression

Run `node tests/browser/qualification-fixture.mjs` from the repository root, then open
`http://127.0.0.1:5181/p-sea`. This separate server injects a synthetic wallet and
responds to API requests locally. The banner identifies the fixture; no real wallet
is used, no signatures are produced, and no requests reach the production API.

Verify each entry independently:

1. Click the hero's **Check whitelist** button. The Gift modal must open.
2. Close it, select **The collection**, and click **Check your eligibility** at the
   bottom. It must switch to Genesis and open the result, not merely scroll.
3. Close the modal and click **Check again** in the card. It must query again.
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
