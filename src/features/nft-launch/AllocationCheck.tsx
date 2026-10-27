import { Fingerprint } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { useWallet } from '@/features/wallet';
import {
  createNftLaunchService,
  NFT_CHAIN_ID,
  type NftAllocation,
} from '@/services/platform/nft-launch';
import { errorMessage } from '@/shared/api/errors';
import { apiEndpoints } from '@/shared/config/env';

const service = createNftLaunchService(apiEndpoints.nft);
const labels = {
  wallet: 'Checking wallet…',
  proof: 'Approve ownership proof in PLabs Wallet…',
  checking: 'Checking allocation…',
};
export function AllocationCheck({ pool }: { pool: string }) {
  const wallet = useWallet();
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState<{ account: string; chainId: number } | null>(null);
  useEffect(() => {
    if (!pending) return;
    if (
      pending.account !== wallet.account ||
      pending.chainId !== wallet.chainId ||
      wallet.readAuthorizationError
    ) {
      setPending(null);
    } else if (wallet.privacyAddress && !wallet.busy) {
      setPending(null);
      form.current?.requestSubmit();
    }
  }, [
    pending,
    wallet.account,
    wallet.chainId,
    wallet.readAuthorizationError,
    wallet.privacyAddress,
    wallet.busy,
  ]);
  return (
    <AllocationForm
      key={`${pool}:${wallet.account}:${wallet.chainId}:${wallet.privacyAddress}:${wallet.privacyExpiresAt}:${wallet.privacyScopes.join(',')}`}
      pool={pool}
      wallet={wallet}
      formRef={form}
      onUnlock={() => {
        setPending({ account: wallet.account, chainId: wallet.chainId });
        void wallet.authorizeRead(['address']);
      }}
    />
  );
}

function AllocationForm({
  pool,
  wallet,
  formRef,
  onUnlock,
}: {
  pool: string;
  wallet: ReturnType<typeof useWallet>;
  formRef: RefObject<HTMLFormElement | null>;
  onUnlock: () => void;
}) {
  const [result, setResult] = useState<NftAllocation | null>(null);
  const [stage, setStage] = useState<keyof typeof labels | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setResult(null);
    setError('');
    setStage(null);
    setCheckedAt(0);
    request.current = null;
    if (!wallet.wallet) return;
    return () => {
      request.current?.abort();
    };
  }, [wallet.wallet]);
  useEffect(() => {
    if (!checkedAt) return;
    const timer = window.setTimeout(
      () => setExpired(true),
      Math.max(0, checkedAt + 60_000 - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [checkedAt]);
  const check = async () => {
    if (request.current || !wallet.wallet) return;
    const controller = new AbortController();
    request.current = controller;
    setError('');
    setResult(null);
    setStage('wallet');
    try {
      const allocation = await service.checkAllocation({
        pool,
        wallet: wallet.wallet,
        account: wallet.account,
        signal: controller.signal,
        onStage: setStage,
      });
      if (!controller.signal.aborted) {
        setResult(allocation);
        setCheckedAt(Date.now());
        setExpired(false);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setStage(null);
      }
    }
  };
  return (
    <form
      ref={formRef}
      className="nft-allocation"
      onSubmit={(event) => {
        event.preventDefault();
        if (!wallet.account) {
          wallet.setModal(true);
          return;
        }
        if (wallet.chainId !== NFT_CHAIN_ID) return;
        if (!wallet.privacyAddress) {
          if (!wallet.busy) onUnlock();
          return;
        }
        void check();
      }}
    >
      {wallet.account && wallet.chainId !== NFT_CHAIN_ID ? (
        <button
          type="button"
          className="secondary-button"
          disabled={wallet.busy}
          onClick={() => void wallet.switchChain(NFT_CHAIN_ID)}
        >
          Switch to Ethereum
        </button>
      ) : (
        <button type="submit" className="secondary-button" disabled={!!stage || wallet.busy}>
          <Fingerprint aria-hidden="true" size={15} />
          {stage
            ? 'Checking…'
            : !wallet.account
              ? 'Connect to check allocation'
              : !wallet.privacyAddress
                ? 'Unlock and check allocation'
                : result
                  ? 'Check allocation again'
                  : 'Check allocation'}
        </button>
      )}
      {stage && <p role="status">{labels[stage]}</p>}
      {(error || wallet.readAuthorizationError) && (
        <p className="text-red" role="alert">
          {error || wallet.readAuthorizationError}
        </p>
      )}
      {result && (
        <div className={`nft-allocation-result ${expired ? 'is-expired' : ''}`} role="status">
          <strong>
            {expired
              ? 'Allocation needs a refresh'
              : !result.enabled
                ? 'Public mint'
                : !result.eligible
                  ? 'No allocation for this privacy wallet'
                  : result.remaining < 1
                    ? 'Allocation used'
                    : `${result.remaining} ${result.remaining === 1 ? 'mint' : 'mints'} available`}
          </strong>
          <span>
            {expired
              ? 'Check again for your latest available mints.'
              : result.enabled && result.eligible
                ? `${result.minted} minted · ${result.reserved} reserved · ${result.allowance} total allocation`
                : 'Checked against your connected privacy wallet.'}
          </span>
        </div>
      )}
    </form>
  );
}
