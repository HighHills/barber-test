'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { BarberEmployee, CatalogItem, CustomerOption } from '../../types/pos';
import {
  BARBER_AVAILABILITY_LABELS,
  BARBER_AVAILABILITY_BADGE_CLASSES,
} from '../../types/pos';
import { parseBarberOperationalError } from '../../lib/barber-operation-errors';
import { customerService } from '../../services/customer-service';
import {
  X,
  UserPlus,
  Scissors,
  UserCheck,
  Search,
  Phone,
  User,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface WalkinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  availableServices: CatalogItem[];
}

export function WalkinModal({
  isOpen,
  onClose,
  onSuccess,
  availableServices,
}: WalkinModalProps): React.JSX.Element | null {
  const { supabase, currentOutlet, barbers, refreshData } = usePos();

  // Mode: Existing vs New Customer
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>('NEW');

  // Customer Form
  const [newCustomerName, setNewCustomerName] = useState<string>('');
  const [newCustomerPhone, setNewCustomerPhone] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [existingCustomers, setExistingCustomers] = useState<CustomerOption[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isSearchingCustomer, setIsSearchingCustomer] = useState<boolean>(false);

  // Barber & Service
  const [selectedBarberId, setSelectedBarberId] = useState<string>(''); // empty string = any available
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Submit State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search existing customers
  useEffect(() => {
    if (!isOpen || customerMode !== 'EXISTING') return;

    let isMounted = true;
    const fetchCustomers = async () => {
      setIsSearchingCustomer(true);
      try {
        let query = supabase
          .from('customers')
          .select('id, customer_code, full_name, phone, email')
          .eq('is_active', true)
          .order('full_name')
          .limit(20);

        if (customerSearchQuery.trim()) {
          query = query.or(
            `full_name.ilike.%${customerSearchQuery.trim()}%,phone.ilike.%${customerSearchQuery.trim()}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;

        if (isMounted && data) {
          setExistingCustomers(data as CustomerOption[]);
        }
      } catch (err: unknown) {
        console.error('Error fetching customers:', err);
      } finally {
        if (isMounted) setIsSearchingCustomer(false);
      }
    };

    const timer = setTimeout(fetchCustomers, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, customerMode, customerSearchQuery, supabase]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOutlet) {
      setErrorMessage('Pilih cabang outlet terlebih dahulu.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let finalCustomerId: string | null = null;
      let finalCustomerName = '';

      // 1. Resolve customer
      if (customerMode === 'NEW') {
        const phone = newCustomerPhone.trim() || '080000000000';

        const newCust = await customerService.createCustomer(
          {
            full_name: newCustomerName.trim(),
            phone: phone,
          },
          supabase
        );

        finalCustomerId = newCust.id;
        finalCustomerName = newCust.full_name;
      } else {
        if (!selectedCustomerId) {
          throw new Error('Silakan pilih salah satu pelanggan dari daftar.');
        }
        finalCustomerId = selectedCustomerId;
        const custObj = existingCustomers.find((c) => c.id === selectedCustomerId);
        finalCustomerName = custObj?.full_name || 'Pelanggan Terdaftar';
      }

      // 2. Create walk-in queue via Authoritative Backend RPC
      const { data, error: rpcErr } = await supabase.rpc('create_walk_in_queue', {
        p_outlet_id: currentOutlet.id,
        p_customer_id: finalCustomerId,
        p_barber_id: selectedBarberId ? selectedBarberId : null,
      });

      if (rpcErr) {
        const opError = parseBarberOperationalError(rpcErr);
        if (opError) {
          // Authoritative Phase 4B availability rejection:
          // Keep modal open, preserve selected barber, refresh availability through usePos
          await refreshData();
          setErrorMessage(opError.message);
          return;
        }
        throw new Error(rpcErr.message || 'Gagal membuat antrean walk-in.');
      }

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      const createdQueueId = result?.queue_id || result?.id;
      const createdQueueNumber = result?.queue_number ?? 0;

      // If a service was pre-selected, save it in local storage session map so POS picks it up when finished
      if (selectedServiceId && createdQueueId) {
        try {
          const serviceObj = availableServices.find((s) => s.id === selectedServiceId);
          if (serviceObj) {
            const queueServices = JSON.parse(localStorage.getItem('barber_queue_services') || '{}');
            queueServices[createdQueueId] = {
              service_id: serviceObj.id,
              service_name: serviceObj.name,
              selling_price: serviceObj.selling_price,
            };
            localStorage.setItem('barber_queue_services', JSON.stringify(queueServices));
          }
        } catch {
          // Non-blocking
        }
      }

      // Reset form
      setNewCustomerName('');
      setNewCustomerPhone('');
      setSelectedCustomerId('');
      setSelectedBarberId('');
      setSelectedServiceId('');

      onSuccess(`Antrean #${createdQueueNumber} untuk ${finalCustomerName} berhasil didaftarkan.`);
      onClose();
    } catch (err: unknown) {
      console.error('Walkin submission error:', err);
      const opError = parseBarberOperationalError(err);
      if (opError) {
        void refreshData();
        setErrorMessage(opError.message);
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Terjadi kesalahan sistem saat mendaftar.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-slate-950/10 rounded-xl backdrop-blur-xs">
              <UserPlus className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <h2 className="text-base font-bold leading-tight">Tambah Antrean Walk-in</h2>
              <p className="text-xs font-medium text-slate-900/80">
                Pendaftaran tamu langsung ke ruang tunggu kursi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-950/70 hover:text-slate-950 p-1.5 rounded-lg hover:bg-black/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Selection Mode Tabs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Tipe Pelanggan
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setCustomerMode('NEW')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  customerMode === 'NEW'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Tamu Baru / Cepat</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode('EXISTING')}
                className={`py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  customerMode === 'EXISTING'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Pelanggan Terdaftar</span>
              </button>
            </div>
          </div>

          {/* New Customer Inputs */}
          {customerMode === 'NEW' && (
            <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border border-amber-200/60">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nama Tamu / Panggilan <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Budi Santoso"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nomor Handphone / WhatsApp (Opsional)
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="08123456789"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Existing Customer Selector */}
          {customerMode === 'EXISTING' && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cari Pelanggan
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari berdasarkan nama atau no. telepon..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                  />
                  {isSearchingCustomer && (
                    <Loader2 className="w-4 h-4 absolute right-3 top-2.5 text-slate-400 animate-spin" />
                  )}
                </div>
              </div>

              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                {existingCustomers.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-500">
                    {customerSearchQuery ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada data pelanggan.'}
                  </div>
                ) : (
                  existingCustomers.map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        selectedCustomerId === cust.id ? 'bg-amber-50/80 font-semibold text-amber-900' : ''
                      }`}
                    >
                      <div>
                        <div className="font-medium text-slate-900">{cust.full_name}</div>
                        <div className="text-[11px] text-slate-500">{cust.phone || cust.customer_code}</div>
                      </div>
                      {selectedCustomerId === cust.id && (
                        <span className="text-amber-600 text-xs font-bold">✓ Terpilih</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Barber Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Pilihan Barber (Kapster)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Option: Any Available */}
              <button
                type="button"
                onClick={() => setSelectedBarberId('')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selectedBarberId === ''
                    ? 'border-amber-500 bg-amber-50/80 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-1.5 text-amber-600 mb-0.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold">Siapa Saja / Bebas</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Antrean ditangani kapster pertama yang siap
                </p>
              </button>

              {/* Individual Barbers */}
              {barbers.map((b: BarberEmployee) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBarberId(b.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedBarberId === b.id
                      ? 'border-amber-500 bg-amber-50/80 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-900 text-xs truncate">
                      <Scissors className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{b.full_name}</span>
                    </div>
                    {b.availability_status && (
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ring-1 shrink-0 ${
                          BARBER_AVAILABILITY_BADGE_CLASSES[b.availability_status] ||
                          'bg-slate-100 text-slate-600 border-slate-200 ring-slate-400/20'
                        }`}
                      >
                        {BARBER_AVAILABILITY_LABELS[b.availability_status] || b.availability_status}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">{b.position || 'Stylist'}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Service (Optional) */}
          {availableServices.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Rencana Layanan (Opsional)
              </label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
              >
                <option value="">-- Tentukan nanti saat di kursi --</option>
                {availableServices.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} (Rp {srv.selling_price.toLocaleString('id-ID')}) - {srv.duration_minutes || 45} mnt
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Mendaftarkan...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Cetak Nomor Antrean</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
