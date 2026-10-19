import type { z } from 'zod';
import { ApiError } from './errors';
export type Transport = typeof fetch;
export function createHttpClient(
  baseUrl: string,
  transport: Transport = (...args) => fetch(...args),
) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    body?: unknown,
    token?: string,
  ): Promise<T> {
    const timeout = AbortSignal.timeout(12000);
    let response: Response;
    try {
      response = await transport(`${baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted)
        throw new ApiError('timeout', 'The service took too long to respond. Please retry.');
      throw new ApiError('network', 'Unable to reach this service. Check your connection.');
    }
    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (!response.ok) {
      const failures: Record<number, string> = {
        400: 'The service rejected this request.',
        401: 'Authentication was rejected or expired. Sign in again.',
        403: 'The service denied this request.',
        404: 'The requested service route was not found.',
        405: 'The service does not accept this request method.',
        422: 'The service could not validate this request.',
        429: 'Too many requests. Please wait before retrying.',
      };
      let message = failures[response.status] ?? 'This service is temporarily unavailable.';
      if (
        response.status === 400 &&
        response.headers.get('content-type')?.includes('application/json')
      ) {
        const failure: unknown = await response.json().catch(() => null);
        if (
          failure &&
          typeof failure === 'object' &&
          'error' in failure &&
          failure.error === 'origin is not allowed'
        )
          message =
            'The campaign service rejected this site’s origin. Refresh the site and retry sign-in.';
      }
      signal?.throwIfAborted();
      throw new ApiError(
        'http',
        `${message} (HTTP ${response.status})`,
        response.status,
        requestId,
      );
    }
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new ApiError(
        'invalid-response',
        'The service returned an unexpected response.',
        response.status,
        requestId,
      );
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timeout.aborted)
        throw new ApiError('timeout', 'The service took too long to respond. Please retry.');
      throw new ApiError(
        'invalid-response',
        'The service returned unreadable data.',
        response.status,
        requestId,
      );
    }
    const parsed = schema.safeParse(responseBody);
    if (!parsed.success)
      throw new ApiError(
        'invalid-response',
        'The service response does not match the expected contract.',
        response.status,
        requestId,
      );
    return parsed.data;
  }
  return {
    get: <T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) =>
      request(path, schema, signal),
    post: <T>(
      path: string,
      body: unknown,
      schema: z.ZodType<T>,
      signal?: AbortSignal,
      token?: string,
    ) => request(path, schema, signal, body, token),
  };
}
