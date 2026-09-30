import { z } from 'zod';
import type { WalletAdapter } from '@/services/wallet/types';
import { ApiError } from '@/shared/api/errors';
import type { createHttpClient } from '@/shared/api/http-client';

const rawAddress = z.string().regex(/^0x[0-9a-f]{86}$/i);
const challengeSchema = z.object({
  nonce: z.string().min(1),
  message: z.string().min(1).max(8192),
});
const loginSchema = z.object({ access_token: z.string().min(1) });
const ownershipChallengeSchema = z.object({
  message: z.string().min(1).max(8192),
  proof_version: z.literal('bjj-schnorr-v1'),
  ownership_challenge: z.string().min(1),
});
const scalar = z.string().regex(/^(0x)?[0-9a-f]{64}$/i);
export const ownershipProofSchema = z.object({
  version: z.literal('bjj-schnorr-v1'),
  r_x_hex: scalar,
  r_y_hex: scalar,
  s_hex: scalar,
});
export const qualificationSchema = z.object({
  privacy_address: rawAddress,
  twitter_handle: z.string().nullish(),
  rewards: z.object({ nft: z.number().int().nonnegative(), p20: z.number().nonnegative() }),
});
export type Qualification = z.infer<typeof qualificationSchema>;
export type QualificationStage = 'wallet' | 'address' | 'login' | 'proof' | 'checking';

/** No automatic retries: signatures and ownership proofs require explicit wallet approval. */
export async function checkQualification({
  client,
  wallet,
  account,
  chainId,
  signal,
  onStage,
}: {
  client: ReturnType<typeof createHttpClient>;
  wallet: WalletAdapter;
  account: string;
  chainId: number;
  signal: AbortSignal;
  onStage: (stage: QualificationStage) => void;
}): Promise<Qualification> {
  onStage('wallet');
  if (!wallet.signMessage || !wallet.provePrivacyOwnership)
    throw new Error(
      'The connected wallet cannot prove privacy ownership. Reload the updated PLabs Wallet extension, then retry here.',
    );
  let expectedPrivacyAddress: string | undefined;
  let checkedCapabilities = false;
  const current = async () => {
    signal.throwIfAborted();
    const session = await wallet.session();
    signal.throwIfAborted();
    if (
      session.accounts[0]?.toLowerCase() !== account.toLowerCase() ||
      session.chainId !== chainId
    ) {
      throw new Error('Wallet account or network changed. Please check again.');
    }
    if (!checkedCapabilities) {
      if (!session.capabilities.methods.privacyOwnership)
        throw new Error(
          'The running wallet extension does not support ownership proofs yet. In your browser extensions page, reload the updated PLabs Wallet, then retry here. Your query stays on this site.',
        );
      checkedCapabilities = true;
    }
    if (
      expectedPrivacyAddress &&
      (session.privacy?.address?.toLowerCase() !== expectedPrivacyAddress.toLowerCase() ||
        !session.privacy.scopes.includes('address'))
    ) {
      throw new Error('Privacy wallet or access changed. Please check again.');
    }
  };
  await current();
  onStage('address');
  const address = await wallet.privacyAddress();
  signal.throwIfAborted();
  const privacyAddress = rawAddress.parse(address.rawAddress ?? address.address);
  expectedPrivacyAddress = address.address;
  await current();
  onStage('login');
  const challenge = await client.post(
    '/auth/challenge',
    { wallet_type: 'evm', wallet_address: account, chain_id: chainId },
    challengeSchema,
    signal,
  );
  await current();
  const signature = await wallet.signMessage(challenge.message, account);
  await current();
  const login = await client.post(
    '/auth/login',
    { wallet_type: 'evm', wallet_address: account, nonce: challenge.nonce, signature },
    loginSchema,
    signal,
  );
  const ownership = await client.post(
    '/privasea/whitelist/qualification/challenge',
    { privacy_address: privacyAddress },
    ownershipChallengeSchema,
    signal,
    login.access_token,
  );
  await current();
  onStage('proof');
  const proof = ownershipProofSchema.parse(
    await wallet.provePrivacyOwnership(ownership.message, privacyAddress),
  );
  await current();
  onStage('checking');
  const result = await client.post(
    '/privasea/whitelist/qualification/check',
    {
      privacy_address: privacyAddress,
      ownership_challenge: ownership.ownership_challenge,
      ownership_proof: proof,
    },
    qualificationSchema,
    signal,
    login.access_token,
  );
  await current();
  if (result.privacy_address.toLowerCase() !== privacyAddress.toLowerCase())
    throw new ApiError(
      'invalid-response',
      'The eligibility result belongs to a different privacy address.',
    );
  return result;
}
