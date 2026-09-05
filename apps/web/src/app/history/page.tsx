'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePos, PosProvider } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import type { CompletedSale } from '../../types/pos';
import { ReceiptModal } from '../../components/pos/receipt-modal';
import {
  ArrowLeft,
  Search,
  Printer,
  RefreshCw,
  FileText,
} from 'lucide-react';

function SalesHistoryContent(): React.JSX.Element {
  const { supabase, currentOutlet } = usePos();

  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [reprintSale, setReprintSale] = useState<CompletedSale | null>(null);

  const loadHistory = async () => {
    if (!currentOutlet) return;
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          id,
          invoice_number,
          outlet_id,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          status,
          sold_at,
          created_by,
          profiles!created_by(display_name),
          sale_items(
            description_snapshot,
            quantity,
            unit_price,
            total_amount,
            item_type,
            employees!barber_id(full_name)
          ),
          sale_payments(
            amount,
            reference_number,
            payment_methods(name)
          )
        `)
        .eq('outlet_id', currentOutlet.id)
        .order('sold_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSales(data || []);
    } catch (err) {
      console.error('Error fetching sales history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [currentOutlet]);

  const filteredSales = sales.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.invoice_number.toLowerCase().includes(q) ||
      s.profiles?.display_name?.toLowerCase().includes(q)
    );
  });

  const handleOpenReprint = (saleData: any) => {
    const sale: CompletedSale = {
      id: saleData.id,
      invoice_number: saleData.invoice_number,
      outlet_id: currentOutlet?.id || '',
      outlet_name: currentOutlet?.name || '',
      cashier_name: saleData.profiles?.display_name || 'Kasir',
      sold_at: saleData.sold_at,
      subtotal: Number(saleData.subtotal) || 0,
      discount_amount: Number(saleData.discount_amount) || 0,
      tax_amount: Number(saleData.tax_amount) || 0,
      total_amount: Number(saleData.total_amount) || 0,
      items: (saleData.sale_items || []).map((i: any) => ({
        description: i.description_snapshot,
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
        total_amount: Number(i.total_amount) || 0,
        item_type: i.item_type,
        barber_name: i.employees?.full_name,
      })),
      payments: (saleData.sale_payments || []).map((p: any) => ({
        method_name: p.payment_methods?.name || 'Pembayaran',
        amount: Number(p.amount) || 0,
        reference_number: p.reference_number || undefined,
      })),
    };
    setReprintSale(sale);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Kasir POS</span>
          </Link>

          <div>
            <h1 className="text-base font-bold text-white leading-tight">
              Riwayat Transaksi Penjualan
            </h1>
            <p className="text-xs text-amber-400">
              Outlet: {currentOutlet?.name || 'Semua Cabang'}
            </p>
          </div>
        </div>

        <button
          onClick={loadHistory}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
          title="Segarkan Riwayat"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Container */}
      <div className="p-6 max-w-6xl mx-auto w-full space-y-4 flex-1">
        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari no. invoice atau nama kasir..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Menampilkan <strong>{filteredSales.length}</strong> transaksi terakhir
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
              <span>Memuat data transaksi penjualan...</span>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600">Belum ada transaksi</p>
              <p className="text-slate-400 mt-0.5">Transaksi yang berhasil di-checkout akan muncul di sini.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                    <th className="py-3.5 px-4">No. Invoice</th>
                    <th className="py-3.5 px-4">Waktu Transaksi</th>
                    <th className="py-3.5 px-4">Kasir</th>
                    <th className="py-3.5 px-4">Total Tagihan</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        {sale.invoice_number}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {formatDateTime(sale.sold_at)}
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 font-medium">
                        {sale.profiles?.display_name || '-'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-950">
                        {formatCurrency(Number(sale.total_amount))}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            sale.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sale.status === 'PARTIALLY_REFUNDED'
                              ? 'bg-amber-100 text-amber-800'
                              : sale.status === 'REFUNDED'
                              ? 'bg-blue-100 text-blue-800'
                              : sale.status === 'VOIDED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleOpenReprint(sale)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Cetak Ulang Struk"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-500" />
                          <span>Cetak Struk</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Thermal Receipt Modal for Reprint */}
      {reprintSale && (
        <ReceiptModal
          sale={reprintSale}
          onNewTransaction={() => setReprintSale(null)}
          onClose={() => setReprintSale(null)}
        />
      )}
    </div>
  );
}

export default function HistoryPage(): React.JSX.Element {
  return (
    <PosProvider>
      <SalesHistoryContent />
    </PosProvider>
  );
}
