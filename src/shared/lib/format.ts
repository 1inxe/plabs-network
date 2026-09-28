export const compact = (n: number) =>
  Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
export const short = (s: string) => (s.length > 20 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
export function validAmount(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) && /[1-9]/.test(value) && value.length <= 80;
}
export function explorerUrl(chainId: number, value: string) {
  const base =
    chainId === 1 ? 'https://etherscan.io' : chainId === 143 ? 'https://monadscan.com' : null;
  if (!base || !/^0x(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(value)) return null;
  return `${base}/${value.length === 66 ? 'tx' : 'address'}/${value}`;
}
export function csvCell(value: string) {
  const safe = /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Exact unit formatting for balances; never converts monetary quantities to Number. */
export function formatRaw(raw: string | null | undefined, decimals: number) {
  if (raw == null) return '—';
  if (!/^\d+$/.test(raw) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36)
    return '—';
  const padded = raw.padStart(decimals + 1, '0');
  const whole = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : '';
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}
