/** Bound silent bridge reads; never automatically retry an interactive approval or a write. */
export function walletReadTimeout<T>(work: Promise<T>, timeoutMs = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            'PLabs Wallet did not respond. Reload the extension, refresh this page and retry.',
          ),
        ),
      timeoutMs,
    );
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
