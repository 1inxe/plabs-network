export type ApiErrorCode = 'network' | 'timeout' | 'http' | 'invalid-response';
export class ApiError extends Error {
  readonly name = 'ApiError';
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    super(message);
  }
  get retryable() {
    return (
      this.code === 'network' ||
      this.code === 'timeout' ||
      (this.code === 'http' && (this.status === 429 || (this.status ?? 0) >= 500))
    );
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) {
    if ('code' in error && error.code === 4001)
      return 'Request declined in your wallet. No action was taken.';
    if (error.name === 'AbortError') return 'The request was cancelled.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
