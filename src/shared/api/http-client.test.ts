import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, errorMessage } from './errors';
import { createHttpClient } from './http-client';

const schema = z.object({ count: z.number().int().nonnegative() });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
  });
describe('HTTP contract boundary', () => {
  it('validates data and never sends credentials', async () => {
    const transport = vi.fn().mockResolvedValue(json({ count: 10, ignored: true }));
    const client = createHttpClient('/api', transport);
    expect(await client.get('/stats', schema)).toEqual({ count: 10 });
    expect(transport).toHaveBeenCalledWith(
      '/api/stats',
      expect.objectContaining({ credentials: 'omit', method: 'GET', cache: 'no-store' }),
    );
  });
  it('rejects schema drift instead of returning typed garbage', async () => {
    const client = createHttpClient('/api', vi.fn().mockResolvedValue(json({ count: 'wrong' })));
    await expect(client.get('/stats', schema)).rejects.toMatchObject({
      code: 'invalid-response',
      requestId: 'req-123',
    });
  });
  it('rejects HTML fallbacks and malformed JSON', async () => {
    for (const response of [
      new Response('<html/>', { headers: { 'content-type': 'text/html' } }),
      new Response('{broken', { headers: { 'content-type': 'application/json' } }),
    ]) {
      const client = createHttpClient('/api', vi.fn().mockResolvedValue(response));
      await expect(client.get('/stats', schema)).rejects.toMatchObject({
        code: 'invalid-response',
      });
    }
  });
  it('classifies HTTP failures without leaking response bodies', async () => {
    const client = createHttpClient(
      '/api',
      vi.fn().mockResolvedValue(new Response('secret upstream details', { status: 503 })),
    );
    await expect(client.get('/stats', schema)).rejects.toMatchObject({
      status: 503,
      code: 'http',
      retryable: true,
    });
  });
  it('classifies rate limits and rejects retrying client errors', async () => {
    const client = createHttpClient('/api', vi.fn().mockResolvedValue(json({}, 429)));
    await expect(client.get('/stats', schema)).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
    expect(new ApiError('http', 'unauthorized', 401).retryable).toBe(false);
    expect(new ApiError('invalid-response', 'bad data').retryable).toBe(false);
  });
  it('normalizes unreachable services', async () => {
    const client = createHttpClient(
      '/api',
      vi.fn().mockRejectedValue(new TypeError('private URL')),
    );
    await expect(client.get('/stats', schema)).rejects.toMatchObject({
      code: 'network',
      retryable: true,
    });
  });
  it('preserves caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('aborted', 'AbortError');
    const client = createHttpClient('/api', vi.fn().mockRejectedValue(abort));
    await expect(client.get('/stats', schema, controller.signal)).rejects.toBe(abort);
  });
  it('maps timeout separately from a network outage', async () => {
    const controller = new AbortController();
    controller.abort();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const client = createHttpClient(
      '/api',
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')),
    );
    await expect(client.get('/stats', schema)).rejects.toMatchObject({
      code: 'timeout',
      retryable: true,
    });
    spy.mockRestore();
  });
  it('provides actionable messages for wallet rejection and cancellation', () => {
    expect(errorMessage(Object.assign(new Error('raw'), { code: 4001 }))).toContain('declined');
    expect(errorMessage(new DOMException('cancelled', 'AbortError'))).toContain('cancelled');
    expect(errorMessage(null)).toContain('try again');
    expect(errorMessage(new Error('bad recipient'))).toBe('bad recipient');
    expect(errorMessage(new ApiError('network', 'offline'))).toBe('offline');
  });
});
