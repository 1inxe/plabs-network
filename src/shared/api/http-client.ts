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
    if (!response.ok)
      throw new ApiError(
        'http',
        response.status === 429
          ? 'Too many requests. Please wait before retrying.'
          : 'This service is temporarily unavailable.',
        response.status,
        requestId,
      );
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
