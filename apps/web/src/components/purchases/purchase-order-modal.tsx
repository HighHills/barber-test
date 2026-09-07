'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePos } from '../../context/pos-context';
import type { SupplierItem } from '../../types/purchases';
import { formatCurrency } from '../../lib/formatters';
import {
  X,
  PackagePlus,
  Truck,
  Building2,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Boxes,
  Check,
} from 'lucide-react';

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenNewSupplierModal: () => void;
}

interface SelectedProductRow {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export function PurchaseOrderModal({
  isOpen,
  onClose,
  onSuccess,
  onOpenNewSupplierModal,
}: PurchaseOrderModalProps): React.JSX.Element | null {
  const { supabase, availableOutlets, currentOutlet, profile } = usePos();

  // Master options
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku?: string; cost_price?: number }>>([]);

  // Form states
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [selectedOutletId, setSelectedOutletId] = useState<string>(currentOutlet?.id || '');
  const [items, setItems] = useState<SelectedProductRow[]>([]);
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [taxAmount, setTaxAmount] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [autoReceive, setAutoReceive] = useState<boolean>(true);

  // UI status
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load suppliers and products
  const loadFormData = useCallback(async () => {
    try {
      // 1. Suppliers
      const { data: sData } = await supabase
        .from('suppliers')
        .select('id, code, name, phone, email, address, is_active')
        .eq('is_active', true)
        .order('name');
      if (sData) setSuppliers(sData as SupplierItem[]);
      if (sData && sData.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(sData[0].id);
      }

      // 2. Products
      const { data: pData } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('is_active', true)
        .order('name');
      if (pData) {
        setProducts(pData as any);
      }
    } catch (err) {
      console.warn('Load form data note:', err);
    }
  }, [supabase, selectedSupplierId]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setItems([]); // Always start with empty items so user explicitly chooses
    setDiscountAmount('0');
    setTaxAmount('0');
    setNotes('');
    setAutoReceive(true);
    setSelectedOutletId(currentOutlet?.id || (availableOutlets[0]?.id || ''));
    loadFormData();
  }, [isOpen, currentOutlet, availableOutlets, loadFormData]);

  // Add Item Row
  const handleAddItem = () => {
    if (products.length === 0) return;
    const firstProd = products[0];
    setItems((prev) => [
      ...prev,
      {
        productId: firstProd.id,
        name: firstProd.name,
        sku: firstProd.sku || 'PRD',
        quantity: 1,
        unitCost: 0,
      },
    ]);
  };

  // Remove Item Row
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update Item Row
  const handleUpdateItem = (index: number, field: keyof SelectedProductRow, value: any) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        if (field === 'productId') {
          const prod = products.find((p) => p.id === value);
          return {
            ...item,
            productId: value,
            name: prod?.name || item.name,
            sku: prod?.sku || item.sku,
          };
        }
        return { ...item, [field]: value };
      })
    );
  };

  // Subtotal & Total
  const subtotal = useMemo(() => {
    return items.reduce((acc, curr) => acc + (curr.quantity * curr.unitCost || 0), 0);
  }, [items]);

  const totalAmount = useMemo(() => {
    const disc = parseFloat(discountAmount) || 0;
    const tax = parseFloat(taxAmount) || 0;
    return Math.max(0, subtotal - disc + tax);
  }, [subtotal, discountAmount, taxAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedOutletId) {
      setErrorMsg('Harap pilih cabang outlet penerima.');
      return;
    }

    if (!selectedSupplierId) {
      setErrorMsg('Harap pilih supplier atau daftarkan supplier baru terlebih dahulu.');
      return;
    }

    if (items.length === 0) {
      setErrorMsg('Pesanan pembelian harus berisi setidaknya 1 item produk.');
      return;
    }

    setLoading(true);
    try {
      const payloadItems = items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        unit_cost: i.unitCost,
        discount_amount: 0,
        tax_amount: 0,
      }));

      const { error } = await supabase.rpc('create_purchase_order', {
        p_outlet_id: selectedOutletId,
        p_supplier_id: selectedSupplierId,
        p_items: payloadItems,
        p_discount_amount: parseFloat(discountAmount) || 0,
        p_tax_amount: parseFloat(taxAmount) || 0,
        p_notes: notes.trim() || null,
        p_auto_receive: autoReceive,
        p_created_by: profile?.id || null,
      });

      if (error) throw error;

      setSuccessMsg(
        autoReceive
          ? 'Faktur P.O. berhasil dibuat dan barang fisik langsung diterima! Stok gudang telah bertambah & jurnal hutang telah diterbitkan.'
          : 'Faktur pesanan pembelian (P.O.) berhasil dibuat sebagai DRAFT!'
      );

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Error creating purchase order:', err);
      const msg = err?.message || (err instanceof Error ? err.message : 'Gagal membuat faktur pembelian');
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <PackagePlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Buat Faktur Pembelian (P.O.) Baru</h2>
              <p className="text-xs text-slate-400">Pengadaan restock produk ritel & perlengkapan salon</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-white">
          {/* Notifications */}
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-red-600" />
              <div className="flex-1">
                <p className="font-bold text-red-900">Gagal Memproses</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              <p className="font-bold">{successMsg}</p>
            </div>
          )}

          {/* Supplier & Outlet Selection Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Supplier Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Pilih Supplier / Vendor <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={onOpenNewSupplierModal}
                  className="text-[10px] text-amber-600 hover:text-amber-700 flex items-center gap-0.5 font-bold"
                >
                  <Plus className="h-2.5 w-2.5" /> Supplier Baru
                </button>
              </div>
              <div className="relative">
                <Truck className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2.5 text-xs font-medium text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Outlet Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Cabang Outlet Penerima <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <select
                  value={selectedOutletId}
                  onChange={(e) => setSelectedOutletId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-3 py-2.5 text-xs font-medium text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  required
                >
                  {availableOutlets.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Product Items Table Section */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Boxes className="h-4 w-4 text-amber-600" />
                Rincian Produk yang Dipesan ({items.length} item)
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 transition"
              >
                <Plus className="h-3 w-3" /> Tambah Produk
              </button>
            </div>

            {/* Items Table Container */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/50">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold">
                  <tr>
                    <th className="py-2.5 px-3">Produk</th>
                    <th className="py-2.5 px-3 w-28 text-center">Kuantitas</th>
                    <th className="py-2.5 px-3 w-36 text-right">Harga Modal (Rp)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Subtotal</th>
                    <th className="py-2.5 px-2 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        <Boxes className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-slate-700 text-xs">Belum ada produk yang dipilih</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Klik tombol <strong>+ Tambah Produk</strong> untuk memasukkan produk yang ingin dipesan.
                        </p>
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Pilih & Tambah Produk</span>
                        </button>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => {
                      const rowSubtotal = item.quantity * item.unitCost;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition">
                          {/* Product Picker */}
                          <td className="py-2 px-3">
                            <select
                              value={item.productId}
                              onChange={(e) => handleUpdateItem(idx, 'productId', e.target.value)}
                              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku || 'PRD'})
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Quantity */}
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                handleUpdateItem(idx, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                              }
                              className="w-full text-center rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                              required
                            />
                          </td>

                          {/* Unit Cost */}
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unitCost}
                              onChange={(e) =>
                                handleUpdateItem(idx, 'unitCost', Math.max(0, parseFloat(e.target.value) || 0))
                              }
                              placeholder="0"
                              className="w-full text-right rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none"
                              required
                            />
                          </td>

                          {/* Row Subtotal */}
                          <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                            {formatCurrency(rowSubtotal)}
                          </td>

                          {/* Delete Row Button */}
                          <td className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                              title="Hapus baris produk"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pricing & Discounts Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Potongan / Diskon (Rp)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Pajak Masukan / PPN (Rp)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs font-mono text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Catatan / Keterangan
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="misal: Kirim via ekspedisi JNE Cargo"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Grand Total Summary Card */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-slate-500">Total Nilai Tagihan P.O.</span>
              <p className="text-[11px] text-slate-400">
                Subtotal: {formatCurrency(subtotal)} • Diskon: -{formatCurrency(parseFloat(discountAmount) || 0)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-slate-900 font-mono">
                {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>

          {/* Auto Receive Checkbox */}
          <div
            onClick={() => setAutoReceive(!autoReceive)}
            className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
              autoReceive
                ? 'border-amber-300 bg-amber-50/40 ring-1 ring-amber-300/40'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-md mt-0.5 transition ${
                autoReceive ? 'bg-amber-500 text-slate-950' : 'border border-slate-300 bg-white'
              }`}
            >
              {autoReceive && <Check className="h-3.5 w-3.5 stroke-[3]" />}
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-slate-900">
                Barang Fisik Sudah Tiba & Diterima di Gudang (Goods Receipt Aktif)
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                Jika dicentang, stok di cabang akan langsung bertambah, harga modal rata-rata (*Moving Average Cost*) otomatis dihitung ulang, dan jurnal hutang usaha otomatis diterbitkan.
              </p>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || items.length === 0}
              title={items.length === 0 ? 'Pilih minimal 1 produk terlebih dahulu' : undefined}
              className="flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menerbitkan P.O...
                </>
              ) : (
                <span>{autoReceive ? 'Terbitkan & Terima Barang' : 'Simpan sebagai Draft P.O.'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
