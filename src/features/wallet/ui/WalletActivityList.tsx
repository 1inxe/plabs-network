import { ArrowDownLeft, ArrowUpRight, Layers3, LockKeyhole, Shield, Unlock } from 'lucide-react';
import type { PrivacyHistoryPage } from '@/services/wallet';
import { activityLabels } from '@/shared/config/product';
import { explorerUrl, formatRaw, short } from '@/shared/lib/format';
import { Badge, CopyButton } from '@/shared/ui';

const icons = {
  send: ArrowUpRight,
  receive: ArrowDownLeft,
  shield: Shield,
  unshield: Unlock,
  merge: Layers3,
  unknown: LockKeyhole,
};
export function WalletActivityList({ items }: { items: PrivacyHistoryPage['items'] }) {
  return (
    <ul className="wallet-activity-list" aria-label="Wallet transactions">
      {items.map((row) => {
        const Icon = icons[row.kind],
          link = row.txHash ? explorerUrl(row.chainId, row.txHash) : null;
        return (
          <li key={row.id} className="wallet-activity-item">
            <div className={`wallet-activity-icon ${row.kind}`}>
              <Icon aria-hidden="true" size={17} />
            </div>
            <div className="wallet-activity-info">
              <div className="wallet-activity-title">
                <strong>{activityLabels[row.kind]}</strong>
                <span className="wallet-activity-amount">
                  {formatRaw(row.amountRaw, row.decimals)} {row.symbol}
                </span>
              </div>
              <div className="wallet-activity-meta">
                <time>
                  {row.createdAt
                    ? new Date(row.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : row.blockNumber
                      ? `Block ${row.blockNumber}`
                      : 'Time unavailable'}
                </time>
                <Badge
                  tone={
                    row.status === 'confirmed' ? 'green' : row.status === 'failed' ? 'red' : 'amber'
                  }
                >
                  {row.status}
                </Badge>
              </div>
              {row.txHash && (
                <div className="wallet-activity-hash">
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer">
                      {short(row.txHash)}
                      <ArrowUpRight aria-hidden="true" size={11} />
                    </a>
                  ) : (
                    <span>{short(row.txHash)}</span>
                  )}
                  <CopyButton value={row.txHash} />
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
