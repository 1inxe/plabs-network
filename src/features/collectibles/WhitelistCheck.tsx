import { Fingerprint } from 'lucide-react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { useWallet } from '@/features/wallet';
import {
  checkQualification,
  type Qualification,
  type QualificationStage,
} from '@/services/platform/qualification';
import { errorMessage } from '@/shared/api/errors';
import { createHttpClient } from '@/shared/api/http-client';
import { apiEndpoints } from '@/shared/config/env';
import { Badge } from '@/shared/ui';

const client = createHttpClient(apiEndpoints.platform);
const stageLabels: Record<QualificationStage, string> = {
  wallet: 'Checking your wallet connection…',
  address: 'Confirm privacy address in wallet…',
  login: 'Confirm sign-in in wallet…',
  proof: 'Approve ownership proof in wallet…',
  checking: 'Checking eligibility…',
};
export function WhitelistCheck() {
  const wallet = useWallet();
  const form = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState<{ account: string; chainId: number } | null>(null);
  const { account, chainId, privacyAddress, busy, readAuthorizationError } = wallet;
  useEffect(() => {
    if (!pending) return;
    if (pending.account !== account || pending.chainId !== chainId || readAuthorizationError) {
      setPending(null);
      return;
    }
    if (privacyAddress && !busy) {
      setPending(null);
      form.current?.requestSubmit();
    }
  }, [pending, account, chainId, privacyAddress, busy, readAuthorizationError]);
  return (
    <WhitelistForm
      key={`${account}:${chainId}:${privacyAddress}:${wallet.privacyExpiresAt}:${wallet.privacyScopes.join(',')}`}
      wallet={wallet}
      formRef={form}
      onUnlock={() => {
        setPending({ account, chainId });
        void wallet.authorizeRead(['address']);
      }}
    />
  );
}
function WhitelistForm({
  wallet,
  formRef,
  onUnlock,
}: {
  wallet: ReturnType<typeof useWallet>;
  formRef: RefObject<HTMLFormElement | null>;
  onUnlock: () => void;
}) {
  const [stage, setStage] = useState<QualificationStage | null>(null);
  const [result, setResult] = useState<Qualification | null>(null);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    setError('');
    setStage(null);
    request.current = null;
    if (!wallet.wallet) return;
    return () => {
      request.current?.abort();
    };
  }, [wallet.wallet]);
  const check = async () => {
    if (request.current) return;
    if (!wallet.wallet) {
      setError('PLabs Wallet is not connected. Connect your wallet to continue.');
      wallet.setModal(true);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setStage('wallet');
    setResult(null);
    setError('');
    try {
      const data = await checkQualification({
        client,
        wallet: wallet.wallet,
        account: wallet.account,
        chainId: wallet.chainId,
        signal: controller.signal,
        onStage: setStage,
      });
      if (!controller.signal.aborted) {
        setResult(data);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) {
        setStage(null);
        request.current = null;
      }
    }
  };
  return (
    <form
      id="whitelist-check-form"
      ref={formRef}
      className="whitelist-check"
      onSubmit={(event) => {
        event.preventDefault();
        formRef.current?.scrollIntoView({ block: 'nearest' });
        if (!wallet.account) {
          wallet.setModal(true);
          return;
        }
        if (!wallet.privacyAddress) {
          if (!wallet.busy) onUnlock();
          return;
        }
        void check();
      }}
    >
      <figure className="whitelist-artwork">
        <img
          src="/assets/jubjub-bird-icon.png"
          alt="JubJub Bird NFT artwork"
          width={132}
          height={132}
        />
        <figcaption>
          <span className="eyebrow">THE GENESIS COLLECTION</span>
          <strong>JubJub Bird</strong>
          <span>The first private NFT · pERC721</span>
          <span className="whitelist-artwork-note">Your beginning in a private world.</span>
        </figcaption>
      </figure>
      {result ? (
        <section className="whitelist-inline-result" role="status" aria-label="Whitelist result">
          <div className="whitelist-result-heading">
            <h3>
              {result.rewards.nft > 0
                ? 'You’re on the list.'
                : result.rewards.p20 > 0
                  ? 'A gift for you.'
                  : 'No allocation this time.'}
            </h3>
            <span>ELIGIBILITY CHECKED</span>
          </div>
          <dl>
            <div>
              <dt>
                JubJub Bird <small>NFT whitelist</small>
              </dt>
              <dd>
                <Badge tone={result.rewards.nft > 0 ? 'green' : 'gray'}>
                  {result.rewards.nft > 0
                    ? `${result.rewards.nft} ${result.rewards.nft === 1 ? 'spot' : 'spots'}`
                    : 'Ineligible'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>
                P20 <small>Token airdrop</small>
              </dt>
              <dd className={result.rewards.p20 > 0 ? 'text-green' : ''}>
                <strong>{result.rewards.p20.toLocaleString()}</strong>
                <span> P20</span>
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <p>
          Check your NFT whitelist spots and P20 allocation with your registered privacy wallet.
        </p>
      )}
      {!wallet.account ? (
        <button type="submit" className="primary-button w-full">
          Connect wallet to check
        </button>
      ) : !wallet.privacyAddress ? (
        <button type="submit" className="primary-button w-full" disabled={wallet.busy}>
          {wallet.busy ? 'Waiting for wallet…' : 'Unlock and check whitelist'}
        </button>
      ) : (
        <button type="submit" className="primary-button w-full" disabled={!!stage}>
          <Fingerprint aria-hidden="true" size={16} />
          {stage ? 'Checking…' : result ? 'Check again' : 'Check whitelist'}
        </button>
      )}
      {stage && <p role="status">{stageLabels[stage]}</p>}
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      {wallet.readAuthorizationError && !wallet.privacyAddress && (
        <p role="alert" className="text-red">
          {wallet.readAuthorizationError}
        </p>
      )}
      <dl className="whitelist-application">
        <div>
          <dt>Your privacy address</dt>
          <dd className="mono">
            {wallet.privacyAddress || 'Connect and unlock your privacy wallet'}
          </dd>
        </div>
        <div>
          <dt>Your X account</dt>
          <dd>
            {result?.twitter_handle
              ? `@${result.twitter_handle.replace(/^@/, '')}`
              : 'Available after checking'}
          </dd>
        </div>
      </dl>
    </form>
  );
}
