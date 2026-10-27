import type { IncomingMessage, ServerResponse } from 'node:http';
export function createJubjubProxyHandler(options?: {
  protocol?: 'jubjub' | 'nft';
  transport?: typeof fetch;
  routeMode?: 'path' | 'query';
  trustForwardedProto?: boolean;
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxResponseBytes?: number;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
export function jubjubProxyEnabled(proxy: object | undefined): boolean;
