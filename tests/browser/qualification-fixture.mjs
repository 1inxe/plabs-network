import { createServer, loadConfigFromFile } from 'vite';

const { config } = await loadConfigFromFile({ command: 'serve', mode: 'development' });
const address = `0x${'12'.repeat(43)}`;
const account = `0x${'34'.repeat(20)}`;
const proof = {
  version: 'bjj-schnorr-v1',
  r_x_hex: '11'.repeat(32),
  r_y_hex: '22'.repeat(32),
  s_hex: '33'.repeat(32),
};
const injected = `
let capsCalls=0; let unlocked=!location.search.includes('locked'); const expiresAt=Date.now()+3600000; const scopes=['address','balances','history','notes','dexOrders'];
const provider={isPlabsWallet:true,on(){},removeListener(){},async request({method,params}) {
 console.log('FIXTURE RPC', method);
 switch(method) {
 case 'eth_accounts': return ['${account}'];
 case 'eth_chainId': return '0x1';
 case 'plabs_getCapabilities': return {version:1, methods:{privacyRead:true,personalSign:true,privacyOwnership:++capsCalls>1},networks:[{chainId:1,name:'Ethereum',nativeSymbol:'ETH',pools:[]}]};
 case 'plabs_getPrivacySession': return unlocked ? {version:1,chainId:'0x1',address:'${address}',scopes,expiresAt} : {version:1,chainId:'0x1',scopes:[]};
 case 'plabs_requestPrivacyAccess': unlocked=true; return {version:1,chainId:'0x1',address:'${address}',scopes,expiresAt};
 case 'plabs_getBalances': return {chainId:'0x1',privacyAddress:'${address}',fetchedAt:Date.now(),public:{assets:[]},private:{assets:[]}};
 case 'plabs_getHistory': case 'plabs_getNotes': return {items:[],page:1,pageSize:20,total:0,pages:1};
 case 'plabs_getDexOrders': return {orders:[],fetchedAt:Date.now()};
 case 'plabs_getPrivacyAddress': return {address:'${address}',rawAddress:'${address}',chainId:'0x1'};
 case 'personal_sign': if(location.search.includes('reject')) throw {code:4001,message:'User rejected'}; return 'synthetic-test-signature';
 case 'plabs_provePrivacyOwnership': if(params[0].privacyAddress!=='${address}')throw new Error('Address mismatch');return ${JSON.stringify(proof)};
 default: throw new Error('Unexpected fixture RPC: '+method);
 }
}}; window.plabsPrivacyWallet=provider;
window.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('div');b.textContent='TEST FIXTURE · synthetic wallet and rewards · no real signatures';b.style='background:#edbb76;color:#111;padding:8px;text-align:center;position:relative;z-index:9999';document.body.prepend(b);});
`;
config.configFile = false;
config.server = { host: '127.0.0.1', port: 5181, strictPort: true, proxy: {} };
config.plugins.push({
  name: 'qualification-test-only',
  transformIndexHtml() {
    return [{ tag: 'script', children: injected, injectTo: 'head-prepend' }];
  },
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url.startsWith('/api/')) return next();
      const data = {
        '/api/platform/wallet/stats': { privacy_wallet_users: 100 },
        '/api/platform/privasea/whitelist/status': {
          campaign_id: 'test',
          ends_at: '2026-09-28T12:00:00Z',
          closed: true,
          submitted_count: 6820,
        },
        '/api/platform/auth/challenge': {
          nonce: 'test-nonce',
          message: 'Synthetic login challenge',
        },
        '/api/platform/auth/login': { access_token: 'synthetic-test-token' },
        '/api/platform/privasea/whitelist/qualification/challenge': {
          message: 'Synthetic ownership challenge',
          proof_version: 'bjj-schnorr-v1',
          ownership_challenge: 'test-challenge',
        },
        '/api/platform/privasea/whitelist/qualification/check': {
          privacy_address: address,
          twitter_handle: 'test_account',
          rewards: { nft: 0, p20: 100 },
        },
      };
      if (
        req.url.includes('/qualification/') &&
        req.headers.authorization !== 'Bearer synthetic-test-token'
      ) {
        res.statusCode = 401;
        res.end('{}');
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        console.log(req.method, req.url);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data[req.url] ?? {}));
      });
    });
  },
});
await (await createServer(config)).listen();
console.log('Synthetic qualification fixture: http://127.0.0.1:5181/p-sea');
