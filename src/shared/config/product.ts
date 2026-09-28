/** Product names describe available actions; protocol method names remain unchanged. */
export const assetModes = {
  shield: {
    query: 'deposit',
    label: 'Deposit',
    description:
      'Move public tokens into a privacy pool. The deposit remains visible on the public chain.',
  },
  send: {
    query: 'transfer',
    label: 'Private transfer',
    description: 'Send private assets to a perc1 privacy address.',
  },
  unshield: {
    query: 'withdraw',
    label: 'Withdraw',
    description:
      'Return private assets to your public wallet. The withdrawal is visible on the public chain.',
  },
} as const;
export type AssetMode = keyof typeof assetModes;
export function assetModeFromQuery(query: string | null): AssetMode {
  return (
    (Object.keys(assetModes) as AssetMode[]).find((mode) => assetModes[mode].query === query) ??
    'shield'
  );
}
export const assetRoute = (mode: AssetMode) => `/assets?mode=${assetModes[mode].query}`;
export const activityLabels = {
  shield: 'Deposit',
  send: 'Private transfer',
  unshield: 'Withdrawal',
  receive: 'Received note',
  merge: 'Note consolidation',
  unknown: 'Wallet activity',
} as const;
export const unavailableFeatures = {
  tokenLaunch: 'Token creation is not available in this app yet.',
  nftRegistration: 'Allowlist registration is not available in this app yet.',
  nftHoldings: 'Private NFT holdings are not available in this app yet.',
} as const;
