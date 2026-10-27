import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWallet } from '@/features/wallet';

export function useNftWalletCapabilities() {
  const wallet = useWallet();
  const result = useQuery({
    queryKey: ['wallet', 'nft-capabilities', wallet.account, wallet.chainId],
    queryFn: wallet.refreshCapabilities,
    enabled: !!wallet.account,
    refetchOnWindowFocus: 'always',
    retry: false,
    gcTime: 0,
  });
  const { refetch } = result;
  useEffect(() => {
    if (!wallet.account) return;
    const refresh = () => {
      void refetch();
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [wallet.account, refetch]);
  return result;
}
