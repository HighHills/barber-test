'use client';

import React, { useState } from 'react';
import { formatCurrency } from '../../lib/formatters';
import type { RevenueTrendPoint } from '../../types/pos';
import { BarChart3, Scissors, Package } from 'lucide-react';

interface RevenueTrendChartProps {
  points: RevenueTrendPoint[];
}

export function RevenueTrendChart({ points }: RevenueTrendChartProps): React.JSX.Element {
  const [hoveredPoint, setHoveredPoint] = useState<RevenueTrendPoint | null>(null);

  // Maximum value for SVG vertical scaling
  const maxTotal = Math.max(...points.map((p) => p.totalAmount), 100000);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            <span>Tren Omset Penjualan (Jasa vs Produk Retail)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dinamika penerimaan harian terbagi antara pendapatan layanan pangkas dan retail
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-500" />
            <span className="text-slate-600 flex items-center gap-1">
              <Scissors className="w-3 h-3 text-amber-500" />
              Layanan Pangkas
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-sky-500" />
            <span className="text-slate-600 flex items-center gap-1">
              <Package className="w-3 h-3 text-sky-500" />
              Produk Retail
            </span>
          </div>
        </div>
      </div>

      {/* Chart Visual Container */}
      <div className="relative pt-6 pb-2 min-h-[260px] flex items-end">
        {points.length === 0 ? (
          <div className="w-full text-center py-12 text-slate-400 text-xs italic">
            Belum ada transaksi pada rentang periode yang dipilih.
          </div>
        ) : (
          <div className="w-full flex items-end justify-between gap-2 h-56 border-b border-slate-200 pb-2">
            {points.map((pt, idx) => {
              const serviceHeight = (pt.serviceAmount / maxTotal) * 100;
              const productHeight = (pt.productAmount / maxTotal) * 100;

              return (
                <div
                  key={pt.dateKey || idx}
                  className="flex-1 flex flex-col items-center h-full justify-end group relative cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(pt)}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  {/* Tooltip on Hover */}
                  {hoveredPoint?.dateKey === pt.dateKey && (
                    <div className="absolute -top-20 z-30 bg-slate-900 text-white rounded-xl px-3 py-2 text-xs shadow-xl border border-slate-700 min-w-[160px] pointer-events-none transform -translate-x-1/2 left-1/2">
                      <div className="font-bold text-amber-400 mb-1 border-b border-slate-700 pb-1">
                        {pt.dateLabel}
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Jasa:</span>
                        <span className="font-mono text-amber-300 font-bold">
                          {formatCurrency(pt.serviceAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Produk:</span>
                        <span className="font-mono text-sky-300 font-bold">
                          {formatCurrency(pt.productAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-white font-bold pt-1 border-t border-slate-700 mt-1">
                        <span>Total:</span>
                        <span className="font-mono">{formatCurrency(pt.totalAmount)}</span>
                      </div>
                    </div>
                  )}

                  {/* Stacked Bar */}
                  <div className="w-full max-w-[42px] flex flex-col justify-end rounded-t-lg overflow-hidden transition-all group-hover:opacity-90 group-hover:shadow-md">
                    {/* Product Portion (Top) */}
                    <div
                      style={{ height: `${Math.max(productHeight, 0)}%` }}
                      className="w-full bg-sky-500 transition-all duration-300"
                    />
                    {/* Service Portion (Bottom) */}
                    <div
                      style={{ height: `${Math.max(serviceHeight, 0)}%` }}
                      className="w-full bg-amber-500 transition-all duration-300"
                    />
                  </div>

                  {/* Date Label */}
                  <span className="text-[10px] font-medium text-slate-500 mt-2 truncate max-w-[48px] text-center">
                    {pt.dateLabel.split(',')[0]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          Rata-rata Harian:{' '}
          <b className="text-slate-800 font-mono">
            {formatCurrency(
              points.length > 0
                ? Math.round(points.reduce((a, b) => a + b.totalAmount, 0) / points.length)
                : 0
            )}
          </b>
        </span>
        <span>
          Total Periode:{' '}
          <b className="text-slate-900 font-mono font-bold">
            {formatCurrency(points.reduce((a, b) => a + b.totalAmount, 0))}
          </b>
        </span>
      </div>
    </div>
  );
}
