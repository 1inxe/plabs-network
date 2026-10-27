import type { NftAllocation } from '@/services/platform/nft-launch';
import type { NftMintResult } from '@/services/wallet/types';

export type AutoMintProgress = { completed: number; total: number; message: string };
export async function runAutoMint(input: {
  pool: string;
  signal: AbortSignal;
  guard(): Promise<void>;
  allocation(): Promise<NftAllocation>;
  read(): Promise<NftMintResult[]>;
  submit(id?: string): Promise<NftMintResult>;
  progress(value: AutoMintProgress): void;
  minted(value: NftMintResult): void;
  wait?(signal: AbortSignal): Promise<void>;
}) {
  const check = async () => {
    input.signal.throwIfAborted();
    await input.guard();
    input.signal.throwIfAborted();
  };
  const wait =
    input.wait ??
    ((signal) =>
      new Promise<void>((resolve, reject) => {
        const stop = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', stop);
          resolve();
        }, 3000);
        if (signal.aborted) stop();
        else signal.addEventListener('abort', stop, { once: true });
      }));
  await check();
  input.progress({ completed: 0, total: 0, message: 'Checking remaining mint allocation…' });
  const allocation = await input.allocation();
  await check();
  if (!allocation.enabled || !allocation.checked || !allocation.eligible)
    throw new Error('Auto mint requires a verified allocation for this privacy wallet.');
  const rows = await input.read();
  await check();
  const pending = rows
    .filter((row) => row.poolAddress === input.pool && row.state === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);
  // Existing reservations are part of the run, not additional allowance.
  const total = Math.min(
    allocation.remaining + pending.length,
    Math.max(0, allocation.allowance - allocation.minted),
  );
  let completed = 0;
  const seen = new Set<string>();
  for (let index = 0; index < total; index++) {
    await check();
    input.progress({
      completed,
      total,
      message: `Mint ${index + 1} of ${total} · continue in PLabs Wallet`,
    });
    const original = pending.shift();
    let mint = original?.txHash ? original : await input.submit(original?.id);
    if (input.signal.aborted) {
      await input.guard();
      input.minted(mint);
      if (mint.state === 'confirmed') completed++;
      input.progress({ completed, total, message: 'Auto mint paused.' });
    }
    await check();
    if (
      mint.poolAddress !== input.pool ||
      (original && original.id !== mint.id) ||
      seen.has(mint.id)
    )
      throw new Error(
        'The wallet returned a different or already completed mint. Auto mint paused.',
      );
    seen.add(mint.id);
    if (original && mint.state === 'failed' && mint.stage === 'expired' && !mint.txHash) {
      await check();
      input.progress({
        completed,
        total,
        message: 'The unsent reservation expired · requesting a new NFT within the same allocation',
      });
      const replacement = await input.submit();
      await check();
      if (replacement.poolAddress !== input.pool || seen.has(replacement.id))
        throw new Error('The replacement reservation could not be verified. Auto mint paused.');
      seen.add(replacement.id);
      mint = replacement;
    }

    if (
      mint.state === 'pending' &&
      !mint.txHash &&
      mint.stage === 'permit-expired' &&
      mint.canResume
    ) {
      input.progress({
        completed,
        total,
        message: `Mint ${index + 1} of ${total} · renewing the original permit`,
      });
      await check();
      const renewed = await input.submit(mint.id);
      await check();
      if (renewed.id !== mint.id || renewed.poolAddress !== input.pool)
        throw new Error('The renewed mint belongs to another request. Auto mint paused.');
      mint = renewed;
    }
    const started = Date.now();
    while (true) {
      input.minted(mint);
      if (mint.state === 'confirmed') break;
      if (mint.state === 'failed' || !mint.txHash) {
        if (mint.state === 'failed' && /额度已用完|limit.reached/i.test(mint.message ?? '')) {
          input.progress({ completed, total, message: 'Mint allocation exhausted.' });
          return;
        }
        throw new Error(
          mint.message ??
            'The current mint needs attention. Resume it before continuing auto mint.',
        );
      }
      if (Date.now() - started > 15 * 60_000)
        throw new Error(
          'The current transaction is still pending. Auto mint paused; its original hash is saved.',
        );
      input.progress({
        completed,
        total,
        message: `Mint ${index + 1} of ${total} · waiting for Ethereum confirmation`,
      });
      await wait(input.signal);
      await check();
      const saved = await input.read();
      await check();
      const current = saved.find((row) => row.id === mint.id && row.poolAddress === input.pool);
      if (!current || current.txHash !== mint.txHash)
        throw new Error(
          'The current mint could not be verified. Auto mint paused without requesting another mint.',
        );
      mint = current;
    }
    completed++;
    input.progress({ completed, total, message: `${completed} of ${total} mints confirmed` });
  }
  input.progress({
    completed,
    total,
    message: total ? 'Auto mint complete.' : 'No mint allocation remaining.',
  });
}
