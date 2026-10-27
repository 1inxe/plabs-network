import type {
  DexOrderIntent,
  DexOrderSummary,
  DexOrders,
  NftAssetSnapshot,
  NftMintRequest,
  NftMintResult,
  PlabsCapabilities,
  PrivacyHistoryPage,
  PrivacyNotes,
  PrivacyOwnershipProof,
  PrivacyPageParams,
  PrivacyReadScope,
  PrivacySession,
  SponsoredPrivacyTransactionRequest,
  SponsoredPrivacyTransactionResult,
  WalletPortfolio,
} from 'plabs-js-sdk';

export type {
  DexOrderIntent,
  DexOrderSummary,
  DexOrders,
  NftAssetSnapshot,
  NftMintRequest,
  NftMintResult,
  PrivacyHistoryPage,
  PrivacyNotes,
  PrivacyOwnershipProof,
  PrivacyPageParams,
  PrivacyReadScope,
  PrivacySession,
  SponsoredPrivacyTransactionRequest,
  SponsoredPrivacyTransactionResult,
  WalletPortfolio,
};
export type WalletPool = {
  address: string;
  symbol: string;
  canShield: boolean;
  canUnshield: boolean;
  decimals?: number;
  underlying?: string;
};
export type WalletNetwork = {
  chainId: number;
  name: string;
  nativeSymbol: string;
  pools: WalletPool[];
};
export type Capabilities = Omit<PlabsCapabilities, 'methods'> & {
  methods: PlabsCapabilities['methods'] & { jubjubBidding?: boolean };
};
export type WalletSession = {
  accounts: string[];
  chainId: number;
  capabilities: Capabilities;
  privacy?: PrivacySession;
};
export type PrivacyIntent = {
  kind: 'shield' | 'send' | 'unshield';
  chainId: number;
  poolAddress: string;
  amount: string;
  recipient?: string;
};
export type OperationResult = {
  id: string;
  state: 'pending' | 'confirmed' | 'failed';
  txHash?: string;
  message?: string;
};
export interface WalletAdapter {
  capabilities?(): Promise<Capabilities>;
  mintNft?(request: NftMintRequest): Promise<NftMintResult>;
  resumeNftMint?(id: string): Promise<NftMintResult>;
  nftMints?(): Promise<NftMintResult[]>;
  nftAssets?(options?: { sync?: boolean }): Promise<NftAssetSnapshot>;
  sendSponsoredTransaction?(
    request: SponsoredPrivacyTransactionRequest,
  ): Promise<SponsoredPrivacyTransactionResult>;
  fundJubjubBid?(request: { intentId: string; token: string }): Promise<{
    intentId: string;
    state: 'pending' | 'confirmed' | 'failed';
    jobId?: string;
    txHash?: string;
    message?: string;
  }>;
  signMessage?(message: string, address: string): Promise<string>;
  provePrivacyOwnership?(message: string, privacyAddress: string): Promise<PrivacyOwnershipProof>;
  requestAccess?(scopes: PrivacyReadScope[]): Promise<PrivacySession>;
  revokeAccess?(): Promise<void>;
  balances?(): Promise<WalletPortfolio>;
  history?(params?: PrivacyPageParams): Promise<PrivacyHistoryPage>;
  notes?(params?: PrivacyPageParams): Promise<PrivacyNotes>;
  dexOrders?(): Promise<DexOrders>;
  importDexOrders?(): Promise<{ imported: number }>;
  placeDexOrder?(intent: DexOrderIntent): Promise<DexOrderSummary>;
  resumeDexOrder?(id: string): Promise<DexOrderSummary>;
  cancelDexOrder?(id: string): Promise<DexOrderSummary>;
  collectDexPayouts?(id: string): Promise<DexOrderSummary>;
  session(): Promise<WalletSession>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  open(): Promise<void>;
  privacyAddress(): Promise<{ address: string; rawAddress?: string; chainId: number }>;
  switchChain(chainId: number): Promise<void>;
  transact(intent: PrivacyIntent): Promise<OperationResult>;
  transactionStatus(id: string): Promise<OperationResult>;
  subscribe(
    onContextChanged: () => void,
    onDisconnect: () => void,
    onPrivacyChanged?: (event?: { unlocked?: boolean }) => void,
  ): () => void;
}
