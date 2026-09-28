import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useWallet } from '@/features/wallet';
import { formatRaw } from '@/shared/lib/format';
import type { GatewayValues } from './schema';
import { gatewaySchema } from './schema';
export function useGatewayForm(initialMode: GatewayValues['mode']) {
  const wallet = useWallet();
  const form = useForm<GatewayValues>({
    resolver: zodResolver(gatewaySchema),
    mode: 'onChange',
    defaultValues: { mode: initialMode, amount: '', recipient: '', pool: '' },
  });
  const { mode, amount, pool, recipient } = form.watch();
  const [reviewed, setReviewed] = useState('');
  const network = wallet.capabilities?.networks.find((n) => n.chainId === wallet.chainId);
  const pools =
    network?.pools.filter((p) =>
      mode === 'shield' ? p.canShield : mode === 'unshield' ? p.canUnshield : true,
    ) ?? [];
  const selected = pools.find((p) => p.address === pool) ?? pools[0];
  const privateBalance = wallet.portfolio?.private.assets.find(
    (asset) => asset.poolAddress.toLowerCase() === selected?.address.toLowerCase(),
  );
  const publicBalance = wallet.portfolio?.public.assets.find(
    (asset) => asset.address?.toLowerCase() === selected?.underlying?.toLowerCase(),
  );
  const available = mode === 'shield' ? publicBalance?.balanceRaw : privateBalance?.spendableRaw;
  const balanceDecimals = mode === 'shield' ? publicBalance?.decimals : privateBalance?.decimals;
  const fingerprint = JSON.stringify([
    wallet.account,
    wallet.chainId,
    mode,
    amount,
    selected?.address,
    recipient,
  ]);
  const review = reviewed === fingerprint;
  const canSubmit =
    gatewaySchema.safeParse({ mode, amount, pool, recipient }).success &&
    !!selected &&
    !!wallet.capabilities?.methods.privacyTransactions &&
    (selected?.decimals === undefined || (amount.split('.')[1]?.length ?? 0) <= selected.decimals);
  async function submit() {
    if (!wallet.account) {
      wallet.setModal(true);
      return;
    }
    await form.handleSubmit(async (values) => {
      if (!selected || !canSubmit) return;
      if (!review) {
        setReviewed(fingerprint);
        return;
      }
      const r = await wallet.transact(
        values.mode,
        selected.address,
        values.amount,
        selected.symbol,
        values.recipient,
      );
      if (r) {
        setReviewed('');
        form.setValue('amount', '');
      }
    })();
  }
  const setValue = (key: keyof GatewayValues, value: string) => {
    form.setValue(key, value, { shouldValidate: true });
  };
  return {
    w: wallet,
    form,
    mode,
    amount,
    pool,
    recipient,
    review,
    network,
    pools,
    selected,
    canSubmit,
    outputSymbol:
      mode === 'unshield'
        ? (publicBalance?.symbol ?? selected?.symbol.replace(/^s(?=[A-Z])/, '') ?? 'Public asset')
        : (selected?.symbol ?? 'Private asset'),
    precisionError:
      selected?.decimals !== undefined && (amount.split('.')[1]?.length ?? 0) > selected.decimals
        ? `This asset supports up to ${selected.decimals} decimal places.`
        : null,
    availableLabel:
      available != null && balanceDecimals !== undefined
        ? formatRaw(available, balanceDecimals)
        : null,
    setPercentage: (percentage: number) => {
      if (available != null && balanceDecimals !== undefined) {
        form.setValue(
          'amount',
          formatRaw(((BigInt(available) * BigInt(percentage)) / 100n).toString(), balanceDecimals),
          { shouldValidate: true },
        );
      }
    },
    submit,
    setMode: (v: GatewayValues['mode']) => setValue('mode', v),
    setAmount: (v: string) => setValue('amount', v),
    setPool: (v: string) => setValue('pool', v),
    setRecipient: (v: string) => setValue('recipient', v),
  };
}
