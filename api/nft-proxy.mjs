import { createJubjubProxyHandler } from '../server/jubjub-proxy.mjs';

export default createJubjubProxyHandler({
  protocol: 'nft',
  routeMode: 'query',
  trustForwardedProto: process.env.VERCEL === '1',
});
