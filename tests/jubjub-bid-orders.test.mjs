import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('/src/features/jubjub/bid-orders.ts'))
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
const { describeBidOrder, newestBidOrders } = await import('../src/features/jubjub/bid-orders.ts');
const intent = {
  id: `0x${'11'.repeat(32)}`,
  status: 'prepared',
  total: '200000000',
  delta: '50000000',
  version: 1,
  createdAt: 1792411200,
};
const txHash = `0x${'22'.repeat(32)}`;
const job = {
  id: 'job-1',
  purpose: 'bid',
  intentId: intent.id,
  status: 'submitted',
  txHash,
};

test('only funded campaign intents render as confirmed', () => {
  const submitted = describeBidOrder(intent, [job]);
  assert.equal(submitted.label, 'Pending');
  assert.equal(submitted.canResume, true);
  assert.deepEqual(submitted.txHashes, [txHash]);
  const sponsored = describeBidOrder(intent, [{ ...job, status: 'confirmed' }]);
  assert.equal(sponsored.label, 'Awaiting acceptance');
  assert.equal(sponsored.canResume, true);
  const accepted = describeBidOrder({ ...intent, status: 'funded' }, [job]);
  assert.equal(accepted.label, 'Confirmed');
  assert.equal(accepted.canResume, false);
});

test('reverted and failed jobs cannot trigger resume or a replacement payment', () => {
  for (const status of ['reverted', 'failed', 'rejected']) {
    const order = describeBidOrder(intent, [{ ...job, status }]);
    assert.equal(order.label, 'Failed');
    assert.equal(order.canResume, false);
  }
  const pastFailure = describeBidOrder(intent, [
    { ...job, status: 'reverted', createdAt: 1 },
    { ...job, id: 'job-2', status: 'submitted', createdAt: 2 },
  ]);
  assert.equal(pastFailure.canResume, false);
});

test('sponsor errors need attention while unknown states remain visible without guessing', () => {
  const issue = describeBidOrder(intent, [
    { ...job, status: 'confirmed', error: 'Campaign acceptance needs review' },
  ]);
  assert.equal(issue.label, 'Needs attention');
  assert.deepEqual(issue.errors, ['Campaign acceptance needs review']);
  assert.equal(issue.canResume, false);
  const unknown = describeBidOrder(intent, [{ ...job, status: 'awaiting-new-protocol' }]);
  assert.equal(unknown.label, 'awaiting-new-protocol');
  assert.equal(unknown.canResume, false);
  const unknownIntent = describeBidOrder({ ...intent, status: 'expired' }, [job]);
  assert.equal(unknownIntent.label, 'expired');
  assert.equal(unknownIntent.canResume, false);
});

test('only bid jobs belonging to this exact intent contribute status and valid transaction links', () => {
  const unrelated = describeBidOrder(intent, [
    { ...job, purpose: 'refund', status: 'reverted', error: 'Refund failed' },
    { ...job, intentId: `0x${'33'.repeat(32)}`, status: 'failed' },
  ]);
  assert.equal(unrelated.label, 'Prepared');
  assert.equal(unrelated.canResume, true);
  assert.deepEqual(unrelated.jobs, []);
  assert.deepEqual(unrelated.txHashes, []);
  assert.deepEqual(
    describeBidOrder(intent, [
      job,
      { ...job, id: 'job-2' },
      { ...job, id: 'bad-hash', txHash: 'javascript:alert(1)' },
    ]).txHashes,
    [txHash],
  );
});

test('orders sort newest first without modifying authenticated data or recomputing the increase', () => {
  const older = { ...intent, id: 'older', createdAt: intent.createdAt - 10 };
  const newer = { ...intent, id: 'newer', version: 2 };
  const list = [older, intent, newer];
  assert.deepEqual(newestBidOrders(list), [newer, intent, older]);
  assert.deepEqual(list, [older, intent, newer]);
  assert.equal(newestBidOrders(list)[0].delta, '50000000');
  assert.equal(newestBidOrders(list)[0], newer);
});
