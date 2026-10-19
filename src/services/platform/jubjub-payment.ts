import { z } from 'zod';
import type {
  Capabilities,
  SponsoredPrivacyTransactionRequest,
  WalletAdapter,
} from '@/services/wallet/types';
import { type JubjubBidIntent, type JubjubConfig, jubjubConfigSchema } from './jubjub';

const hash = z.string().regex(/^0x[0-9a-f]{64}$/i);
const response = z.object({
  id: z.string().min(1).max(256).optional(),
  intentId: hash,
  state: z.enum(['pending', 'confirmed', 'failed']),
  jobId: z.string().min(1).max(256).optional(),
  txHash: hash.optional(),
  message: z.string().max(8192).optional(),
});

export function supportsJubjubPayment(capabilities: Capabilities | null) {
  return !!(capabilities?.methods.sponsoredPrivacyTransfers || capabilities?.methods.jubjubBidding);
}

/** Auction-specific rules and memo encoding live in the dApp, outside the wallet engine. */
export function jubjubPaymentRequest(
  config: JubjubConfig,
  intent: JubjubBidIntent,
  token: string,
): SponsoredPrivacyTransactionRequest {
  const profile = jubjubConfigSchema.parse(config);
  hash.parse(intent.id);
  z.string()
    .min(1)
    .max(16384)
    .refine((value) => !/\s/.test(value))
    .parse(token);
  if (!/^[1-9]\d*$/.test(intent.delta) || BigInt(intent.delta) > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('The additional payment is outside the wallet amount range.');
  return {
    protocol: 'plabs-custody-v1',
    apiBase: `https://app.plabs.online${profile.apiBase}`,
    campaignId: profile.rules.id,
    rulesHash: profile.rulesHash,
    intentId: intent.id,
    token,
    payment: {
      chainId: profile.rules.chainId,
      poolAddress: profile.rules.paymentPool,
      recipientRaw: profile.rules.custody.recipientRaw,
      amountRaw: intent.delta,
      // The wallet appends the psi from its independently authenticated intent.
      memoPrefixHex: '0x5045524332302d4a55424a55422d5032302d763100',
    },
  };
}

export async function submitJubjubPayment({
  wallet,
  capabilities,
  config,
  intent,
  token,
}: {
  wallet: WalletAdapter;
  capabilities: Capabilities;
  config: JubjubConfig;
  intent: JubjubBidIntent;
  token: string;
}) {
  let result: unknown;
  if (capabilities.methods.sponsoredPrivacyTransfers && wallet.sendSponsoredTransaction) {
    result = await wallet.sendSponsoredTransaction(jubjubPaymentRequest(config, intent, token));
  } else if (capabilities.methods.jubjubBidding && wallet.fundJubjubBid) {
    // Compatibility with installed versions that already support the original flow.
    result = await wallet.fundJubjubBid({ intentId: intent.id, token });
  } else
    throw new Error(
      'This wallet cannot submit sponsored private payments. Update PLabs Wallet and reconnect.',
    );
  // Never retry a rejected or ambiguous generic request through the legacy method.
  const parsed = response.parse(result);
  if (parsed.intentId.toLowerCase() !== intent.id.toLowerCase())
    throw new Error(
      'The wallet returned a different payment. Refresh your order before continuing.',
    );
  return parsed;
}
