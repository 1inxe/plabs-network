/** Opt-in authentication smoke. Real HTTP and ephemeral signatures; never payments. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--site') {
  console.error(
    'Usage: node tests/browser/jubjub-auth-live.mjs --site <local HTTP or deployed HTTPS origin>',
  );
  process.exit(2);
}
const site = new URL(args[1]);
if (
  site.username ||
  site.password ||
  site.search ||
  site.hash ||
  !['/', '/privasea/jubjub'].includes(site.pathname) ||
  !(
    site.protocol === 'https:' ||
    (site.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(site.hostname))
  )
)
  throw new Error(
    'Use an HTTPS site or a loopback HTTP site, without credentials, query or fragment.',
  );

const networkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walletRoot = resolve(
  process.env.JUBJUB_WALLET_ROOT ?? join(networkRoot, '../plabs-wallet-extension'),
);
const require = createRequire(import.meta.url);
const walletRequire = createRequire(join(walletRoot, 'package.json'));
const { Wallet, toUtf8String, verifyMessage } = walletRequire('ethers');
const ts = require('typescript');
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/'))
      return next(
        pathToFileURL(join(networkRoot, 'src', `${specifier.slice(2)}.ts`)).href,
        context,
      );
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier))
        return next(`${specifier}.ts`, context);
      throw error;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.ts'))
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      };
    return next(url, context);
  },
});
const { jubjubMeSchema } = await import(
  pathToFileURL(join(networkRoot, 'src/services/platform/jubjub.ts')).href
);
const candidates = [
  process.env.JUBJUB_PLAYWRIGHT_PATH,
  join(homedir(), 'Workspace/ai/rea/node_modules/playwright-core/index.mjs'),
];
try {
  candidates.splice(1, 0, require.resolve('playwright-core'));
} catch {
  /* Use an existing runtime. */
}
const playwrightPath = candidates.find((path) => path && existsSync(path));
if (!playwrightPath)
  throw new Error('Set JUBJUB_PLAYWRIGHT_PATH to an installed playwright-core entry file.');
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const executablePath = [
  process.env.JUBJUB_BROWSER_PATH,
  chromium.executablePath(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((path) => path && existsSync(path));
if (!executablePath)
  throw new Error('Set JUBJUB_BROWSER_PATH to an installed Chrome or Chromium executable.');

const publicRoot = join(walletRoot, 'public');
const manifest = JSON.parse(readFileSync(join(publicRoot, 'wasm/asset-manifest.json'), 'utf8'));
const wasm = await import(pathToFileURL(publicRoot + manifest.module_url).href);
wasm.initSync({ module: readFileSync(publicRoot + manifest.wasm_url) });
const seed = randomBytes(32);
const wallet = Wallet.createRandom();
const seedHex = seed.toString('hex');
const keys = wasm.keys({ seed_hex: seedHex, account_id: 0, bip44_coin_type: 60 });
seed.fill(0);
const account = wallet.address.toLowerCase();
const rawAddress = `0x${keys.raw_address_hex.toLowerCase()}`;
const redactedValues = [
  seedHex,
  wallet.privateKey,
  wallet.mnemonic?.phrase,
  account,
  rawAddress,
  ...Object.values(keys),
].filter((v) => typeof v === 'string' && v.length > 8);
function safeMessage(value) {
  let message = String(value);
  for (const secret of redactedValues) message = message.split(secret).join('[redacted]');
  return message.replace(/0x[0-9a-f]{40,}/gi, '[redacted hex]').slice(0, 600);
}

let challenge, signature, ownershipProof, sessionToken;
let signCount = 0,
  proofCount = 0,
  challengeCount = 0,
  sessionCount = 0,
  meCount = 0;
let schemaAccepted = false,
  firstFailure;
let rejectFailure;
const failure = new Promise((_, reject) => {
  rejectFailure = reject;
});
void failure.catch(() => {});
function fail(message) {
  if (!firstFailure) {
    firstFailure = new Error(safeMessage(message));
    rejectFailure(firstFailure);
  }
}
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: 'block',
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror', () => fail('The page raised a runtime error. No page contents were logged.'));
const protectedPaths = new Set([
  '/api/jubjub/auth/challenge',
  '/api/jubjub/auth/session',
  '/api/jubjub/me',
]);
const publicPaths = new Set(['/api/jubjub/config', '/api/jubjub/summary', '/api/jubjub/history']);
const statusLogged = new Set();
const check = (condition, message) => assert.ok(condition, message);

try {
  await context.route('**/*', async (route) => {
    try {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname;
      const method = request.method();
      check(url.origin === site.origin, 'Blocked a request outside the explicitly selected site.');
      check(!/\/(?:bids|refund)(?:\/|$)/.test(path), 'Blocked a payment or refund endpoint.');
      if (publicPaths.has(path)) {
        check(method === 'GET', 'Public campaign requests must be read-only.');
        await route.continue();
        return;
      }
      if (!protectedPaths.has(path)) {
        check(
          method === 'GET' && !path.startsWith('/api/'),
          'Blocked an unapproved application endpoint.',
        );
        const asset = request.resourceType() !== 'fetch' && request.resourceType() !== 'xhr';
        check(asset, 'Blocked an unapproved application data request.');
        await route.continue();
        return;
      }
      const headers = await request.allHeaders();
      const isMe = path.endsWith('/me');
      check(
        method === (isMe ? 'GET' : 'POST'),
        'Authentication request used an unexpected method.',
      );
      if (!isMe)
        check(
          headers.origin === site.origin,
          'Browser authentication must carry the selected site Origin.',
        );
      if (path.endsWith('/auth/challenge')) {
        check(++challengeCount === 1, 'The smoke permits exactly one authentication challenge.');
        const body = request.postDataJSON();
        check(
          body.evm === account && body.raw === rawAddress.slice(2),
          'Challenge did not use the ephemeral identity.',
        );
      } else if (path.endsWith('/auth/session')) {
        check(++sessionCount === 1, 'The smoke permits exactly one session creation.');
        const body = request.postDataJSON();
        check(
          challenge &&
            signature &&
            ownershipProof &&
            body.id === challenge.id &&
            body.signature === signature &&
            body.proof &&
            Object.keys(body.proof).length === 4 &&
            ['version', 'r_x_hex', 'r_y_hex', 's_hex'].every(
              (field) => body.proof[field] === ownershipProof[field],
            ),
          'Session did not use the locally approved ephemeral signatures.',
        );
      } else {
        check(
          sessionToken && headers.authorization === `Bearer ${sessionToken}`,
          'Account read did not use the ephemeral session.',
        );
        meCount++;
      }
      // Preserve the real browser's Origin and request headers through the selected site.
      const response = await route.fetch({ maxRedirects: 0, timeout: 30000 });
      const body = await response.body();
      let data;
      try {
        data = JSON.parse(body.toString('utf8'));
      } catch {
        /* Report status, never raw payload. */
      }
      if (typeof data?.token === 'string') redactedValues.push(data.token);
      if (!statusLogged.has(path)) {
        statusLogged.add(path);
        console.log(
          JSON.stringify({
            path,
            status: response.status(),
            browserOrigin: headers.origin === site.origin,
          }),
        );
      }
      if (!response.ok()) {
        await route.fulfill({ response, body });
        fail(
          `Authentication failed at ${path}: HTTP ${response.status()}${typeof data?.error === 'string' ? ` (${safeMessage(data.error)})` : ''}`,
        );
        return;
      }
      check(data && typeof data === 'object', 'Authentication returned an unreadable response.');
      if (path.endsWith('/auth/challenge')) {
        check(
          typeof data.id === 'string' &&
            data.id &&
            typeof data.message === 'string' &&
            data.message.length > 0 &&
            data.message.length <= 8192,
          'The service returned an invalid challenge.',
        );
        challenge = { id: data.id, message: data.message };
      } else if (path.endsWith('/auth/session')) {
        check(
          typeof data.token === 'string' && data.token,
          'The service omitted its session token.',
        );
        sessionToken = data.token;
      } else {
        const parsed = jubjubMeSchema.safeParse(data);
        if (!parsed.success)
          throw new Error(
            `Account response schema rejected: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`).join('; ')}`,
          );
        check(
          parsed.data.intents.length === 0 && parsed.data.jobs.length === 0,
          'A new ephemeral identity unexpectedly has existing bid records.',
        );
        schemaAccepted = true;
      }
      await route.fulfill({ response, body });
    } catch (error) {
      await route.abort().catch(() => {});
      fail(error instanceof Error ? error.message : 'Authentication request inspection failed.');
    }
  });
  await page.exposeBinding('__jubjubAuthSmokeSign', async (source, input) => {
    try {
      check(
        source.page === page &&
          source.frame === page.mainFrame() &&
          new URL(source.frame.url()).origin === site.origin,
        'Signing requested outside the selected main page.',
      );
      check(challenge, 'Signing requires the current service challenge.');
      if (input.method === 'personal_sign') {
        check(
          ++signCount === 1 && Array.isArray(input.params) && input.params.length === 2,
          'Unexpected EVM signing request.',
        );
        const [encoded, address] = input.params;
        const message =
          typeof encoded === 'string' && encoded.startsWith('0x') ? toUtf8String(encoded) : encoded;
        check(
          message === challenge.message && String(address).toLowerCase() === account,
          'EVM signature was not bound to the current ephemeral challenge.',
        );
        signature = await wallet.signMessage(message);
        redactedValues.push(signature);
        check(
          verifyMessage(message, signature).toLowerCase() === account,
          'Local EVM signature verification failed.',
        );
        return signature;
      }
      if (input.method === 'plabs_provePrivacyOwnership') {
        check(
          ++proofCount === 1 &&
            signCount === 1 &&
            Array.isArray(input.params) &&
            input.params.length === 1,
          'Unexpected privacy signing request.',
        );
        const request = input.params[0];
        check(
          request.message === challenge.message &&
            String(request.privacyAddress).toLowerCase() === rawAddress,
          'Privacy proof was not bound to the current ephemeral challenge.',
        );
        ownershipProof = wasm.privacy_address_ownership_sign_wasm({
          bn254_ivk_hex: keys.bn254_ivk_hex,
          raw_address_hex: keys.raw_address_hex,
          message: challenge.message,
        });
        redactedValues.push(...Object.values(ownershipProof));
        return ownershipProof;
      }
      throw new Error('Blocked a funds-related or unsupported wallet RPC.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ephemeral signing failed.';
      fail(message);
      throw new Error(safeMessage(message));
    }
  });
  await page.addInitScript(
    ({ account, rawAddress }) => {
      const chainId = '0x8f',
        scopes = ['address'],
        expiresAt = Date.now() + 3600000;
      const privacy = () => ({ version: 1, chainId, address: rawAddress, scopes, expiresAt });
      window.plabsPrivacyWallet = {
        isPlabsWallet: true,
        on() {},
        removeListener() {},
        async request({ method, params = [] }) {
          switch (method) {
            case 'eth_accounts':
            case 'eth_requestAccounts':
              return [account];
            case 'eth_chainId':
              return chainId;
            case 'plabs_getCapabilities':
              return {
                version: 1,
                methods: {
                  personalSign: true,
                  privacyRead: true,
                  privacyOwnership: true,
                  unifiedConnect: true,
                  sponsoredPrivacyTransfers: true,
                },
                networks: [{ chainId: 143, name: 'Monad', nativeSymbol: 'MON', pools: [] }],
              };
            case 'plabs_getPrivacySession':
            case 'plabs_requestPrivacyAccess':
              return privacy();
            case 'plabs_connect':
              return { accounts: [account], chainId, privacy: privacy() };
            case 'plabs_getPrivacyAddress':
              return { address: rawAddress, rawAddress, chainId };
            case 'plabs_getBalances':
              return {
                chainId,
                privacyAddress: rawAddress,
                fetchedAt: Date.now(),
                public: { assets: [] },
                private: { assets: [] },
              };
            case 'plabs_getHistory':
            case 'plabs_getNotes':
              return { items: [], page: 1, pageSize: 20, total: 0, pages: 1 };
            case 'plabs_getDexOrders':
              return { orders: [], fetchedAt: Date.now() };
            default:
              return window.__jubjubAuthSmokeSign({ method, params });
          }
        },
      };
    },
    { account, rawAddress },
  );

  await Promise.race([page.goto(new URL('/privasea/jubjub', site.origin).href), failure]);
  await Promise.race([
    page
      .locator('.jubjub-bid-panel')
      .getByRole('button', { name: 'Sign in to auction', exact: true })
      .click(),
    failure,
  ]);
  await Promise.race([
    page
      .getByText('Signed in. Your current bid and settlement status are available below.', {
        exact: true,
      })
      .waitFor(),
    failure,
  ]);
  await Promise.race([
    page
      .getByRole('region', { name: 'My bid orders', exact: true })
      .getByText('No bids yet. Your first bid and later increases will appear here.', {
        exact: true,
      })
      .waitFor(),
    failure,
  ]);
  check(
    schemaAccepted && meCount > 0 && signCount === 1 && proofCount === 1,
    'The browser did not finish verified ephemeral authentication.',
  );
  if (firstFailure) throw firstFailure;
  console.log(
    JSON.stringify({
      result: 'PASS',
      site: site.origin,
      meSchemaAccepted: true,
      uiSignedIn: true,
      emptyBidOrders: true,
      paymentRequests: 0,
      realWalletUsed: false,
    }),
  );
} catch (error) {
  console.error(
    `FAIL ${safeMessage(firstFailure?.message ?? (error instanceof Error ? error.message : 'Browser authentication failed.'))}`,
  );
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
