'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos, PosProvider } from '../../context/pos-context';
import { RoleGuard } from '../../components/auth/role-guard';
import type { PurchaseOrderItem, SupplierItem, PurchaseStatus, PurchasePaymentStatus } from '../../types/purchases';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import { PosHeader } from '../../components/pos/pos-header';
import { PurchaseOrderModal } from '../../components/purchases/purchase-order-modal';
import { SupplierPaymentModal } from '../../components/purchases/supplier-payment-modal';
import { SupplierFormModal } from '../../components/purchases/supplier-form-modal';
import { mapPurchaseOperationError } from '../../lib/purchase-operation-errors';
import {
  Truck,
  ShoppingBag,
  Plus,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Boxes,
  ExternalLink,
  Store,
  Wallet,
  Clock,
  Check,
  Edit2,
  Calendar,
  Receipt,
} from 'lucide-react';

function PurchasesContent(): React.JSX.Element {
  const {
    supabase,
    availableOutlets,
  } = usePos();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'PURCHASES' | 'SUPPLIERS'>('PURCHASES');

  // Data States
  const [purchases, setPurchases] = useState<PurchaseOrderItem[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedPaymentFilter, setSelectedPaymentFilter] = useState<string>('ALL');

  // Accordion Expand State
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  // Modal States
  const [isPOModalOpen, setIsPOModalOpen] = useState<boolean>(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [selectedPOForPayment, setSelectedPOForPayment] = useState<PurchaseOrderItem | null>(null);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState<boolean>(false);
  const [selectedSupplierForEdit, setSelectedSupplierForEdit] = useState<SupplierItem | null>(null);

  // Notifications
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Toggle Accordion
  const toggleRowExpand = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 1. Fetch Purchases
  const loadPurchases = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          id,
          purchase_number,
          outlet_id,
          supplier_id,
          status,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          payment_status,
          purchased_at,
          created_at,
          created_by,
          outlets (id, code, name),
          suppliers (id, code, name, phone, email),
          purchase_items (
            id,
            product_id,
            quantity,
            unit_cost,
            discount_amount,
            tax_amount,
            total_amount,
            products (id, name, sku)
          ),
          supplier_payments (
            id,
            supplier_id,
            purchase_id,
            amount,
            reference_number,
            paid_at
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formatted: PurchaseOrderItem[] = (data || []).map((p: any) => {
        const totalPaid = (p.supplier_payments || []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, pay: any) => sum + Number(pay.amount || 0),
          0
        );
        const totalAmount = Number(p.total_amount || 0);
        const remainingDebt = Math.max(0, totalAmount - totalPaid);

        return {
          id: p.id,
          purchase_number: p.purchase_number,
          outlet_id: p.outlet_id,
          outlet_name: p.outlets?.name || 'Cabang',
          supplier_id: p.supplier_id,
          supplier_name: p.suppliers?.name || 'Vendor Umum',
          supplier_phone: p.suppliers?.phone,
          status: p.status as PurchaseStatus,
          subtotal: Number(p.subtotal || 0),
          discount_amount: Number(p.discount_amount || 0),
          tax_amount: Number(p.tax_amount || 0),
          total_amount: totalAmount,
          payment_status: p.payment_status as PurchasePaymentStatus,
          total_paid: totalPaid,
          remaining_debt: remainingDebt,
          purchased_at: p.purchased_at || p.created_at,
          created_by: p.created_by,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          items: (p.purchase_items || []).map((pi: any) => ({
            id: pi.id,
            purchase_id: p.id,
            product_id: pi.product_id,
            product_name: pi.products?.name || 'Produk',
            product_sku: pi.products?.sku || '-',
            quantity: Number(pi.quantity || 0),
            unit_cost: Number(pi.unit_cost || 0),
            discount_amount: Number(pi.discount_amount || 0),
            tax_amount: Number(pi.tax_amount || 0),
            total_amount: Number(pi.total_amount || 0),
          })),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payments: (p.supplier_payments || []).map((pay: any) => ({
            id: pay.id,
            supplier_id: pay.supplier_id,
            purchase_id: pay.purchase_id,
            amount: Number(pay.amount || 0),
            reference_number: pay.reference_number,
            paid_at: pay.paid_at,
          })),
        };
      });

      setPurchases(formatted);
    } catch (err: unknown) {
      console.error('Error fetching purchases:', err);
      setErrorMsg(mapPurchaseOperationError(err, 'load'));
    }
  }, [supabase]);

  // 2. Fetch Suppliers
  const loadSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, code, name, phone, email, address, is_active, created_at')
        .order('name', { ascending: true });

      if (error) throw error;
      setSuppliers((data || []) as SupplierItem[]);
    } catch (err: unknown) {
      console.error('Error fetching suppliers:', err);
      setErrorMsg(mapPurchaseOperationError(err, 'supplier_load'));
    }
  }, [supabase]);

  // Load initial data
  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    await Promise.all([loadPurchases(), loadSuppliers()]);
    setLoading(false);
  }, [loadPurchases, loadSuppliers]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 3. Receive Purchase Order (Goods Receipt)
  const handleReceiveOrder = async (po: PurchaseOrderItem) => {
    if (po.status !== 'DRAFT') return;

    const confirmMsg = `Konfirmasi penerimaan barang untuk faktur ${po.purchase_number}?

Kuantitas stok produk di ${po.outlet_name} akan otomatis bertambah, Moving Average Cost dihitung ulang, dan jurnal hutang usaha diterbitkan ke akuntansi.`;
    if (!window.confirm(confirmMsg)) return;

    setActionLoadingId(po.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { data, error } = await supabase.rpc('receive_purchase_order', {
        p_purchase_id: po.id,
        p_received_by: null,
      });

      if (error) throw error;

      const res = data as {
        success?: boolean;
        purchase_id?: unknown;
        purchase_number?: unknown;
        status?: unknown;
        journal_number?: unknown;
        message?: unknown;
      } | null;
      if (
        res?.success !== true ||
        res.purchase_id !== po.id ||
        typeof res.purchase_number !== 'string' ||
        !res.purchase_number.trim() ||
        res.status !== 'RECEIVED' ||
        typeof res.journal_number !== 'string' ||
        !res.journal_number.trim()
      ) {
        throw new Error('Respons penerimaan barang tidak valid.');
      }

      setSuccessMsg(
        `Barang pesanan ${po.purchase_number} berhasil diterima! Stok cabang ${po.outlet_name} telah bertambah dan jurnal hutang Rp ${formatCurrency(po.total_amount)} telah diposting.`
      );
      await loadPurchases();
    } catch (err: any) {
      console.error('Error receiving purchase order:', err);
      setErrorMsg(mapPurchaseOperationError(err, 'receive'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Payment Modal
  const handleOpenPayment = (po: PurchaseOrderItem) => {
    setSelectedPOForPayment(po);
    setIsPaymentModalOpen(true);
  };

  // Open Edit Supplier Modal
  const handleEditSupplier = (supplier: SupplierItem) => {
    setSelectedSupplierForEdit(supplier);
    setIsSupplierModalOpen(true);
  };

  // Open New Supplier Modal
  const handleNewSupplier = () => {
    setSelectedSupplierForEdit(null);
    setIsSupplierModalOpen(true);
  };

  // KPI Computations
  const now = new Date();
  const currentMonthPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const d = new Date(p.purchased_at);
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear() &&
        p.status !== 'CANCELLED'
      );
    });
  }, [purchases, now]);

  const totalMonthlySpend = useMemo(() => {
    return currentMonthPurchases.reduce((sum, p) => sum + p.total_amount, 0);
  }, [currentMonthPurchases]);

  const totalOutstandingAP = useMemo(() => {
    return purchases
      .filter((p) => p.status === 'RECEIVED' && p.payment_status !== 'PAID')
      .reduce((sum, p) => sum + (p.remaining_debt || 0), 0);
  }, [purchases]);

  const pendingReceiveCount = useMemo(() => {
    return purchases.filter((p) => p.status === 'DRAFT').length;
  }, [purchases]);

  const activeSupplierCount = useMemo(() => {
    return suppliers.filter((s) => s.is_active).length;
  }, [suppliers]);

  // Filtered Purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      // Outlet filter
      if (selectedOutletFilter !== 'ALL' && p.outlet_id !== selectedOutletFilter) {
        return false;
      }
      // Status filter
      if (selectedStatusFilter !== 'ALL' && p.status !== selectedStatusFilter) {
        return false;
      }
      // Payment filter
      if (selectedPaymentFilter !== 'ALL' && p.payment_status !== selectedPaymentFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const numMatch = p.purchase_number.toLowerCase().includes(q);
        const supMatch = (p.supplier_name || '').toLowerCase().includes(q);
        const outletMatch = (p.outlet_name || '').toLowerCase().includes(q);
        return numMatch || supMatch || outletMatch;
      }
      return true;
    });
  }, [purchases, selectedOutletFilter, selectedStatusFilter, selectedPaymentFilter, searchQuery]);

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.phone || '').toLowerCase().includes(q) ||
          (s.address || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [suppliers, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* 1. Global Application Header */}
      <PosHeader variant="app" />

      {/* 2. Operational Sub-Header (Manajemen Pembelian & Hutang Supplier Context) */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Manajemen Pembelian & Hutang Supplier
              </h1>
              <p className="text-xs text-slate-400">
                Pengadaan Stok, Penerimaan Barang & Akuntansi Hutang Usaha
              </p>
            </div>
          </div>

          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition text-xs font-medium border border-slate-700/80 min-h-[40px] self-start sm:self-auto"
            title="Muat Ulang Data Pembelian"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span className="hidden sm:inline">Segarkan</span>
          </button>
        </div>
      </section>

      {/* 2. Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {/* KPI Metrics Overview (White Cards with subtle shadow) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Pengadaan Bulan Ini</span>
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <ShoppingBag className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-black text-slate-900">
                {formatCurrency(totalMonthlySpend)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {currentMonthPurchases.length} nota transaksi bulan ini
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Hutang Usaha (A/P)</span>
              <div className="p-1.5 rounded-lg bg-red-50 text-red-600">
                <Wallet className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-xl font-black text-red-600">
                {formatCurrency(totalOutstandingAP)}
              </span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Saldo tagihan supplier belum lunas</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Menunggu Barang</span>
              <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-600">{pendingReceiveCount}</span>
              <span className="text-xs text-slate-500">P.O. DRAFT</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Belum konfirmasi penerimaan fisik</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-semibold">Mitra Supplier</span>
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <Truck className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{activeSupplierCount}</span>
              <span className="text-xs text-slate-500">dari {suppliers.length} vendor</span>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Vendor terdaftar aktif memasok</p>
          </div>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="font-bold text-red-900">Gagal Memproses Permintaan</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-700">
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="font-bold text-emerald-900">Operasi Berhasil</p>
              <p className="mt-0.5">{successMsg}</p>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-800">
              ✕
            </button>
          </div>
        )}

        {/* 3. Tab Bar & Action Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('PURCHASES')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'PURCHASES'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              <ShoppingBag className="h-4 w-4" />
              <span>Faktur Pembelian (P.O.)</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'PURCHASES' ? 'bg-slate-950 text-amber-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {purchases.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'SUPPLIERS'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-200/70 border border-slate-200'
              }`}
            >
              <Truck className="h-4 w-4" />
              <span>Direktori Vendor Supplier</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === 'SUPPLIERS' ? 'bg-slate-950 text-amber-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {suppliers.length}
              </span>
            </button>
          </div>

          {/* Primary Action Button */}
          <div>
            {activeTab === 'PURCHASES' ? (
              <button
                onClick={() => setIsPOModalOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-400"
              >
                <Plus className="h-4 w-4" />
                <span>Buat Pembelian (P.O.) Baru</span>
              </button>
            ) : (
              <button
                onClick={handleNewSupplier}
                className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 transition hover:bg-amber-400"
              >
                <Plus className="h-4 w-4" />
                <span>Tambah Supplier Baru</span>
              </button>
            )}
          </div>
        </div>

        {/* 4. Filter Bar */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'PURCHASES'
                  ? 'Cari No. PO, nama supplier, atau cabang...'
                  : 'Cari nama vendor, kode supplier, atau nomor HP...'
              }
              className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Filters specific to Purchases */}
          {activeTab === 'PURCHASES' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Outlet Filter */}
              <select
                value={selectedOutletFilter}
                onChange={(e) => setSelectedOutletFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Semua Cabang</option>
                {availableOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Semua Status Barang</option>
                <option value="DRAFT">Draft / Menunggu Barang</option>
                <option value="RECEIVED">Diterima / Stok Masuk</option>
                <option value="CANCELLED">Batal</option>
              </select>

              {/* Payment Filter */}
              <select
                value={selectedPaymentFilter}
                onChange={(e) => setSelectedPaymentFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Semua Status Bayar</option>
                <option value="UNPAID">Belum Bayar</option>
                <option value="PARTIALLY_PAID">Cicilan / Sebagian</option>
                <option value="PAID">Lunas</option>
              </select>
            </div>
          )}
        </div>

        {/* 5. TAB 1: PURCHASES TABLE */}
        {activeTab === 'PURCHASES' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {loading ? (
              <div className="py-20 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                <p className="text-xs text-slate-500 mt-2">Memuat daftar pesanan pembelian...</p>
              </div>
            ) : filteredPurchases.length === 0 ? (
              <div className="py-16 text-center">
                <ShoppingBag className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-800">Tidak ada faktur pembelian</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {searchQuery || selectedStatusFilter !== 'ALL' || selectedOutletFilter !== 'ALL'
                    ? 'Tidak ada pesanan pembelian yang sesuai kriteria filter pencarian.'
                    : 'Belum ada data pengadaan barang. Klik tombol Buat Pembelian Baru untuk merestok persediaan.'}
                </p>
                <button
                  onClick={() => setIsPOModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Buat Pembelian Baru</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">#</th>
                      <th className="py-3 px-4">No. PO & Tanggal</th>
                      <th className="py-3 px-4">Cabang Outlet</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-3 text-center">Status Barang</th>
                      <th className="py-3 px-3 text-center">Status Bayar</th>
                      <th className="py-3 px-4 text-right">Total Tagihan</th>
                      <th className="py-3 px-4 text-right">Sisa Hutang</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPurchases.map((po) => {
                      const isExpanded = expandedRowIds.has(po.id);
                      const isActing = actionLoadingId === po.id;
                      const hasRemaining = (po.remaining_debt || 0) > 0;

                      return (
                        <React.Fragment key={po.id}>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            {/* Expand trigger */}
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => toggleRowExpand(po.id)}
                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition"
                                title={isExpanded ? 'Tutup rincian' : 'Buka rincian item'}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-amber-600" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            </td>

                            {/* PO Number & Date */}
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{po.purchase_number}</div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDateTime(po.purchased_at)}</span>
                              </div>
                            </td>

                            {/* Outlet */}
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                <Store className="h-3.5 w-3.5 text-slate-400" />
                                <span>{po.outlet_name}</span>
                              </div>
                            </td>

                            {/* Supplier */}
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">{po.supplier_name}</div>
                              {po.supplier_phone && (
                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Phone className="h-3 w-3 text-slate-400" />
                                  <span>{po.supplier_phone}</span>
                                </div>
                              )}
                            </td>

                            {/* Status Barang */}
                            <td className="py-3 px-3 text-center">
                              {po.status === 'DRAFT' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="h-3 w-3" />
                                  <span>Draft (Menunggu)</span>
                                </span>
                              )}
                              {po.status === 'RECEIVED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="h-3 w-3" />
                                  <span>Stok Diterima</span>
                                </span>
                              )}
                              {po.status === 'CANCELLED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  <span>Batal</span>
                                </span>
                              )}
                            </td>

                            {/* Status Bayar */}
                            <td className="py-3 px-3 text-center">
                              {po.payment_status === 'UNPAID' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                  <span>Belum Bayar</span>
                                </span>
                              )}
                              {po.payment_status === 'PARTIALLY_PAID' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <span>Cicilan</span>
                                </span>
                              )}
                              {po.payment_status === 'PAID' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="h-3 w-3" />
                                  <span>Lunas</span>
                                </span>
                              )}
                            </td>

                            {/* Total Tagihan */}
                            <td className="py-3 px-4 text-right">
                              <span className="font-bold text-slate-900">
                                {formatCurrency(po.total_amount)}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                {(po.items || []).length} item produk
                              </div>
                            </td>

                            {/* Sisa Hutang */}
                            <td className="py-3 px-4 text-right">
                              {hasRemaining ? (
                                <span className="font-bold text-red-600">
                                  {formatCurrency(po.remaining_debt || 0)}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {/* Button: Terima Barang (if DRAFT) */}
                                {po.status === 'DRAFT' && (
                                  <button
                                    onClick={() => handleReceiveOrder(po)}
                                    disabled={isActing}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs transition disabled:opacity-50"
                                    title="Konfirmasi barang fisik sampai dan tambahkan stok ke cabang"
                                  >
                                    {isActing ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Boxes className="h-3.5 w-3.5" />
                                    )}
                                    <span>Terima Barang</span>
                                  </button>
                                )}

                                {/* Button: Bayar Hutang (if RECEIVED & not PAID) */}
                                {po.status === 'RECEIVED' && hasRemaining && (
                                  <button
                                    onClick={() => handleOpenPayment(po)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shadow-xs transition"
                                    title="Bayar tagihan hutang supplier"
                                  >
                                    <CreditCard className="h-3.5 w-3.5" />
                                    <span>Bayar Hutang</span>
                                  </button>
                                )}

                                {/* Status Lunas indicator */}
                                {po.status === 'RECEIVED' && !hasRemaining && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold px-2 py-1 bg-emerald-50 rounded-lg">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>Tuntas</span>
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* Accordion Detail: Product items & Payment History */}
                          {isExpanded && (
                            <tr className="bg-slate-50/60">
                              <td colSpan={9} className="p-4 border-t border-b border-slate-200">
                                <div className="space-y-4 max-w-4xl mx-auto">
                                  {/* Rincian Produk */}
                                  <div>
                                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                                      <Boxes className="h-4 w-4 text-amber-600" />
                                      <span>Rincian Produk Pembelian ({po.items?.length || 0} item)</span>
                                    </h4>
                                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                                      <table className="w-full text-xs text-left text-slate-700">
                                        <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] uppercase font-semibold text-slate-500">
                                          <tr>
                                            <th className="py-2 px-3">Nama Produk</th>
                                            <th className="py-2 px-3">SKU</th>
                                            <th className="py-2 px-3 text-right">Kuantitas</th>
                                            <th className="py-2 px-3 text-right">Harga Modal Beli</th>
                                            <th className="py-2 px-3 text-right">Subtotal</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {(po.items || []).map((item, idx) => (
                                            <tr key={item.id || idx} className="hover:bg-slate-50/50">
                                              <td className="py-2 px-3 font-semibold text-slate-900">
                                                {item.product_name}
                                              </td>
                                              <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                                                {item.product_sku}
                                              </td>
                                              <td className="py-2 px-3 text-right font-medium">
                                                {item.quantity} pcs
                                              </td>
                                              <td className="py-2 px-3 text-right">
                                                {formatCurrency(item.unit_cost)}
                                              </td>
                                              <td className="py-2 px-3 text-right font-bold text-slate-900">
                                                {formatCurrency(item.total_amount)}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* Riwayat Pembayaran Hutang */}
                                  {(po.payments || []).length > 0 && (
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-2">
                                        <Receipt className="h-4 w-4 text-emerald-600" />
                                        <span>Riwayat Pembayaran Hutang ({po.payments?.length} transaksi)</span>
                                      </h4>
                                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                                        <table className="w-full text-xs text-left text-slate-700">
                                          <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] uppercase font-semibold text-slate-500">
                                            <tr>
                                              <th className="py-2 px-3">Waktu Bayar</th>
                                              <th className="py-2 px-3">No. Referensi</th>
                                              <th className="py-2 px-3 text-right">Nominal Bayar</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-100">
                                            {po.payments?.map((pay) => (
                                              <tr key={pay.id} className="hover:bg-slate-50/50">
                                                <td className="py-2 px-3 text-slate-600">
                                                  {formatDateTime(pay.paid_at)}
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-slate-800">
                                                  {pay.reference_number || '-'}
                                                </td>
                                                <td className="py-2 px-3 text-right font-bold text-emerald-600">
                                                  {formatCurrency(pay.amount)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
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
          </div>
        )}

        {/* 6. TAB 2: SUPPLIERS DIRECTORY */}
        {activeTab === 'SUPPLIERS' && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            {loading ? (
              <div className="py-20 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto" />
                <p className="text-xs text-slate-500 mt-2">Memuat daftar vendor supplier...</p>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="py-16 text-center">
                <Truck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-bold text-slate-800">Tidak ada data vendor</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {searchQuery
                    ? 'Tidak ada supplier yang sesuai dengan kata kunci pencarian.'
                    : 'Belum ada vendor supplier yang terdaftar. Tambahkan supplier mitra untuk memulai pemesanan stok.'}
                </p>
                <button
                  onClick={handleNewSupplier}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah Supplier Baru</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Kode & Nama Vendor</th>
                      <th className="py-3 px-4">Kontak WhatsApp / HP</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Alamat Kantor / Gudang</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSuppliers.map((supplier) => (
                      <tr key={supplier.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Name & Code */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 text-sm">{supplier.name}</div>
                          <div className="font-mono text-[10px] text-amber-700 mt-0.5">
                            {supplier.code}
                          </div>
                        </td>

                        {/* Phone / WA */}
                        <td className="py-3.5 px-4">
                          {supplier.phone ? (
                            <a
                              href={`https://wa.me/${supplier.phone.replace(/[^0-9]/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-semibold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 transition"
                              title="Hubungi via WhatsApp"
                            >
                              <Phone className="h-3.5 w-3.5" />
                              <span>{supplier.phone}</span>
                              <ExternalLink className="h-3 w-3 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4">
                          {supplier.email ? (
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Mail className="h-3.5 w-3.5 text-slate-400" />
                              <span>{supplier.email}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Address */}
                        <td className="py-3.5 px-4 max-w-xs truncate">
                          {supplier.address ? (
                            <div className="flex items-center gap-1.5 text-slate-600" title={supplier.address}>
                              <MapPin className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{supplier.address}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        {/* Active Status */}
                        <td className="py-3.5 px-3 text-center">
                          {supplier.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Aktif</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                              <span>Nonaktif</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleEditSupplier(supplier)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-amber-400 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 font-semibold text-xs shadow-xs transition"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      <PurchaseOrderModal
        isOpen={isPOModalOpen}
        onClose={() => setIsPOModalOpen(false)}
        onSuccess={() => {
          setIsPOModalOpen(false);
          setSuccessMsg('Faktur pembelian baru berhasil dibuat!');
          loadAll();
        }}
        onOpenNewSupplierModal={() => {
          setSelectedSupplierForEdit(null);
          setIsSupplierModalOpen(true);
        }}
      />

      <SupplierPaymentModal
        isOpen={isPaymentModalOpen}
        purchase={selectedPOForPayment}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setSelectedPOForPayment(null);
        }}
        onSuccess={() => {
          setIsPaymentModalOpen(false);
          setSelectedPOForPayment(null);
          setSuccessMsg('Pembayaran hutang supplier berhasil dicatat dan jurnal kas/bank diterbitkan!');
          loadPurchases();
        }}
      />

      <SupplierFormModal
        isOpen={isSupplierModalOpen}
        supplier={selectedSupplierForEdit}
        onClose={() => {
          setIsSupplierModalOpen(false);
          setSelectedSupplierForEdit(null);
        }}
        onSuccess={() => {
          setIsSupplierModalOpen(false);
          setSelectedSupplierForEdit(null);
          setSuccessMsg('Data vendor supplier berhasil diperbarui!');
          loadSuppliers();
        }}
      />
    </div>
  );
}

export default function PurchasesPage(): React.JSX.Element {
  return (
    <PosProvider>
      <RoleGuard allowedRoles={['OWNER', 'ADMIN', 'MANAGER', 'INVENTORY']}>
        <PurchasesContent />
      </RoleGuard>
    </PosProvider>
  );
}
