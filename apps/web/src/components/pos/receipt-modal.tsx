'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { CompletedSale } from '../../types/pos';
import { usePos } from '../../context/pos-context';
import { formatCurrency, formatDateTime } from '../../lib/formatters';
import { generateSaleEscPos, type PaperWidth } from '../../lib/escpos';
import { printViaBluetooth, isBluetoothSupported } from '../../lib/bluetooth-printer';
import {
  generateWhatsAppReceiptText,
  getWhatsAppShareUrl,
  copyTextToClipboard,
  normalizeIndonesianPhoneNumber,
  isValidPhoneNumber,
} from '../../lib/whatsapp';
import {
  Printer,
  Check,
  X,
  Scissors,
  Bluetooth,
  Send,
  Copy,
  CheckCheck,
  AlertCircle,
  Loader2,
  Smartphone,
  Phone,
  Settings2,
} from 'lucide-react';

interface ReceiptModalProps {
  sale: CompletedSale;
  onNewTransaction: () => void;
  onClose: () => void;
}

export function ReceiptModal({
  sale,
  onNewTransaction,
  onClose,
}: ReceiptModalProps): React.JSX.Element {
  const { businessSettings, currentOutlet } = usePos();

  // 1. Paper width preference (58mm vs 80mm)
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('58mm');

  // 2. WhatsApp digital receipt state
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // 3. Bluetooth printing state
  const [bluetoothSupported, setBluetoothSupported] = useState<boolean>(false);
  const [bluetoothPrinting, setBluetoothPrinting] = useState<boolean>(false);
  const [bluetoothStatus, setBluetoothStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string | null;
  }>({ type: null, message: null });

  // 4. Tab / Mode toggle (Print vs WhatsApp)
  const [activeTab, setActiveTab] = useState<'thermal' | 'whatsapp'>('thermal');

  // Load saved preferences & auto-fill customer phone
  useEffect(() => {
    setBluetoothSupported(isBluetoothSupported());

    // Load saved paper width
    const savedWidth = localStorage.getItem('barber_preferred_paper_width') as PaperWidth | null;
    if (savedWidth === '58mm' || savedWidth === '80mm') {
      setPaperWidth(savedWidth);
    }

    // Auto-fill phone from sale customer if present
    if (sale.customer_phone) {
      setPhoneNumber(sale.customer_phone);
    }
  }, [sale]);

  // Handle paper width change
  const handlePaperWidthChange = (width: PaperWidth) => {
    setPaperWidth(width);
    try {
      localStorage.setItem('barber_preferred_paper_width', width);
    } catch {
      // Ignore storage errors
    }
  };

  // Browser / USB print
  const handleBrowserPrint = () => {
    window.print();
  };

  // Direct Bluetooth print
  const handleBluetoothPrint = async () => {
    setBluetoothPrinting(true);
    setBluetoothStatus({ type: null, message: null });

    try {
      const escPosData = generateSaleEscPos(sale, {
        paperWidth,
        businessName: businessSettings.business_name,
      });

      const result = await printViaBluetooth(escPosData);
      if (result.success) {
        setBluetoothStatus({
          type: 'success',
          message: `Struk berhasil dicetak ke "${result.deviceName || 'Thermal Printer'}"!`,
        });
      } else {
        setBluetoothStatus({
          type: 'error',
          message: result.error || 'Gagal menyambung ke printer Bluetooth.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Koneksi printer Bluetooth terputus';
      setBluetoothStatus({ type: 'error', message: msg });
    } finally {
      setBluetoothPrinting(false);
    }
  };

  // WhatsApp text preview
  const whatsAppMessage = useMemo(() => {
    return generateWhatsAppReceiptText(sale, {
      businessName: businessSettings.business_name,
    });
  }, [sale, businessSettings]);

  // Handle send WhatsApp
  const handleSendWhatsApp = () => {
    const url = getWhatsAppShareUrl(phoneNumber, whatsAppMessage);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Handle copy text
  const handleCopyText = async () => {
    const success = await copyTextToClipboard(whatsAppMessage);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const isPhoneValid = isValidPhoneNumber(phoneNumber);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[94vh]">
        {/* Top Header */}
        <div className="bg-slate-900 px-5 py-3.5 text-white flex items-center justify-between no-print border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">Nota Transaksi Selesai</h2>
              <p className="text-[11px] text-slate-400">
                {sale.invoice_number} • {sale.outlet_name || currentOutlet?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector: Cetak Thermal vs WhatsApp Digital */}
        <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50 no-print">
          <button
            type="button"
            onClick={() => setActiveTab('thermal')}
            className={`py-2.5 px-4 text-xs font-bold transition flex items-center justify-center gap-2 border-b-2 ${
              activeTab === 'thermal'
                ? 'border-amber-500 bg-white text-slate-900 shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Printer className="w-4 h-4 text-amber-500" />
            <span>Cetak Struk Thermal</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('whatsapp')}
            className={`py-2.5 px-4 text-xs font-bold transition flex items-center justify-center gap-2 border-b-2 ${
              activeTab === 'whatsapp'
                ? 'border-emerald-500 bg-white text-slate-900 shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
          >
            <Smartphone className="w-4 h-4 text-emerald-600" />
            <span>Kirim WhatsApp (Digital)</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* TAB 1: THERMAL RECEIPT PRINTING */}
          {activeTab === 'thermal' && (
            <div className="space-y-4">
              {/* Paper Width & Bluetooth Controls Bar */}
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-100 border border-slate-200 text-xs no-print">
                <div className="flex items-center gap-1.5 text-slate-600 font-semibold">
                  <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Kertas:</span>
                </div>
                <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handlePaperWidthChange('58mm')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      paperWidth === '58mm'
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    58mm (Mini)
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaperWidthChange('80mm')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                      paperWidth === '80mm'
                        ? 'bg-amber-500 text-slate-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    80mm (Standar)
                  </button>
                </div>
              </div>

              {/* Bluetooth Status Alert (if any) */}
              {bluetoothStatus.message && (
                <div
                  className={`flex items-start gap-2.5 p-3 rounded-2xl border text-xs no-print ${
                    bluetoothStatus.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }`}
                >
                  {bluetoothStatus.type === 'success' ? (
                    <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <p className="flex-1 leading-relaxed">{bluetoothStatus.message}</p>
                </div>
              )}

              {/* Thermal Paper Preview Card */}
              <div className="flex justify-center bg-slate-200/70 p-4 sm:p-6 rounded-3xl border border-slate-300/80 shadow-inner">
                <div
                  id="printable-receipt"
                  className={`bg-white p-5 shadow-lg border border-slate-200 font-mono text-slate-900 leading-tight space-y-2.5 transition-all ${
                    paperWidth === '58mm'
                      ? 'paper-58mm max-w-[280px] text-[10px]'
                      : 'paper-80mm max-w-[360px] text-[11px]'
                  }`}
                >
                  {/* Store Header */}
                  <div className="text-center space-y-0.5">
                    <h2 className="font-sans text-sm font-black uppercase tracking-wider text-slate-950">
                      {businessSettings.business_name || 'BARBERSHOP'}
                    </h2>
                    <p className="font-sans text-[10px] font-bold text-slate-600">
                      {sale.outlet_name || currentOutlet?.name}
                    </p>
                    {currentOutlet?.address && (
                      <p className="font-sans text-[9px] text-slate-500 leading-tight">
                        {currentOutlet.address}
                      </p>
                    )}
                    {currentOutlet?.phone && (
                      <p className="font-sans text-[9px] text-slate-500">
                        Telp: {currentOutlet.phone}
                      </p>
                    )}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-2" />

                  {/* Metadata */}
                  <div className="space-y-0.5 text-[10px] text-slate-700">
                    <div className="flex justify-between">
                      <span>No. Nota:</span>
                      <span className="font-bold text-slate-900">{sale.invoice_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Waktu:</span>
                      <span>{formatDateTime(sale.sold_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kasir:</span>
                      <span>{sale.cashier_name}</span>
                    </div>
                    {sale.customer_name && (
                      <div className="flex justify-between">
                        <span>Pelanggan:</span>
                        <span className="font-bold text-slate-900">
                          {sale.customer_name}
                          {sale.customer_tier ? ` (${sale.customer_tier})` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-2" />

                  {/* Items List */}
                  <div className="space-y-2">
                    {sale.items.map((item, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex justify-between font-bold text-slate-900">
                          <span className="truncate pr-2">{item.description}</span>
                          <span>{formatCurrency(item.total_amount)}</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500">
                          <span>
                            {item.quantity} x {formatCurrency(item.unit_price)}
                          </span>
                          {item.barber_name && <span>(Barber: {item.barber_name})</span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-2" />

                  {/* Totals */}
                  <div className="space-y-1 text-slate-700">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(sale.subtotal)}</span>
                    </div>

                    {sale.discount_amount > 0 && (
                      <div className="flex justify-between text-red-600 font-semibold">
                        <span>Diskon:</span>
                        <span>-{formatCurrency(sale.discount_amount)}</span>
                      </div>
                    )}

                    {sale.tax_amount > 0 && (
                      <div className="flex justify-between">
                        <span>PPN:</span>
                        <span>{formatCurrency(sale.tax_amount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-xs font-black text-slate-950 pt-1 border-t border-slate-300">
                      <span>TOTAL:</span>
                      <span>{formatCurrency(sale.total_amount)}</span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-400 my-2" />

                  {/* Payments Breakdown */}
                  <div className="space-y-0.5 text-slate-700 text-[10px]">
                    {sale.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{p.method_name}:</span>
                        <span className="font-semibold">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}

                    {(sale.tendered_amount ?? 0) > sale.total_amount && (
                      <>
                        <div className="flex justify-between text-slate-500">
                          <span>Diterima Tunai:</span>
                          <span>{formatCurrency(sale.tendered_amount || 0)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-slate-900 pt-0.5">
                          <span>Kembalian:</span>
                          <span>{formatCurrency(sale.change_amount || 0)}</span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Loyalty Points */}
                  {sale.customer_points !== undefined && sale.customer_points !== null && (
                    <>
                      <div className="border-t border-dashed border-slate-400 my-2" />
                      <div className="text-center text-[10px] text-emerald-800 font-bold bg-emerald-50 py-1 rounded">
                        Saldo Poin Member: {sale.customer_points.toLocaleString('id-ID')} Pts
                      </div>
                    </>
                  )}

                  <div className="border-t border-dashed border-slate-400 my-2" />

                  {/* Footer */}
                  <div className="text-center pt-0.5 space-y-0.5 text-slate-600 text-[9.5px]">
                    <p className="font-bold text-slate-800">Terima kasih atas kunjungan Anda!</p>
                    <p className="text-[8.5px] italic text-slate-500">
                      Gaya Terbaik untuk Pria Berkelas
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP DIGITAL RECEIPT */}
          {activeTab === 'whatsapp' && (
            <div className="space-y-4">
              {/* WhatsApp Phone Input */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  Nomor WhatsApp Pelanggan
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="misal: 08123456789 atau 628123456789"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 font-mono placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Format otomatis dinormalisasi ke: <code className="text-emerald-700 font-bold font-mono">+{normalizeIndonesianPhoneNumber(phoneNumber) || '62...'}</code>
                  </span>
                  {phoneNumber && (
                    <span
                      className={`font-bold ${
                        isPhoneValid ? 'text-emerald-600' : 'text-amber-600'
                      }`}
                    >
                      {isPhoneValid ? 'Nomor Valid ✓' : 'Periksa nomor HP'}
                    </span>
                  )}
                </div>
              </div>

              {/* WhatsApp Message Preview Box */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-bold">Pratinjau Teks Pesan WhatsApp:</span>
                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800 transition"
                  >
                    {copied ? (
                      <>
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Teks</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5 text-xs font-mono text-slate-800 whitespace-pre-wrap max-h-[260px] overflow-y-auto leading-relaxed shadow-inner">
                  {whatsAppMessage}
                </div>
              </div>

              {/* Action Button: Send WhatsApp */}
              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Buka & Kirim via WhatsApp Chat</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Bottom Action Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 no-print">
          {activeTab === 'thermal' ? (
            <>
              {/* Bluetooth Direct Print */}
              {bluetoothSupported && (
                <button
                  type="button"
                  onClick={handleBluetoothPrint}
                  disabled={bluetoothPrinting}
                  className="flex-1 min-w-[140px] py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                  title="Koneksi nirkabel langsung ke printer portable Bluetooth"
                >
                  {bluetoothPrinting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Mencetak...</span>
                    </>
                  ) : (
                    <>
                      <Bluetooth className="w-4 h-4" />
                      <span>Cetak Bluetooth</span>
                    </>
                  )}
                </button>
              )}

              {/* Standard USB / System Browser Print */}
              <button
                type="button"
                onClick={handleBrowserPrint}
                className="flex-1 min-w-[140px] py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                title="Buka dialog cetak sistem untuk printer USB / Network"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Cetak ({paperWidth})</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCopyText}
              className="flex-1 py-2.5 px-3 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Copy className="w-4 h-4 text-slate-500" />
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Teks Nota'}</span>
            </button>
          )}

          {/* New Transaction Button */}
          <button
            type="button"
            onClick={onNewTransaction}
            className="flex-1 min-w-[140px] py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Scissors className="w-4 h-4" />
            <span>Transaksi Baru</span>
          </button>
        </div>
      </div>
    </div>
  );
}
