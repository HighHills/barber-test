'use client';

import React, { useState, useEffect } from 'react';
import { usePos } from '../../context/pos-context';
import type { CustomerDetailCRM } from '../../types/pos';
import {
  Search,
  X,
  UserPlus,
  Coins,
  Phone,
} from 'lucide-react';

interface CustomerSelectModalProps {
  isOpen: boolean;
  selectedCustomerId?: string | null;
  onSelectCustomer: (customer: CustomerDetailCRM | null) => void;
  onClose: () => void;
  onOpenCreateModal: () => void;
}

export function CustomerSelectModal({
  isOpen,
  selectedCustomerId,
  onSelectCustomer,
  onClose,
  onOpenCreateModal,
}: CustomerSelectModalProps): React.JSX.Element | null {
  const { supabase } = usePos();
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerDetailCRM[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchCustomers = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('customers')
          .select(`
            id,
            customer_code,
            full_name,
            phone,
            email,
            gender,
            date_of_birth,
            tier_id,
            current_loyalty_points,
            lifetime_loyalty_points,
            preferred_barber_id,
            haircut_preferences,
            created_at,
            customer_tiers(id, code, name, color_hex, discount_percent_service, discount_percent_product),
            employees!preferred_barber_id(full_name)
          `)
          .order('created_at', { ascending: false })
          .limit(30);

        if (error) throw error;

        if (data) {
          const mapped: CustomerDetailCRM[] = data.map((c: any) => {
            const tierObj = Array.isArray(c.customer_tiers)
              ? c.customer_tiers[0]
              : c.customer_tiers;
            const barberObj = Array.isArray(c.employees)
              ? c.employees[0]
              : c.employees;

            return {
              id: c.id,
              customer_code: c.customer_code,
              full_name: c.full_name,
              phone: c.phone,
              email: c.email,
              gender: c.gender,
              date_of_birth: c.date_of_birth,
              tier_id: c.tier_id,
              tier_code: tierObj?.code || 'BRONZE',
              tier_name: tierObj?.name || 'Bronze Member',
              tier_color: tierObj?.color_hex || '#94a3b8',
              tier_discount_service: Number(tierObj?.discount_percent_service) || 0,
              tier_discount_product: Number(tierObj?.discount_percent_product) || 0,
              current_loyalty_points: Number(c.current_loyalty_points) || 0,
              lifetime_loyalty_points: Number(c.lifetime_loyalty_points) || 0,
              preferred_barber_id: c.preferred_barber_id,
              preferred_barber_name: barberObj?.full_name || null,
              haircut_preferences: c.haircut_preferences,
              total_visits: 0,
              total_spending: 0,
              created_at: c.created_at,
            };
          });
          setCustomers(mapped);
        }
      } catch (err) {
        console.error('Error loading customers for picker:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomers();
  }, [isOpen, supabase]);

  if (!isOpen) return null;

  const filtered = customers.filter(
    (c) =>
      c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customer_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="font-black text-slate-900 text-sm">
              Pilih Pelanggan / Member
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hubungkan nota ke pelanggan untuk menerapkan diskon tier & poin
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Actions */}
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              placeholder="Ketik nama pelanggan, no HP, atau kode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => {
                onSelectCustomer(null);
                onClose();
              }}
              className="text-xs text-slate-600 hover:text-slate-900 font-bold px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Lanjut sebagai Tamu Umum (Walk-in)
            </button>

            <button
              onClick={() => {
                onClose();
                onOpenCreateModal();
              }}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-black px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>+ Pelanggan Baru</span>
            </button>
          </div>
        </div>

        {/* Customer List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2 text-xs">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">
              Memuat data pelanggan...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <p>Tidak menemukan pelanggan yang cocok.</p>
              <button
                onClick={() => {
                  onClose();
                  onOpenCreateModal();
                }}
                className="text-amber-600 hover:underline font-bold text-xs"
              >
                Daftarkan sebagai pelanggan baru sekarang →
              </button>
            </div>
          ) : (
            filtered.map((cust) => {
              const isSelected = selectedCustomerId === cust.id;
              const tierColor = cust.tier_color || '#94a3b8';

              return (
                <div
                  key={cust.id}
                  onClick={() => {
                    onSelectCustomer(cust);
                    onClose();
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-100'
                      : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-2xs shrink-0"
                      style={{ backgroundColor: tierColor }}
                    >
                      {cust.full_name.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900 truncate">
                          {cust.full_name}
                        </span>
                        <span
                          className="text-[9px] font-black px-2 py-0.2 rounded-full text-white shrink-0"
                          style={{ backgroundColor: tierColor }}
                        >
                          {cust.tier_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {cust.phone}
                        </span>
                        <span>•</span>
                        <span>{cust.customer_code}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-black text-emerald-600 font-mono flex items-center justify-end gap-1 text-[11px]">
                      <Coins className="w-3 h-3" />
                      <span>{cust.current_loyalty_points.toLocaleString('id-ID')} Pts</span>
                    </div>
                    {(cust.tier_discount_service || 0) > 0 && (
                      <div className="text-[10px] text-amber-600 font-bold mt-0.5">
                        Diskon Jasa {cust.tier_discount_service}%
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
