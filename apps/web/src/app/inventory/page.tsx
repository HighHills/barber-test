'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { usePos, PosProvider } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import type {
  InventoryProductView,
  StockAdjustmentView,
  StockTransferView,
  InventoryMovementView,
} from '../../types/pos';
import { PosHeader } from '../../components/pos/pos-header';
import { StockAdjustmentModal } from '../../components/inventory/stock-adjustment-modal';
import { StockTransferModal } from '../../components/inventory/stock-transfer-modal';
import {
  Package,
  SlidersHorizontal,
  ArrowRightLeft,
  BookOpen,
  Search,
  RefreshCw,
  Plus,
  AlertTriangle,
  CheckCircle2,
  X,
  Boxes,
} from 'lucide-react';

function InventoryContent(): React.JSX.Element {
  const {
    supabase,
    currentOutlet,
  } = usePos();

  const [activeTab, setActiveTab] = useState<'STOCK' | 'ADJUSTMENTS' | 'TRANSFERS' | 'MOVEMENTS'>('STOCK');

  // Data states
  const [products, setProducts] = useState<InventoryProductView[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustmentView[]>([]);
  const [transfers, setTransfers] = useState<StockTransferView[]>([]);
  const [movements, setMovements] = useState<InventoryMovementView[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal states
  const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState<boolean>(false);
  const [preselectedAdjustmentProduct, setPreselectedAdjustmentProduct] = useState<InventoryProductView | null>(null);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState<boolean>(false);
  const [preselectedTransferProduct, setPreselectedTransferProduct] = useState<InventoryProductView | null>(null);

  // Notification feedback
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // 1. Fetch Inventory Data
  const loadInventoryData = async () => {
    if (!currentOutlet) return;
    setLoading(true);

    try {
      // A. Fetch Products with Outlet Inventory & Outlet Price
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select(`
          id,
          sku,
          name,
          product_categories(name),
          product_outlets(
            outlet_id,
            selling_price,
            is_active
          ),
          outlet_inventory(
            outlet_id,
            quantity,
            average_cost
          )
        `)
        .eq('is_active', true)
        .order('name');

      if (prodErr) throw prodErr;

      const formattedProducts: InventoryProductView[] = (prodData || []).map((p: any) => {
        // Find matching outlet_inventory for current outlet
        const invList = Array.isArray(p.outlet_inventory) ? p.outlet_inventory : [];
        const inv = invList.find((i: any) => i.outlet_id === currentOutlet.id) || invList[0];

        // Find matching product_outlets for current outlet
        const poList = Array.isArray(p.product_outlets) ? p.product_outlets : [];
        const po = poList.find((o: any) => o.outlet_id === currentOutlet.id) || poList[0];

        const quantity = Number(inv?.quantity) || 0;
        const averageCost = Number(inv?.average_cost) || 0;
        const totalValue = Math.round(quantity * averageCost * 100) / 100;

        let status: 'SAFE' | 'LOW' | 'OUT_OF_STOCK' = 'SAFE';
        if (quantity <= 0) {
          status = 'OUT_OF_STOCK';
        } else if (quantity <= 10) {
          status = 'LOW';
        }

        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          category_name: p.product_categories?.name || 'Umum',
          selling_price: Number(po?.selling_price) || 0,
          quantity,
          average_cost: averageCost,
          total_asset_value: totalValue,
          status,
        };
      });

      setProducts(formattedProducts);

      // B. Fetch Stock Adjustments
      const { data: adjData, error: adjErr } = await supabase
        .from('stock_adjustments')
        .select(`
          id,
          adjustment_number,
          outlet_id,
          reason,
          status,
          created_at,
          profiles!created_by(display_name),
          stock_adjustment_items(
            id,
            product_id,
            quantity_before,
            quantity_after,
            quantity_delta,
            unit_cost,
            reason,
            products(name)
          )
        `)
        .eq('outlet_id', currentOutlet.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (adjErr) throw adjErr;

      const formattedAdjustments: StockAdjustmentView[] = (adjData || []).map((a: any) => ({
        id: a.id,
        adjustment_number: a.adjustment_number,
        outlet_id: a.outlet_id,
        reason: a.reason,
        status: a.status,
        creator_name: a.profiles?.display_name || 'Staff',
        created_at: a.created_at,
        items: (a.stock_adjustment_items || []).map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.products?.name || 'Produk',
          quantity_before: Number(item.quantity_before) || 0,
          quantity_after: Number(item.quantity_after) || 0,
          quantity_delta: Number(item.quantity_delta) || 0,
          unit_cost: Number(item.unit_cost) || 0,
          reason: item.reason,
        })),
      }));

      setAdjustments(formattedAdjustments);

      // C. Fetch Stock Transfers with aliased outlets to prevent duplicate table collision
      const { data: trfData, error: trfErr } = await supabase
        .from('stock_transfers')
        .select(`
          id,
          transfer_number,
          from_outlet_id,
          to_outlet_id,
          status,
          created_at,
          from_outlet:outlets!from_outlet_id(name),
          to_outlet:outlets!to_outlet_id(name),
          profiles!requested_by(display_name),
          stock_transfer_items(
            id,
            product_id,
            quantity,
            unit_cost,
            products(name)
          )
        `)
        .or(`from_outlet_id.eq.${currentOutlet.id},to_outlet_id.eq.${currentOutlet.id}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (trfErr) throw trfErr;

      const formattedTransfers: StockTransferView[] = (trfData || []).map((t: any) => ({
        id: t.id,
        transfer_number: t.transfer_number,
        from_outlet_id: t.from_outlet_id,
        to_outlet_id: t.to_outlet_id,
        from_outlet_name: t.from_outlet?.name || 'Cabang Asal',
        to_outlet_name: t.to_outlet?.name || 'Cabang Tujuan',
        status: t.status,
        requester_name: t.profiles?.display_name || 'Staff',
        created_at: t.created_at,
        items: (t.stock_transfer_items || []).map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.products?.name || 'Produk',
          quantity: Number(item.quantity) || 0,
          unit_cost: Number(item.unit_cost) || 0,
        })),
      }));

      setTransfers(formattedTransfers);

      // D. Fetch Inventory Movements Ledger
      const { data: movData, error: movErr } = await supabase
        .from('inventory_movements')
        .select(`
          id,
          product_id,
          movement_type,
          quantity,
          unit_cost,
          quantity_before,
          quantity_after,
          reference_type,
          reference_id,
          occurred_at,
          products(name),
          profiles!created_by(display_name)
        `)
        .eq('outlet_id', currentOutlet.id)
        .order('occurred_at', { ascending: false })
        .limit(100);

      if (movErr) throw movErr;

      const formattedMovements: InventoryMovementView[] = (movData || []).map((m: any) => ({
        id: m.id,
        product_id: m.product_id,
        product_name: m.products?.name || 'Produk',
        movement_type: m.movement_type,
        quantity: Number(m.quantity) || 0,
        unit_cost: Number(m.unit_cost) || 0,
        quantity_before: Number(m.quantity_before) || 0,
        quantity_after: Number(m.quantity_after) || 0,
        reference_type: m.reference_type,
        reference_id: m.reference_id,
        occurred_at: m.occurred_at,
        created_by_name: m.profiles?.display_name || '-',
      }));

      setMovements(formattedMovements);
    } catch (err: unknown) {
      console.error('Error fetching inventory data:', err);
      const errMsg =
        err instanceof Error
          ? err.message
          : (err as any)?.message ||
            (err as any)?.error_description ||
            'Gagal memuat data persediaan.';
      setFeedback({
        type: 'error',
        message: errMsg,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventoryData();
  }, [currentOutlet]);

  // KPI Metrics Calculation
  const kpis = useMemo(() => {
    const totalSKUs = products.length;
    const totalUnits = products.reduce((acc, p) => acc + p.quantity, 0);
    const totalAssetValue = products.reduce((acc, p) => acc + p.total_asset_value, 0);
    const lowStockCount = products.filter((p) => p.status === 'LOW' || p.status === 'OUT_OF_STOCK').length;

    return {
      totalSKUs,
      totalUnits,
      totalAssetValue,
      lowStockCount,
    };
  }, [products]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category_name) set.add(p.category_name);
    });
    return ['ALL', ...Array.from(set)];
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === 'ALL' || p.category_name === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [products, searchQuery, selectedCategory]);

  const handleOpenAdjustment = (prod?: InventoryProductView) => {
    setPreselectedAdjustmentProduct(prod || null);
    setIsAdjustmentModalOpen(true);
  };

  const handleOpenTransfer = (prod?: InventoryProductView) => {
    setPreselectedTransferProduct(prod || null);
    setIsTransferModalOpen(true);
  };

  const handleAdjustmentSuccess = () => {
    setFeedback({
      type: 'success',
      message: 'Penyesuaian stok (Stok Opname) berhasil dibukukan. Jurnal akuntansi telah terbit.',
    });
    loadInventoryData();
  };

  const handleTransferSuccess = () => {
    setFeedback({
      type: 'success',
      message: 'Transfer persediaan antar-cabang berhasil dieksekusi dengan Moving Average Cost.',
    });
    loadInventoryData();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* 1. Global Application Header */}
      <PosHeader variant="app" />

      {/* 2. Operational Sub-Header (Manajemen Persediaan & Stok Context) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Manajemen Persediaan & Stok
              </h1>
              <p className="text-xs text-slate-400">
                Gudang dan persediaan cabang terpusat, penyesuaian stok opname, dan transfer barang.
              </p>
            </div>
          </div>

          <button
            onClick={loadInventoryData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px] self-start sm:self-auto"
            title="Segarkan Data Persediaan"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </section>

      {/* Main Container */}
      <div className="p-6 max-w-6xl mx-auto w-full space-y-5 flex-1">
        {/* Feedback Alert */}
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
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
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

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Jenis Produk
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900">{kpis.totalSKUs}</span>
              <span className="text-xs text-slate-500 font-medium">SKU ritel</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Unit Fisik
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold text-slate-900">{kpis.totalUnits}</span>
              <span className="text-xs text-slate-500 font-medium">unit di rak/toko</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Nilai Aset Stok
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-slate-900 font-mono">
                {formatCurrency(kpis.totalAssetValue)}
              </span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Perlu Restock
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-extrabold ${
                  kpis.lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {kpis.lowStockCount}
              </span>
              <span className="text-xs text-slate-500 font-medium">produk menipis/habis</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setActiveTab('STOCK')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'STOCK'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Stok Saat Ini</span>
          </button>

          <button
            onClick={() => setActiveTab('ADJUSTMENTS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'ADJUSTMENTS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Stok Opname (Penyesuaian)</span>
          </button>

          <button
            onClick={() => setActiveTab('TRANSFERS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'TRANSFERS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Transfer Antar-Cabang</span>
          </button>

          <button
            onClick={() => setActiveTab('MOVEMENTS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'MOVEMENTS'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Buku Besar Mutasi</span>
          </button>
        </div>

        {/* TAB 1: STOK SAAT INI */}
        {activeTab === 'STOCK' && (
          <div className="space-y-4">
            {/* Search & Action Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama produk atau SKU..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  />
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        selectedCategory === cat
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat === 'ALL' ? 'Semua Kategori' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenAdjustment()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-2xs transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Stok Opname</span>
                </button>

                <button
                  onClick={() => handleOpenTransfer()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-2xs transition-colors"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-amber-400" />
                  <span>Transfer Cabang</span>
                </button>
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                      <th className="py-3.5 px-4">SKU</th>
                      <th className="py-3.5 px-4">Nama Produk</th>
                      <th className="py-3.5 px-4">Kategori</th>
                      <th className="py-3.5 px-4 text-center">Stok Fisik</th>
                      <th className="py-3.5 px-4 text-right">Harga Jual</th>
                      <th className="py-3.5 px-4 text-right">HPP (Average Cost)</th>
                      <th className="py-3.5 px-4 text-right">Total Nilai Aset</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((prod) => (
                      <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                          {prod.sku}
                        </td>
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          {prod.name}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">
                          {prod.category_name}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-mono font-bold text-sm text-slate-900">
                            {prod.quantity}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                          {formatCurrency(prod.selling_price)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono text-slate-600">
                          {formatCurrency(prod.average_cost)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(prod.total_asset_value)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              prod.status === 'SAFE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : prod.status === 'LOW'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {prod.status === 'SAFE'
                              ? 'Aman'
                              : prod.status === 'LOW'
                              ? 'Menipis'
                              : 'Habis'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenAdjustment(prod)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                              title="Sesuaikan Stok Produk Ini"
                            >
                              Opname
                            </button>
                            <button
                              onClick={() => handleOpenTransfer(prod)}
                              disabled={prod.quantity <= 0}
                              className="px-2 py-1 text-[11px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 rounded-lg transition-colors"
                              title="Transfer Produk Ini ke Cabang Lain"
                            >
                              Transfer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STOK OPNAME (ADJUSTMENTS) */}
        {activeTab === 'ADJUSTMENTS' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Riwayat Dokumen Stok Opname</h3>
                <p className="text-xs text-slate-500">
                  Daftar penyesuaian fisik dan pembukuan jurnal kerugian/keuntungan selisih
                </p>
              </div>
              <button
                onClick={() => handleOpenAdjustment()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl shadow-2xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Stok Opname Baru</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {adjustments.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Belum ada dokumen stok opname yang tercatat di cabang ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {adjustments.map((adj) => (
                    <div key={adj.id} className="p-4 space-y-2 hover:bg-slate-50/50 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {adj.adjustment_number}
                          </span>
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {adj.status}
                          </span>
                        </div>
                        <span className="text-slate-500 text-[11px]">
                          Diproses oleh: <strong>{adj.creator_name}</strong> • {formatDateTime(adj.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 italic">
                        Alasan: &ldquo;{adj.reason}&rdquo;
                      </p>

                      {/* Items adjusted */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden mt-2">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="py-2 px-3">Produk</th>
                              <th className="py-2 px-3 text-center">Stok Sistem</th>
                              <th className="py-2 px-3 text-center">Hitungan Fisik</th>
                              <th className="py-2 px-3 text-center">Selisih (Delta)</th>
                              <th className="py-2 px-3 text-right">Nilai Selisih</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {adj.items.map((it) => (
                              <tr key={it.id}>
                                <td className="py-2 px-3 font-sans font-medium text-slate-900">
                                  {it.product_name}
                                </td>
                                <td className="py-2 px-3 text-center text-slate-600">
                                  {it.quantity_before}
                                </td>
                                <td className="py-2 px-3 text-center font-bold text-slate-900">
                                  {it.quantity_after}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`inline-flex items-center gap-1 font-bold ${
                                      it.quantity_delta < 0
                                        ? 'text-red-600'
                                        : it.quantity_delta > 0
                                        ? 'text-emerald-600'
                                        : 'text-slate-600'
                                    }`}
                                  >
                                    {it.quantity_delta > 0
                                      ? `+${it.quantity_delta}`
                                      : it.quantity_delta}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right text-slate-800 font-bold">
                                  {formatCurrency(Math.abs(it.quantity_delta) * it.unit_cost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TRANSFER ANTAR CABANG */}
        {activeTab === 'TRANSFERS' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Riwayat Transfer Barang Antar Cabang</h3>
                <p className="text-xs text-slate-500">
                  Daftar mutasi pengiriman dan penerimaan stok dengan Moving Average Cost
                </p>
              </div>
              <button
                onClick={() => handleOpenTransfer()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-2xs transition-colors"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Kirim Transfer Stok Baru</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {transfers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Belum ada catatan transfer barang antar cabang.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {transfers.map((trf) => {
                    const isOutgoing = trf.from_outlet_id === currentOutlet?.id;

                    return (
                      <div key={trf.id} className="p-4 space-y-2 hover:bg-slate-50/50 transition-colors">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {trf.transfer_number}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isOutgoing
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}
                            >
                              {isOutgoing ? 'Kirim (Outgoing)' : 'Terima (Incoming)'}
                            </span>
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              {trf.status}
                            </span>
                          </div>
                          <span className="text-slate-500 text-[11px]">
                            {formatDateTime(trf.created_at)}
                          </span>
                        </div>

                        {/* Route & Items */}
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                          <span className="font-bold text-slate-900">{trf.from_outlet_name}</span>
                          <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-bold text-slate-900">{trf.to_outlet_name}</span>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden mt-2">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600">
                              <tr>
                                <th className="py-2 px-3">Produk</th>
                                <th className="py-2 px-3 text-center">Jumlah Transfer</th>
                                <th className="py-2 px-3 text-right">Nilai HPP Transfer</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono">
                              {trf.items.map((it) => (
                                <tr key={it.id}>
                                  <td className="py-2 px-3 font-sans font-medium text-slate-900">
                                    {it.product_name}
                                  </td>
                                  <td className="py-2 px-3 text-center font-bold text-slate-900">
                                    {it.quantity} unit
                                  </td>
                                  <td className="py-2 px-3 text-right text-slate-800 font-bold">
                                    {formatCurrency(it.quantity * it.unit_cost)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: BUKU BESAR MUTASI (MOVEMENTS LEDGER) */}
        {activeTab === 'MOVEMENTS' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <h3 className="text-sm font-bold text-slate-900">Buku Besar Mutasi Persediaan (Audit Trail)</h3>
              <p className="text-xs text-slate-500">
                Log kronologis seluruh mutasi persediaan barang masuk dan keluar yang tidak dapat diubah (append-only)
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider font-semibold">
                      <th className="py-3.5 px-4">Waktu</th>
                      <th className="py-3.5 px-4">Produk</th>
                      <th className="py-3.5 px-4">Tipe Mutasi</th>
                      <th className="py-3.5 px-4 text-center">Stok Sebelum</th>
                      <th className="py-3.5 px-4 text-center">Qty Mutasi</th>
                      <th className="py-3.5 px-4 text-center">Stok Sesudah</th>
                      <th className="py-3.5 px-4 text-right">Nilai Satuan</th>
                      <th className="py-3.5 px-4">Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {movements.map((mov) => {
                      const isPositive = mov.quantity > 0;
                      return (
                        <tr key={mov.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-slate-500 font-sans text-[11px]">
                            {formatDateTime(mov.occurred_at)}
                          </td>
                          <td className="py-3 px-4 font-sans font-bold text-slate-900">
                            {mov.product_name}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                mov.movement_type === 'SALE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : mov.movement_type === 'RETURN_IN'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : mov.movement_type.includes('ADJUSTMENT')
                                  ? 'bg-purple-100 text-purple-800'
                                  : mov.movement_type.includes('TRANSFER')
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {mov.movement_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-600">
                            {mov.quantity_before}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`font-bold ${
                                isPositive ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {isPositive ? `+${mov.quantity}` : mov.quantity}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-900">
                            {mov.quantity_after}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-700">
                            {formatCurrency(mov.unit_cost)}
                          </td>
                          <td className="py-3 px-4 font-sans text-slate-600">
                            {mov.created_by_name}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {isAdjustmentModalOpen && (
        <StockAdjustmentModal
          isOpen={true}
          preselectedProduct={preselectedAdjustmentProduct}
          productsList={products}
          onClose={() => setIsAdjustmentModalOpen(false)}
          onSuccess={handleAdjustmentSuccess}
        />
      )}

      {/* Stock Transfer Modal */}
      {isTransferModalOpen && (
        <StockTransferModal
          isOpen={true}
          preselectedProduct={preselectedTransferProduct}
          productsList={products}
          onClose={() => setIsTransferModalOpen(false)}
          onSuccess={handleTransferSuccess}
        />
      )}
    </div>
  );
}

export default function InventoryPage(): React.JSX.Element {
  return (
    <PosProvider>
      <InventoryContent />
    </PosProvider>
  );
}
