import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../src/features/wallet/model/wallet-store.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('require', 'exports', compiled)((name) => {
  if (name === '@/shared/notifications') return { notify: { clearScope() {} } };
  if (name === '@/shared/api/errors') return { errorMessage: (error) => error.message };
  return {};
}, exports);
const { WalletStore } = exports;
const capabilities = (enabled) => ({
  version: 1,
  methods: { privacyRead: false, nftMinting: enabled },
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture() {
  let contextChanged,
    resolveRead,
    reads = 0,
    account = `0x${'12'.repeat(20)}`;
  const store = new WalletStore();
  const adapter = {
    session: async () => ({ accounts: [account], chainId: 1, capabilities: capabilities(false) }),
    capabilities: () => {
      reads++;
      return new Promise((resolve) => {
        resolveRead = resolve;
      });
    },
    subscribe: (changed) => {
      contextChanged = changed;
      return () => {};
    },
  };
  store.attach(adapter);
  return {
    store,
    resolve: (value) => resolveRead(value),
    reads: () => reads,
    changeAccount() {
      account = `0x${'34'.repeat(20)}`;
      contextChanged();
    },
  };
}
test('live capability reads update stale flags without reconnecting or requesting private data', async () => {
  const f = fixture();
  await tick();
  assert.equal(f.store.getSnapshot().capabilities.methods.nftMinting, false);
  const first = f.store.refreshCapabilities(),
    second = f.store.refreshCapabilities();
  assert.equal(f.reads(), 1);
  f.resolve(capabilities(true));
  await Promise.all([first, second]);
  assert.equal(f.store.getSnapshot().capabilities.methods.nftMinting, true);
});
test('an old capability response cannot update another wallet context', async () => {
  const f = fixture();
  await tick();
  const old = f.store.refreshCapabilities();
  f.changeAccount();
  await tick();
  f.resolve(capabilities(true));
  await assert.rejects(old, /wallet changed/);
  assert.equal(f.store.getSnapshot().capabilities.methods.nftMinting, false);
});
test('failed capability reads retain the last known flags and allow an explicit retry', async () => {
  const f = fixture();
  await tick();
  const first = f.store.refreshCapabilities();
  f.resolve(null);
  await assert.rejects(first, /unreadable feature information/);
  const retry = f.store.refreshCapabilities();
  f.resolve(capabilities(true));
  await retry;
  assert.equal(f.reads(), 2);
  assert.equal(f.store.getSnapshot().capabilities.methods.nftMinting, true);
});
