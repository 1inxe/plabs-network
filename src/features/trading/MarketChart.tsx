import type { UTCTimestamp } from 'lightweight-charts';
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import type { Candle } from '@/services/market';
export function MarketChart({
  candles,
  view,
  supply,
}: {
  candles: Candle[];
  view: string;
  supply: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#0d1218' },
        textColor: '#6e7c88',
        fontFamily: 'JetBrains Mono',
        fontSize: 10,
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#182028' }, horzLines: { color: '#182028' } },
      rightPriceScale: { borderColor: '#212a32' },
      timeScale: { borderColor: '#212a32', timeVisible: true },
      crosshair: { vertLine: { color: '#4edea3' }, horzLine: { color: '#4edea3' } },
    });
    const values = [...candles]
      .filter((c) =>
        [c.time, c.open, c.high, c.low, c.close, c.volume].every((v) => Number.isFinite(Number(v))),
      )
      .sort((a, b) => a.time - b.time)
      .filter((c, i, a) => !i || c.time !== a[i - 1]?.time);
    if (view === 'price' || !supply) {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#f45073',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#f45073',
        priceFormat: { type: 'price', precision: 6, minMove: 0.000001 },
      });
      s.setData(
        values.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      s.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.25 } });
    } else {
      const s = chart.addSeries(AreaSeries, {
        lineColor: '#4edea3',
        topColor: '#10b98144',
        bottomColor: '#10b98100',
      });
      s.setData(values.map((c) => ({ time: c.time as UTCTimestamp, value: c.close * supply })));
    }
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volume.setData(
      values.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: Number(c.close) >= Number(c.open) ? '#10b98155' : '#f4507355',
      })),
    );
    chart.timeScale().fitContent();
    if (values.length < 30)
      chart.timeScale().setVisibleLogicalRange({ from: values.length - 40, to: values.length + 3 });
    return () => chart.remove();
  }, [candles, view, supply]);
  return (
    <div role="img" className="market-chart" aria-label="Live P20 price candlestick chart">
      <div ref={el} className="market-chart-host" />
    </div>
  );
}
