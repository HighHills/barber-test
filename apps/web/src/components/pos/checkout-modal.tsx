'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { CartLineItem, CompletedSale, CustomerDetailCRM } from '../../types/pos';
import type { CartCalculationResult } from '@barber/business-rules';
import { checkoutPosSaleSchema } from '@barber/validators';
import { formatCurrency } from '../../lib/formatters';
import {
  CreditCard,
  Banknote,
  QrCode,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Split,
  Plus,
  Trash2,
  Coins,
  Crown,
} from 'lucide-react';

interface CheckoutModalProps {
  items: CartLineItem[];
  calculation: CartCalculationResult;
  saleDiscount: number;
  notes: string;
  customer?: CustomerDetailCRM | null;
  onSuccess: (completedSale: CompletedSale) => void;
  onClose: () => void;
}

interface SplitPaymentRow {
  method_id: string;
  amount: number;
  reference_number?: string;
}

export function CheckoutModal({
  items,
  calculation,
  saleDiscount,
  notes,
  customer,
  onSuccess,
  onClose,
}: CheckoutModalProps): React.JSX.Element {
  const { supabase, currentOutlet, profile, activeSession, paymentMethods } = usePos();

  // Loyalty points redemption
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState<boolean>(false);
  const maxRedeemablePoints = customer
    ? Math.min(customer.current_loyalty_points, Math.floor(calculation.total_amount / 100))
    : 0;
  const pointsDiscountAmount = useLoyaltyPoints ? maxRedeemablePoints * 100 : 0;
  const finalPayable = Math.max(0, calculation.total_amount - pointsDiscountAmount);

  // Single vs Split Payment Mode
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);

  // Single Mode State
  const defaultMethod = paymentMethods.find((p) => p.type === 'CASH') || paymentMethods[0];
  const [selectedMethodId, setSelectedMethodId] = useState<string>(defaultMethod?.id || '');
  const [tenderedCash, setTenderedCash] = useState<number>(finalPayable);
  const [referenceNumber, setReferenceNumber] = useState<string>('');

  // Split Mode State
  const [splitRows, setSplitRows] = useState<SplitPaymentRow[]>([
    {
      method_id: defaultMethod?.id || '',
      amount: Math.floor(finalPayable / 2),
    },
    {
      method_id: paymentMethods.find((p) => p.id !== defaultMethod?.id)?.id || defaultMethod?.id || '',
      amount: finalPayable - Math.floor(finalPayable / 2),
    },
  ]);

  // Status
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync defaults when paymentMethods load async after mount.
  useEffect(() => {
    if (paymentMethods.length === 0) return;
    const fallback = paymentMethods.find((p) => p.type === 'CASH') || paymentMethods[0];
    if (!fallback) return;
    setSelectedMethodId((prev) => {
      if (prev && paymentMethods.some((p) => p.id === prev)) return prev;
      return fallback.id;
    });
    setSplitRows((prev) => {
      const allValid = prev.length > 0 && prev.every((r) => paymentMethods.some((p) => p.id === r.method_id));
      if (allValid) return prev;
      const second = paymentMethods.find((p) => p.id !== fallback.id) || fallback;
      return [
        { method_id: fallback.id, amount: Math.floor(finalPayable / 2) },
        { method_id: second.id, amount: finalPayable - Math.floor(finalPayable / 2) },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethods]);

  // Keep cash tendered in sync if bill total changes or points are redeemed
  useEffect(() => {
    setTenderedCash(finalPayable);
    setSplitRows((prev) => {
      if (prev.length === 2) {
        const half = Math.floor(finalPayable / 2);
        return [
          { ...prev[0], amount: half },
          { ...prev[1], amount: finalPayable - half },
        ];
      }
      return prev;
    });
  }, [finalPayable]);

  const selectedMethod = paymentMethods.find((m) => m.id === selectedMethodId);
  const isCash = selectedMethod?.type === 'CASH';

  // Calculate change for cash
  const changeAmount = isCash ? Math.max(0, tenderedCash - finalPayable) : 0;

  // Split calculations
  const splitTotal = useMemo(
    () => splitRows.reduce((acc, row) => acc + (Number(row.amount) || 0), 0),
    [splitRows]
  );
  const splitRemaining = finalPayable - splitTotal;

  // Quick cash buttons
  const quickCashOptions = useMemo(() => {
    const opts = [finalPayable];
    const presets = [50000, 100000, 150000, 200000, 500000];
    presets.forEach((p) => {
      if (p > finalPayable && !opts.includes(p)) {
        opts.push(p);
      }
    });
    return opts.slice(0, 5);
  }, [finalPayable]);

  // Execute Sale Transaction via Supabase RPC
  const handleProcessSale = async () => {
    if (!currentOutlet || !profile || !activeSession) {
      setErrorMessage('Cabang, kasir, atau sesi kasir aktif belum siap');
      return;
    }

    if (isCash && tenderedCash < finalPayable) {
      setErrorMessage(`Uang tunai yang diterima (${formatCurrency(tenderedCash)}) kurang dari total tagihan (${formatCurrency(finalPayable)})`);
      return;
    }

    if (isSplitMode && Math.abs(splitRemaining) > 0.01) {
      setErrorMessage(`Jumlah pembayaran terpisah belum sesuai total tagihan. Sisa: ${formatCurrency(splitRemaining)}`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Prepare items payload
      const itemsPayload = items.map((item) => {
        const calcItem = calculation.items.find((c) => c.id === item.cart_item_id);
        const itemDisc = item.item_discount_amount || 0;
        const memberDisc = calcItem?.membership_discount_amount || 0;
        return {
          item_type: item.item_type,
          service_id: item.service_id || null,
          product_id: item.product_id || null,
          barber_id: item.barber_id || null,
          description_snapshot: item.description_snapshot,
          quantity: item.quantity,
          unit_price: item.unit_price,
          item_discount_amount: itemDisc + memberDisc,
          membership_discount_amount: memberDisc,
        };
      });

      // 2. Prepare payments payload
      let paymentsPayload: Array<{
        payment_method_id: string;
        amount: number;
        reference_number: string | null;
      }> = [];

      if (!isSplitMode) {
        paymentsPayload = [
          {
            payment_method_id: selectedMethodId,
            amount: finalPayable, // Exact bill amount recorded in ledger
            reference_number: isCash ? null : referenceNumber || null,
          },
        ];
      } else {
        paymentsPayload = splitRows.map((row) => ({
          payment_method_id: row.method_id,
          amount: Number(row.amount),
          reference_number: row.reference_number || null,
        }));
      }

      // 3. Unique Idempotency Key
      const idempotencyKey = typeof crypto !== 'undefined' ? crypto.randomUUID() : `sale-${Date.now()}`;

      const pointsToRedeem = useLoyaltyPoints && customer && maxRedeemablePoints > 0
        ? maxRedeemablePoints
        : 0;

      // 3b. Client-side fail-fast validation
      const validation = checkoutPosSaleSchema.safeParse({
        idempotency_key: idempotencyKey,
        outlet_id: currentOutlet.id,
        cash_session_id: activeSession.id,
        customer_id: customer ? customer.id : null,
        items: items.map((item) => {
          const calcItem = calculation.items.find((c) => c.id === item.cart_item_id);
          const itemDisc = item.item_discount_amount || 0;
          const memberDisc = calcItem?.membership_discount_amount || 0;
          return {
            item_type: item.item_type,
            service_id: item.service_id || null,
            product_id: item.product_id || null,
            barber_id: item.barber_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            item_discount_amount: itemDisc + memberDisc,
            membership_discount_amount: memberDisc,
          };
        }),
        payments: paymentsPayload,
        discount_amount: saleDiscount || 0,
        loyalty_points: pointsToRedeem,
        notes: notes || null,
      });

      if (!validation.success) {
        const firstIssue = validation.error.issues[0];
        setErrorMessage(
          firstIssue
            ? `Data checkout tidak valid: ${firstIssue.path.join('.') || 'form'} — ${firstIssue.message}`
            : 'Data checkout tidak valid. Periksa kembali item dan pembayaran.'
        );
        return;
      }

      // 4. Call privileged atomic POS + Loyalty RPC
      const { data, error: rpcErr } = await supabase.rpc('process_pos_sale_with_loyalty', {
        p_outlet_id: currentOutlet.id,
        p_idempotency_key: idempotencyKey,
        p_cashier_id: profile.id,
        p_customer_id: customer ? customer.id : null,
        p_cash_session_id: activeSession.id,
        p_items: itemsPayload,
        p_payments: paymentsPayload,
        p_discount_amount: saleDiscount || 0,
        p_notes: notes || null,
        p_loyalty_points: pointsToRedeem,
      });

      if (rpcErr) throw rpcErr;

      // 5. Package Completed Sale for Receipt Preview
      const resultData = data as any;
      const serverSaleId: string = resultData?.sale_id || idempotencyKey;
      const serverInvoice: string = resultData?.invoice_number || `INV-${Date.now()}`;
      const serverTotal: number =
        typeof resultData?.total_amount === 'number'
          ? resultData.total_amount
          : Number(resultData?.total_amount) || finalPayable;

      let receiptSubtotal = calculation.subtotal;
      let receiptDiscount = calculation.total_discount;
      let receiptTax = calculation.tax_amount;
      let receiptTotal = serverTotal;
      let receiptSoldAt = new Date().toISOString();

      const { data: serverSale } = await supabase
        .from('sales')
        .select('invoice_number, subtotal, discount_amount, tax_amount, total_amount, sold_at')
        .eq('id', serverSaleId)
        .maybeSingle();

      if (serverSale) {
        receiptSubtotal = Number(serverSale.subtotal) || receiptSubtotal;
        receiptDiscount = Number(serverSale.discount_amount) || 0;
        receiptTax = Number(serverSale.tax_amount) || 0;
        receiptTotal = Number(serverSale.total_amount) || receiptTotal;
        receiptSoldAt = serverSale.sold_at || receiptSoldAt;
      }

      const receiptChange = isCash ? Math.max(0, tenderedCash - receiptTotal) : 0;
      const completedSale: CompletedSale = {
        id: serverSaleId,
        invoice_number: (serverSale as any)?.invoice_number || serverInvoice,
        outlet_id: currentOutlet.id,
        outlet_name: currentOutlet.name,
        cashier_name: profile.display_name,
        customer_name: customer?.full_name || undefined,
        customer_id: customer?.id || null,
        customer_phone: customer?.phone || null,
        customer_points:
          typeof resultData?.new_points_balance === 'number'
            ? resultData.new_points_balance
            : customer?.current_loyalty_points || null,
        sold_at: receiptSoldAt,
        subtotal: receiptSubtotal,
        discount_amount: receiptDiscount,
        tax_amount: receiptTax,
        total_amount: receiptTotal,
        tendered_amount: isCash ? tenderedCash : receiptTotal,
        change_amount: isCash ? receiptChange : 0,
        items: items.map((i) => {
          const calcItem = calculation.items.find((c) => c.id === i.cart_item_id);
          return {
            description: i.description_snapshot,
            quantity: i.quantity,
            unit_price: i.unit_price,
            total_amount: calcItem ? calcItem.total_amount : i.quantity * i.unit_price - i.item_discount_amount,
            item_type: i.item_type,
            barber_name: i.barber_name,
          };
        }),
        payments: paymentsPayload.map((p) => {
          const pm = paymentMethods.find((m) => m.id === p.payment_method_id);
          return {
            method_name: pm?.name || 'Metode Pembayaran',
            amount: p.amount,
            reference_number: p.reference_number || undefined,
          };
        }),
      };

      onSuccess(completedSale);
    } catch (err: unknown) {
      console.error('Sale transaction error:', err);
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses transaksi';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Konfirmasi Pembayaran</h3>
              <p className="text-xs text-slate-400">Total Tagihan Transaksi POS</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Bill Total Display */}
        <div className="bg-slate-950 px-6 py-5 text-center text-white border-b border-slate-800">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total Harus Dibayar
          </span>
          <span className="text-3xl font-extrabold text-amber-400 font-mono">
            {formatCurrency(finalPayable)}
          </span>
          {calculation.total_membership_discount > 0 && (
            <div className="text-[11px] text-sky-300 font-semibold mt-1">
              (Diskon Member {customer?.tier_name ? `(${customer.tier_name})` : ''}: -{formatCurrency(calculation.total_membership_discount)})
            </div>
          )}
          {pointsDiscountAmount > 0 && (
            <div className="text-[11px] text-emerald-400 font-semibold mt-1">
              (Hemat {formatCurrency(pointsDiscountAmount)} dari {maxRedeemablePoints} Poin Loyalitas)
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Member & Loyalty Points Redemption Card */}
          {customer && (
            <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center font-black text-[10px] text-white shadow-2xs"
                    style={{ backgroundColor: customer.tier_color || '#f59e0b' }}
                  >
                    <Crown className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900">{customer.full_name}</span>
                      <span
                        className="text-[9px] font-black px-1.5 py-0.2 rounded-full text-white"
                        style={{ backgroundColor: customer.tier_color || '#f59e0b' }}
                      >
                        {customer.tier_name || 'Member'}
                      </span>
                    </div>
                    {calculation.total_membership_discount > 0 && (
                      <div className="text-[10px] text-sky-700 font-semibold mt-0.5">
                        Diskon member aktif: -{formatCurrency(calculation.total_membership_discount)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="font-mono font-bold text-emerald-700 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-amber-600" />
                  <span>{customer.current_loyalty_points.toLocaleString('id-ID')} Pts Tersedia</span>
                </div>
              </div>

              {customer.current_loyalty_points > 0 && maxRedeemablePoints > 0 && (
                <div className="pt-2 border-t border-amber-200/70 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer text-amber-950 font-bold">
                    <input
                      type="checkbox"
                      checked={useLoyaltyPoints}
                      onChange={(e) => setUseLoyaltyPoints(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Tukarkan {maxRedeemablePoints} Poin (Potongan {formatCurrency(pointsDiscountAmount)})</span>
                  </label>
                  {useLoyaltyPoints && (
                    <span className="font-mono font-black text-emerald-600">
                      -{formatCurrency(pointsDiscountAmount)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mode Switch: Single vs Split Payment */}
          <div className="flex items-center justify-between p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setIsSplitMode(false)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                !isSplitMode
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pembayaran Tunggal
            </button>
            <button
              onClick={() => setIsSplitMode(true)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                isSplitMode
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Split className="w-3.5 h-3.5" />
              <span>Pembayaran Terpisah (Split)</span>
            </button>
          </div>

          {/* SINGLE PAYMENT MODE */}
          {!isSplitMode ? (
            <div className="space-y-4">
              {/* Payment Methods Grid */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Pilih Metode Pembayaran
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {paymentMethods.map((method) => {
                    const isSelected = method.id === selectedMethodId;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setSelectedMethodId(method.id)}
                        className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between h-20 ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-500 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          {method.type === 'CASH' && <Banknote className="w-4 h-4 text-emerald-600" />}
                          {method.type === 'QRIS' && <QrCode className="w-4 h-4 text-purple-600" />}
                          {method.type !== 'CASH' && method.type !== 'QRIS' && (
                            <CreditCard className="w-4 h-4 text-blue-600" />
                          )}
                          <span
                            className={`w-3.5 h-3.5 rounded-full border ${
                              isSelected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                            }`}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-900 leading-tight">
                          {method.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cash Specific Calculations */}
              {isCash ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Uang Tunai Diterima (Rp)
                    </label>
                    <input
                      type="number"
                      value={tenderedCash || ''}
                      onChange={(e) => setTenderedCash(Number(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-lg font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {/* Quick Cash Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {quickCashOptions.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setTenderedCash(amount)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-mono font-medium transition-colors ${
                          tenderedCash === amount
                            ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {amount === finalPayable ? 'Uang Pas' : formatCurrency(amount)}
                      </button>
                    ))}
                  </div>

                  {/* Change Return */}
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">Uang Kembalian:</span>
                    <span
                      className={`text-base font-extrabold font-mono ${
                        tenderedCash < finalPayable ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {tenderedCash < finalPayable
                        ? `Kurang ${formatCurrency(finalPayable - tenderedCash)}`
                        : formatCurrency(changeAmount)}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Referensi / Trace / Bukti Transfer (Opsional)
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Contoh: REF-982183921 / QRIS Approval Code"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  />
                </div>
              )}
            </div>
          ) : (
            /* SPLIT PAYMENT MODE */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Rincian Pembayaran Terpisah</span>
                <button
                  type="button"
                  onClick={() =>
                    setSplitRows([
                      ...splitRows,
                      { method_id: paymentMethods[0]?.id || '', amount: 0 },
                    ])
                  }
                  className="text-xs text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Jalur</span>
                </button>
              </div>

              <div className="space-y-2">
                {splitRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-slate-200 rounded-xl bg-slate-50 flex items-center gap-2"
                  >
                    <select
                      value={row.method_id}
                      onChange={(e) => {
                        const next = [...splitRows];
                        next[idx]!.method_id = e.target.value;
                        setSplitRows(next);
                      }}
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {paymentMethods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={row.amount || ''}
                      onChange={(e) => {
                        const next = [...splitRows];
                        next[idx]!.amount = Number(e.target.value) || 0;
                        setSplitRows(next);
                      }}
                      placeholder="Nominal (Rp)"
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />

                    {splitRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSplitRows(splitRows.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Split Balance Summary */}
              <div className="p-3 bg-slate-100 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block">Total Dialokasikan:</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {formatCurrency(splitTotal)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">Sisa Belum Dibayar:</span>
                  <span
                    className={`font-bold font-mono ${
                      Math.abs(splitRemaining) < 0.01 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(splitRemaining)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer: Process Button */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleProcessSale}
            disabled={isSubmitting || (isCash && tenderedCash < finalPayable) || (isSplitMode && Math.abs(splitRemaining) > 0.01)}
            className="px-6 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl shadow-md transition-all flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Memproses Transaksi...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Selesaikan Pembayaran</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
