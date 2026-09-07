'use client';

import React from 'react';
import { formatCurrency } from '../../lib/formatters';
import type { TopCatalogItemMetric } from '../../types/pos';
import { Scissors, Package, Flame } from 'lucide-react';

interface TopServicesProductsProps {
  topServices: TopCatalogItemMetric[];
  topProducts: TopCatalogItemMetric[];
}

export function TopServicesProducts({
  topServices,
  topProducts,
}: TopServicesProductsProps): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 1. Top Services */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-amber-500" />
              <span>Top 5 Layanan Jasa Terpopuler</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Layanan pangkas rambut dengan kontribusi omset tertinggi
            </p>
          </div>
          <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
            <Flame className="w-4 h-4" />
          </span>
        </div>

        <div className="space-y-3 my-1">
          {topServices.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 italic">
              Belum ada penjualan layanan pada periode ini.
            </div>
          ) : (
            topServices.map((svc, idx) => (
              <div key={svc.id || idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{svc.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({svc.quantitySold}x)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 font-mono">
                      {formatCurrency(svc.totalRevenue)}
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                      {svc.revenueSharePercent}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${svc.revenueSharePercent}%` }}
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 text-right text-xs text-slate-500">
          Total Omset Jasa:{' '}
          <b className="font-mono text-slate-900 font-bold">
            {formatCurrency(topServices.reduce((a, b) => a + b.totalRevenue, 0))}
          </b>
        </div>
      </div>

      {/* 2. Top Products */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-sky-500" />
              <span>Top 5 Produk Retail Terlaris</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Produk styling & perawatan dengan unit penjualan terbanyak
            </p>
          </div>
          <span className="p-1.5 rounded-lg bg-sky-50 text-sky-600">
            <Flame className="w-4 h-4" />
          </span>
        </div>

        <div className="space-y-3 my-1">
          {topProducts.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 italic">
              Belum ada penjualan produk retail pada periode ini.
            </div>
          ) : (
            topProducts.map((prd, idx) => (
              <div key={prd.id || idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{prd.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({prd.quantitySold} unit)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 font-mono">
                      {formatCurrency(prd.totalRevenue)}
                    </span>
                    <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
                      {prd.revenueSharePercent}%
                    </span>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                  <div
                    style={{ width: `${prd.revenueSharePercent}%` }}
                    className="h-full bg-sky-500 rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 text-right text-xs text-slate-500">
          Total Omset Retail:{' '}
          <b className="font-mono text-slate-900 font-bold">
            {formatCurrency(topProducts.reduce((a, b) => a + b.totalRevenue, 0))}
          </b>
        </div>
      </div>
    </div>
  );
}
