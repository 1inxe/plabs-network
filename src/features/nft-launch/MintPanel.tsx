import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Gem } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useWallet } from '@/features/wallet';
import { errorMessage } from '@/shared/api/errors';
import { useNftWalletCapabilities } from './useNftWalletCapabilities';

export const mintSchema = z.object({
  id: z.string().uuid(),
  chainId: z.literal(1),
  poolAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
  name: z.string(),
  symbol: z.string(),
  tokenId: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .optional(),
  state: z.enum(['pending', 'confirmed', 'failed']),
  stage: z.string(),
  createdAt: z.number().int().nonnegative(),
  txHash: z
    .string()
    .regex(/^0x[0-9a-f]{64}$/)
    .optional(),
  canResume: z.boolean(),
  message: z.string().optional(),
});
type Mint = z.infer<typeof mintSchema>;
const stages: Record<string, string> = {
  reserving: 'Reserving your NFT',
  authorizing: 'Authorizing your allocation',
  proving: 'Generating your private NFT proof',
  permit: 'Preparing the mint permit',
  approval: 'Confirm the transaction in PLabs Wallet',
  confirming: 'Waiting for Ethereum confirmation',
  confirmed: 'Mint confirmed',
  reverted: 'Transaction reverted',
  expired: 'Reservation expired',
  rejected: 'Reservation rejected',
};
export function MintPanel({
  pool,
  canMint,
  onChanged,
}: {
  pool: string;
  canMint: boolean;
  onChanged: () => void;
}) {
  const wallet = useWallet();
  return (
    <MintForm
      key={`${pool}:${wallet.account}:${wallet.chainId}:${wallet.privacyAddress}:${wallet.privacyExpiresAt}:${wallet.privacyScopes.join(',')}`}
      pool={pool}
      canMint={canMint}
      wallet={wallet}
      onChanged={onChanged}
    />
  );
}
function MintForm({
  pool,
  canMint,
  wallet,
  onChanged,
}: {
  pool: string;
  canMint: boolean;
  wallet: ReturnType<typeof useWallet>;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [latest, setLatest] = useState<Mint | null>(null);
  const active = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const liveCapabilities = useNftWalletCapabilities();
  const supported = wallet.capabilities?.methods.nftMinting === true;
  const enabled = !!wallet.account && wallet.chainId === 1 && !!wallet.privacyAddress && supported;
  const key = [
    'nft',
    'my-mints',
    wallet.account,
    wallet.chainId,
    wallet.privacyAddress,
    wallet.privacyExpiresAt,
  ];
  const mints = useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await wallet.wallet?.nftMints?.();
      return z.array(mintSchema).parse(data);
    },
    enabled,
    refetchInterval: 6000,
    retry: false,
    gcTime: 0,
  });
  const rows = (mints.data ?? [])
    .filter((row) => row.poolAddress === pool)
    .sort((a, b) => b.createdAt - a.createdAt);
  const pending = rows.find((row) => row.state === 'pending');
  const last =
    latest && (!rows[0] || latest.createdAt >= rows[0].createdAt)
      ? (rows.find((row) => row.id === latest.id) ?? latest)
      : rows[0];
  const start = async (id?: string) => {
    if (submitting.current || !wallet.wallet) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const session = await wallet.wallet.session();
      if (
        session.accounts[0]?.toLowerCase() !== wallet.account.toLowerCase() ||
        session.chainId !== 1 ||
        !session.capabilities.methods.nftMinting ||
        session.privacy?.address !== wallet.privacyAddress
      )
        throw new Error(
          'Your wallet changed. Refresh and retry with your original privacy wallet.',
        );
      const value = id
        ? await wallet.wallet.resumeNftMint?.(id)
        : await wallet.wallet.mintNft?.({ chainId: 1, poolAddress: pool });
      const parsed = mintSchema.safeParse(value);
      if (!parsed.success)
        throw new Error(
          'Your wallet returned an unreadable mint status. Check the original request in PLabs Wallet.',
        );
      const result = parsed.data;
      if (result.poolAddress !== pool || (id && result.id !== id))
        throw new Error('The mint response belongs to another request.');
      if (active.current) {
        setLatest(result);
        onChanged();
        await mints.refetch();
        void queryClient.invalidateQueries({ queryKey: ['nft', 'pool', pool] });
      }
    } catch (cause) {
      if (active.current) {
        setError(errorMessage(cause));
        void mints.refetch();
      }
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  };
  const action = async () => {
    if (!wallet.account) {
      wallet.setModal(true);
      return;
    }
    if (wallet.chainId !== 1) {
      await wallet.switchChain(1);
      return;
    }
    if (!wallet.privacyAddress) {
      await wallet.authorizeRead(['address']);
      return;
    }
    void start(pending?.id);
  };
  return (
    <div className="nft-mint-panel">
      {wallet.account && !supported ? (
        <div className="nft-wallet-support" role="status">
          <p className="muted-text">
            {liveCapabilities.isFetching
              ? 'Checking wallet mint support…'
              : liveCapabilities.isError
                ? errorMessage(liveCapabilities.error)
                : `The connected wallet${wallet.capabilities?.walletVersion ? ` (${wallet.capabilities.walletVersion})` : ''} does not report NFT mint support.`}
          </p>
          {!liveCapabilities.isFetching && !liveCapabilities.isError && (
            <p className="muted-text">
              Load PLabs Wallet 0.8.2 or newer, then reload the extension and check again.
            </p>
          )}
          {!supported && !liveCapabilities.isFetching && (
            <a
              className="text-link"
              href="https://github.com/1inxe/plabs-wallet/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              Download latest wallet <ExternalLink size={12} />
            </a>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={liveCapabilities.isFetching}
            onClick={() => void liveCapabilities.refetch()}
          >
            {liveCapabilities.isFetching ? 'Checking wallet…' : 'Check wallet again'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="primary-button"
          disabled={
            busy ||
            wallet.busy ||
            (enabled && !pending && (!canMint || mints.isPending || mints.isError))
          }
          onClick={() => void action()}
        >
          <Gem aria-hidden="true" size={15} />
          {busy
            ? 'Continue in PLabs Wallet…'
            : !wallet.account
              ? 'Connect wallet to mint'
              : wallet.chainId !== 1
                ? 'Switch to Ethereum to mint'
                : !wallet.privacyAddress
                  ? 'Unlock wallet to mint'
                  : pending
                    ? pending.txHash
                      ? 'Check mint status'
                      : 'Resume mint'
                    : !canMint
                      ? 'Mint unavailable'
                      : 'Mint NFT'}
        </button>
      )}
      {enabled && mints.isError && (
        <div role="alert">
          <p className="text-red">
            Your saved mints could not be checked. Refresh before starting another mint.
          </p>
          <button type="button" className="text-button" onClick={() => void mints.refetch()}>
            Retry saved mints
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="muted-text">
          Approve the mint, then confirm the ETH network fee in your wallet. Keep this page open
          while the proof is prepared.
        </p>
      )}
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      {last && (
        <div
          className={`nft-allocation-result ${last.state === 'failed' ? 'is-expired' : ''}`}
          role="status"
        >
          <strong>
            {stages[last.stage] ?? 'Mint needs attention'}
            {last.tokenId ? ` · #${last.tokenId}` : ''}
          </strong>
          <span>{last.message ?? 'Your original mint is saved in PLabs Wallet.'}</span>
          {last.txHash && (
            <a
              className="text-link"
              href={`https://etherscan.io/tx/${last.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      <p className="nft-launch-handoff">Free mint. Ethereum network fees are paid in ETH.</p>
    </div>
  );
}
