import { createJubjubProxyHandler } from '../server/jubjub-proxy.mjs';

// Vercel terminates HTTPS and owns x-forwarded-proto. Local Node callers do not.
const handler = createJubjubProxyHandler({
  routeMode: 'query',
  trustForwardedProto: process.env.VERCEL === '1',
});
export default handler;
