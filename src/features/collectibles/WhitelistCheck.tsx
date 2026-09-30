import { Fingerprint } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/features/wallet';
import {
  checkQualification,
  type Qualification,
  type QualificationStage,
} from '@/services/platform/qualification';
import { errorMessage } from '@/shared/api/errors';
import { createHttpClient } from '@/shared/api/http-client';
import { apiEndpoints } from '@/shared/config/env';
import { Badge, ExternalLink } from '@/shared/ui';

const client = createHttpClient(apiEndpoints.platform);
const stageLabels: Record<QualificationStage, string> = {
  address: 'Confirm privacy address in wallet…',
  login: 'Confirm sign-in in wallet…',
  proof: 'Approve ownership proof in wallet…',
  checking: 'Checking eligibility…',
};
export function WhitelistCheck() {
  const wallet = useWallet();
  return (
    <WhitelistForm
      key={`${wallet.account}:${wallet.chainId}:${wallet.privacyAddress}:${wallet.privacyExpiresAt}:${wallet.privacyScopes.join(',')}`}
      wallet={wallet}
    />
  );
}
function WhitelistForm({ wallet }: { wallet: ReturnType<typeof useWallet> }) {
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
    if (request.current || !wallet.wallet) return;
    const controller = new AbortController();
    request.current = controller;
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
      if (!controller.signal.aborted) setResult(data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    } finally {
      if (!controller.signal.aborted) {
        setStage(null);
        request.current = null;
      }
    }
  };
  const supported = wallet.capabilities?.methods.privacyOwnership;
  return (
    <div className="whitelist-check">
      <p>
        Check your JubJub Bird spots and P20 airdrop allocation with your registered privacy wallet.
      </p>
      {!wallet.account ? (
        <button
          type="button"
          className="primary-button w-full"
          onClick={() => wallet.setModal(true)}
        >
          Connect wallet to check
        </button>
      ) : !supported ? (
        <>
          <p>Update PLabs Wallet to enable ownership verification.</p>
          <ExternalLink href="https://app.plabs.online/privasea/whitelist">
            Check on PLabs
          </ExternalLink>
        </>
      ) : !wallet.privacyAddress ? (
        <button
          type="button"
          className="primary-button w-full"
          disabled={wallet.busy}
          onClick={() => void wallet.authorizeRead(['address'])}
        >
          Unlock privacy address to check
        </button>
      ) : (
        <button
          type="button"
          className="primary-button w-full"
          disabled={!!stage || wallet.busy}
          onClick={() => void check()}
        >
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
      {result && (
        <div className="whitelist-result" role="status">
          <h3>
            {result.rewards.nft > 0
              ? 'Congratulations!'
              : result.rewards.p20 > 0
                ? 'You have a P20 allocation'
                : 'No allocation found'}
          </h3>
          <dl>
            <div>
              <dt>JubJub Bird</dt>
              <dd>
                <Badge tone={result.rewards.nft > 0 ? 'green' : 'gray'}>
                  {result.rewards.nft > 0
                    ? `${result.rewards.nft} ${result.rewards.nft === 1 ? 'spot' : 'spots'}`
                    : 'Ineligible'}
                </Badge>
              </dd>
            </div>
            <div>
              <dt>P20 airdrop</dt>
              <dd>{result.rewards.p20.toLocaleString()} P20</dd>
            </div>
            <div>
              <dt>X account</dt>
              <dd>{result.twitter_handle ? `@${result.twitter_handle.replace(/^@/, '')}` : '—'}</dd>
            </div>
          </dl>
          <p className="mono whitelist-address">{wallet.privacyAddress}</p>
        </div>
      )}
    </div>
  );
}
