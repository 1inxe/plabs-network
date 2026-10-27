import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

registerHooks({
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
const { runAutoMint } = await import('../src/features/nft-launch/auto-mint.ts');
const pool = `0x${'12'.repeat(20)}`;
function fixture(count = 3) {
  const records = [],
    submitted = [],
    progress = [],
    controller = new AbortController();
  let next = 0,
    valid = true;
  const mint = () => ({
    id: `12345678-1234-4234-8234-${String(++next).padStart(12, '0')}`,
    chainId: 1,
    poolAddress: pool,
    createdAt: Date.now(),
    name: 'Synthetic',
    symbol: 'NFT',
    tokenId: String(next),
    state: 'pending',
    stage: 'confirming',
    txHash: `0x${String(next).padStart(64, '0')}`,
    canResume: true,
  });
  const ports = {
    pool,
    signal: controller.signal,
    guard: async () => {
      if (!valid) throw Error('wallet changed');
    },
    allocation: async () => ({
      enabled: true,
      checked: true,
      eligible: true,
      connected: true,
      allowance: count,
      minted: 0,
      reserved: 0,
      remaining: count,
    }),
    read: async () => structuredClone(records),
    submit: async (id) => {
      assert.equal(
        records.some((row) => row.txHash && row.state === 'pending' && row.id !== id),
        false,
        'Do not start a new transaction before the previous confirms',
      );
      const row = id ? records.find((row) => row.id === id) : mint();
      if (!id) records.push(row);
      else row.txHash = `0x${'ab'.repeat(32)}`;
      submitted.push(id ?? 'new');
      return structuredClone(row);
    },
    wait: async () => {
      for (const row of records) if (row.txHash) row.state = 'confirmed';
    },
    progress: (value) => progress.push(value),
    minted() {},
  };
  return {
    ports,
    records,
    submitted,
    progress,
    controller,
    mint,
    change: () => {
      valid = false;
    },
  };
}
test('one start serially mints the complete allowance and waits for every confirmation', async () => {
  const f = fixture(10);
  await runAutoMint(f.ports);
  assert.equal(f.submitted.length, 10);
  assert.equal(
    f.records.every((row) => row.state === 'confirmed'),
    true,
  );
  assert.equal(f.progress.at(-1).completed, 10);
  assert.equal(f.progress.at(-1).total, 10);
});
test('the existing reservation is resumed first and counts inside the allowance', async () => {
  const f = fixture(10),
    old = f.mint();
  delete old.txHash;
  old.stage = 'permit-expired';
  f.records.push(old);
  f.ports.allocation = async () => ({
    enabled: true,
    checked: true,
    eligible: true,
    allowance: 10,
    minted: 0,
    reserved: 1,
    remaining: 9,
  });
  await runAutoMint(f.ports);
  assert.equal(f.submitted[0], old.id);
  assert.equal(f.submitted.length, 10);
  assert.equal(f.records.length, 10);
});
test('denied signature and expired permits pause without automatically asking again', async () => {
  for (const message of ['User rejected transaction', 'NFT mint 许可已过期']) {
    const f = fixture();
    f.ports.submit = async () => {
      f.submitted.push('new');
      return { ...f.mint(), txHash: undefined, message, stage: 'approval' };
    };
    await assert.rejects(runAutoMint(f.ports), new RegExp(message));
    assert.equal(f.submitted.length, 1);
  }
});
test('pause and context changes never create the next mint request', async () => {
  for (const mode of ['pause', 'context']) {
    const f = fixture();
    f.ports.wait = async () => {
      if (mode === 'pause') f.controller.abort();
      else f.change();
    };
    await assert.rejects(runAutoMint(f.ports));
    assert.equal(f.submitted.length, 1);
  }
});
test('unknown transactions cannot be replaced and public mint cannot run without a bounded allocation', async () => {
  const f = fixture();
  f.ports.wait = async () => {
    f.records.length = 0;
  };
  await assert.rejects(runAutoMint(f.ports), /could not be verified/);
  assert.equal(f.submitted.length, 1);
  const g = fixture();
  g.ports.allocation = async () => ({ enabled: false });
  await assert.rejects(runAutoMint(g.ports), /verified allocation/);
  assert.equal(g.submitted.length, 0);
});

test('auto mint renews an expired permit once using the same saved ID, never another reservation', async () => {
  const f = fixture(1),
    submit = f.ports.submit;
  let first = true;
  f.ports.submit = async (id) => {
    const result = await submit(id);
    if (first) {
      first = false;
      delete result.txHash;
      result.stage = 'permit-expired';
      delete f.records[0].txHash;
    }
    return result;
  };
  await runAutoMint(f.ports);
  assert.equal(f.submitted.length, 2);
  assert.equal(f.submitted[1], f.records[0].id);
  assert.equal(f.records.length, 1);
  assert.equal(f.progress.at(-1).completed, 1);
});

test('an explicitly expired unsent reservation is replaced within the same allowance budget', async () => {
  const f = fixture(3),
    old = f.mint();
  delete old.txHash;
  f.records.push(old);
  const submit = f.ports.submit;
  f.ports.allocation = async () => ({
    enabled: true,
    checked: true,
    eligible: true,
    allowance: 3,
    minted: 0,
    reserved: 1,
    remaining: 2,
  });
  f.ports.submit = async (id) =>
    id ? { ...old, state: 'failed', stage: 'expired', canResume: false } : submit();
  f.records[0].state = 'failed';
  // The initial snapshot still contains the pending record; its resume confirms expiry.
  const read = f.ports.read;
  let firstRead = true;
  f.ports.read = async () => {
    const rows = await read();
    if (firstRead) {
      firstRead = false;
      rows[0].state = 'pending';
    }
    return rows;
  };
  await runAutoMint(f.ports);
  assert.equal(f.submitted.length, 3);
  assert.equal(f.progress.at(-1).completed, 3);
});
