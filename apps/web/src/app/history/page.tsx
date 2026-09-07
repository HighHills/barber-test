'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePos, PosProvider } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import type { CompletedSale, VoidSaleResult, ProcessRefundResult } from '../../types/pos';
import { ReceiptModal } from '../../components/pos/receipt-modal';
import { VoidSaleModal } from '../../components/pos/void-sale-modal';
import { RefundSaleModal } from '../../components/pos/refund-sale-modal';
import {
  ArrowLeft,
  Search,
  Printer,
  RefreshCw,
  FileText,
  RotateCcw,
  Ban,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Package,
  Scissors,
  Coins,
  BarChart3,
  Users,
  TrendingUp,
  X,
} from 'lucide-react';

function SalesHistoryContent(): React.JSX.Element {
  const { supabase, currentOutlet, isCashier } = usePos();

  const PAGE_SIZE = 50;

  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');

  // Modals & actions
  const [reprintSale, setReprintSale] = useState<CompletedSale | null>(null);
  const [voidSaleTarget, setVoidSaleTarget] = useState<any | null>(null);
  const [refundSaleTarget, setRefundSaleTarget] = useState<any | null>(null);
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Success/error notification banner
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const loadHistory = async (reset: boolean = true, existingCount: number = 0) => {
    if (!currentOutlet) return;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const offset = reset ? 0 : existingCount;
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
          customer_id,
          customers!customer_id(
            id,
            full_name,
            phone,
            current_loyalty_points,
            customer_tiers(name)
          ),
          profiles!created_by(display_name),
          sale_items(
            id,
            description_snapshot,
            quantity,
            unit_price,
            item_discount_amount,
            allocated_discount_amount,
            tax_amount,
            total_amount,
            item_type,
            cost_price,
            product_id,
            service_id,
            barber_id,
            employees!barber_id(full_name)
          ),
          sale_payments(
            amount,
            reference_number,
            payment_methods(name)
          ),
          sale_refunds(
            id,
            refund_number,
            refund_type,
            subtotal,
            discount_amount,
            tax_amount,
            total_amount,
            status,
            reason,
            refunded_at,
            profiles!created_by(display_name),
            sale_refund_items(
              id,
              sale_item_id,
              quantity,
              refund_amount,
              tax_amount,
              return_to_inventory,
              reason
            ),
            sale_refund_payments(
              amount,
              payment_methods(name)
            )
          )
        `)
        .eq('outlet_id', currentOutlet.id)
        .order('sold_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      const rows = data || [];
      if (reset) {
        setSales(rows);
      } else {
        setSales((prev) => [...prev, ...rows]);
      }
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching sales history:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadHistory(true);
  }, [currentOutlet]);

  const filteredSales = sales.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const custName = s.customers?.full_name?.toLowerCase() || '';
    const custPhone = s.customers?.phone?.toLowerCase() || '';
    return (
      s.invoice_number?.toLowerCase().includes(q) ||
      s.profiles?.display_name?.toLowerCase().includes(q) ||
      custName.includes(q) ||
      custPhone.includes(q)
    );
  });

  const handleOpenReprint = (saleData: any) => {
    const custObj = saleData.customers;
    const tierObj = Array.isArray(custObj?.customer_tiers)
      ? custObj?.customer_tiers[0]
      : custObj?.customer_tiers;

    const sale: CompletedSale = {
      id: saleData.id,
      invoice_number: saleData.invoice_number,
      outlet_id: currentOutlet?.id || '',
      outlet_name: currentOutlet?.name || '',
      cashier_name: saleData.profiles?.display_name || 'Kasir',
      customer_name: custObj?.full_name || undefined,
      customer_id: custObj?.id || null,
      customer_phone: custObj?.phone || null,
      customer_tier: tierObj?.name || null,
      customer_points: custObj?.current_loyalty_points ?? null,
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

  const handleVoidSuccess = (_result: VoidSaleResult) => {
    setFeedback({
      type: 'success',
      message: `Nota ${voidSaleTarget?.invoice_number} berhasil di-VOID (dibatalkan). Jurnal pembalik otomatis diterbitkan.`,
    });
    setVoidSaleTarget(null);
    loadHistory(true);
  };

  const handleRefundSuccess = (result: ProcessRefundResult) => {
    setFeedback({
      type: 'success',
      message: `Pengembalian dana untuk nota ${refundSaleTarget?.invoice_number} berhasil diproses. Status nota: ${result.sale_status}.`,
    });
    setRefundSaleTarget(null);
    loadHistory(true);
  };

  const toggleExpand = (saleId: string) => {
    setExpandedSaleId((prev) => (prev === saleId ? null : saleId));
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
            <span>Kasir POS</span>
          </Link>

          <Link
            href="/queue"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <Scissors className="w-4 h-4 text-amber-400" />
            <span>Antrean</span>
          </Link>

          <Link
            href="/inventory"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <Package className="w-4 h-4 text-amber-400" />
            <span>Inventori</span>
          </Link>

          <Link
            href="/commissions"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <Coins className="w-4 h-4 text-amber-400" />
            <span>Komisi</span>
          </Link>

          <Link
            href="/customers"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <Users className="w-4 h-4 text-purple-400" />
            <span>Pelanggan</span>
          </Link>

          {/* OWNER ONLY */}
          {!isCashier && (
            <>
              <Link
                href="/accounting"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
              >
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Keuangan</span>
              </Link>

              <Link
                href="/analytics"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
              >
                <TrendingUp className="w-4 h-4 text-amber-400" />
                <span>Analitik</span>
              </Link>
            </>
          )}

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
          onClick={() => loadHistory(true)}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
          title="Segarkan Riwayat"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {/* Main Container */}
      <div className="p-6 max-w-6xl mx-auto w-full space-y-4 flex-1">
        {/* Feedback Alert Banner */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-xs font-semibold animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

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
                    <th className="py-3.5 px-4 text-right">Aksi Operasional</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredSales.map((sale) => {
                    const isCompleted = sale.status === 'COMPLETED';
                    const isPartiallyRefunded = sale.status === 'PARTIALLY_REFUNDED';
                    const isRefunded = sale.status === 'REFUNDED';
                    const isVoided = sale.status === 'VOIDED';

                    const completedRefunds = (sale.sale_refunds || []).filter(
                      (r: any) => r.status === 'COMPLETED'
                    );
                    const totalRefundedAmount = completedRefunds.reduce(
                      (sum: number, r: any) => sum + Number(r.total_amount || 0),
                      0
                    );

                    const isExpanded = expandedSaleId === sale.id;

                    return (
                      <React.Fragment key={sale.id}>
                        <tr className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{sale.invoice_number}</span>
                              {completedRefunds.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(sale.id)}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-sans font-medium flex items-center gap-1 hover:bg-amber-100 transition-colors"
                                  title="Lihat riwayat refund"
                                >
                                  <span>{completedRefunds.length}x refund</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {formatDateTime(sale.sold_at)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 font-medium">
                            {sale.profiles?.display_name || '-'}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-slate-950">
                              {formatCurrency(Number(sale.total_amount))}
                            </div>
                            {totalRefundedAmount > 0 && (
                              <div className="text-[10px] text-amber-700 font-mono mt-0.5">
                                Direfund: {formatCurrency(totalRefundedAmount)}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                isCompleted
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isPartiallyRefunded
                                  ? 'bg-amber-100 text-amber-800'
                                  : isRefunded
                                  ? 'bg-blue-100 text-blue-800'
                                  : isVoided
                                  ? 'bg-red-100 text-red-800 line-through'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {sale.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Reprint Button */}
                              <button
                                onClick={() => handleOpenReprint(sale)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                title="Cetak Ulang Struk"
                              >
                                <Printer className="w-3.5 h-3.5 text-slate-500" />
                                <span>Struk</span>
                              </button>

                              {/* Refund Button (Active for COMPLETED or PARTIALLY_REFUNDED) */}
                              {(isCompleted || isPartiallyRefunded) && (
                                <button
                                  onClick={() => setRefundSaleTarget(sale)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors"
                                  title="Proses Pengembalian Dana"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Refund</span>
                                </button>
                              )}

                              {/* Void Button (Active ONLY for COMPLETED) */}
                              {isCompleted && (
                                <button
                                  onClick={() =>
                                    setVoidSaleTarget({
                                      id: sale.id,
                                      invoice_number: sale.invoice_number,
                                      sold_at: sale.sold_at,
                                      total_amount: Number(sale.total_amount),
                                      cashier_name: sale.profiles?.display_name,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Batalkan Nota (Void)"
                                >
                                  <Ban className="w-3.5 h-3.5 text-red-500" />
                                  <span>Void</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Refund History Sub-row */}
                        {isExpanded && completedRefunds.length > 0 && (
                          <tr className="bg-amber-50/30">
                            <td colSpan={6} className="px-6 py-3 border-b border-amber-100">
                              <div className="space-y-2 text-xs">
                                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Riwayat Dokumen Pengembalian Dana (Refund)</span>
                                </div>
                                <div className="space-y-2">
                                  {completedRefunds.map((ref: any) => (
                                    <div
                                      key={ref.id}
                                      className="bg-white border border-amber-200 rounded-xl p-3 text-[11px] space-y-1 shadow-2xs"
                                    >
                                      <div className="flex justify-between items-center font-semibold text-slate-800">
                                        <span className="font-mono text-amber-900 font-bold">
                                          {ref.refund_number} ({ref.refund_type})
                                        </span>
                                        <span className="font-mono text-red-600 font-bold">
                                          - {formatCurrency(Number(ref.total_amount))}
                                        </span>
                                      </div>
                                      <div className="text-slate-500 flex items-center justify-between">
                                        <span>
                                          Diproses oleh: {ref.profiles?.display_name || 'Kasir'} •{' '}
                                          {formatDateTime(ref.refunded_at)}
                                        </span>
                                        <span className="italic text-slate-600">
                                          Alasan: &ldquo;{ref.reason}&rdquo;
                                        </span>
                                      </div>
                                      {ref.sale_refund_items && ref.sale_refund_items.length > 0 && (
                                        <div className="border-t border-slate-100 pt-1 mt-1 text-slate-600">
                                          <span className="font-medium text-slate-700">
                                            Item dikembalikan:
                                          </span>{' '}
                                          {ref.sale_refund_items
                                            .map((ri: any) => {
                                              const orig = (sale.sale_items || []).find(
                                                (si: any) => si.id === ri.sale_item_id
                                              );
                                              return `${orig?.description_snapshot || 'Item'} (${ri.quantity}x)`;
                                            })
                                            .join(', ')}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination: Load More */}
          {!loading && hasMore && (
            <div className="p-4 text-center border-t border-slate-100">
              <button
                onClick={() => loadHistory(false, sales.length)}
                disabled={loadingMore}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-xl transition-colors"
              >
                {loadingMore ? 'Memuat...' : `Muat ${PAGE_SIZE} Transaksi Berikutnya`}
              </button>
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

      {/* Void Sale Modal */}
      {voidSaleTarget && (
        <VoidSaleModal
          isOpen={true}
          sale={voidSaleTarget}
          onClose={() => setVoidSaleTarget(null)}
          onSuccess={handleVoidSuccess}
        />
      )}

      {/* Refund Sale Modal */}
      {refundSaleTarget && (
        <RefundSaleModal
          isOpen={true}
          sale={refundSaleTarget}
          onClose={() => setRefundSaleTarget(null)}
          onSuccess={handleRefundSuccess}
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
