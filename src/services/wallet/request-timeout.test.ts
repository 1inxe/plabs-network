import { expect, it, vi } from 'vitest';
import { walletReadTimeout } from './request-timeout';

it('bounds a silent extension bridge and ignores late completion', async () => {
  vi.useFakeTimers();
  try {
    let complete: (value: string) => void = () => {};
    const result = walletReadTimeout(
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
      100,
    );
    const rejected = expect(result).rejects.toThrow('did not respond');
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    complete('late');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it('clears the timer after a successful read', async () => {
  vi.useFakeTimers();
  try {
    expect(await walletReadTimeout(Promise.resolve('ok'))).toBe('ok');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
