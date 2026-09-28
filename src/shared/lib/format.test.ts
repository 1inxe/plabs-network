import { describe, expect, it } from 'vitest';
import { compact, csvCell, explorerUrl, short, validAmount } from './format';

describe('Financial display boundaries', () => {
  it.each(['0', '-1', '+1', '1e18', '1,000', 'Infinity', 'NaN', '0.0000000000000000001', '01', ''])(
    'rejects invalid intent amount %s',
    (value) => expect(validAmount(value)).toBe(false),
  );
  it.each(['1', '100000000000000000000', '0.000000000000000001', '0.1'])(
    'preserves exact decimal amount %s',
    (value) => expect(validAmount(value)).toBe(true),
  );
  it('formats display values without changing transaction amounts', () => {
    expect(compact(1000000)).toBe('1M');
    expect(short('123')).toBe('123');
    expect(short('a'.repeat(40))).toBe('aaaaaaaa…aaaaaa');
  });
  it('permits only known explorer networks and validated public identifiers', () => {
    expect(explorerUrl(143, `0x${'a'.repeat(64)}`)).toContain('monadscan.com/tx/');
    expect(explorerUrl(1, `0x${'b'.repeat(40)}`)).toContain('etherscan.io/address/');
    expect(explorerUrl(0, `0x${'a'.repeat(64)}`)).toBeNull();
    expect(explorerUrl(143, 'javascript:alert(1)')).toBeNull();
  });
  it('quotes CSV cells and blocks formula injection', () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('=IMPORTXML("url")')).toBe('"\'=IMPORTXML(""url"")"');
    expect(csvCell('123')).toBe('"123"');
  });
});

it('formats full-precision token balances without floating point', async () => {
  const { formatRaw } = await import('./format');
  expect(formatRaw('9007199254740993123', 18)).toBe('9.007199254740993123');
  expect(formatRaw('1000000', 6)).toBe('1');
  expect(formatRaw('0', 6)).toBe('0');
  expect(formatRaw('12', 0)).toBe('12');
  expect(formatRaw(null, 6)).toBe('—');
  expect(formatRaw('invalid', 6)).toBe('—');
});
