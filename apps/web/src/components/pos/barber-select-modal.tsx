'use client';

import React, { useState } from 'react';
import { usePos } from '../../context/pos-context';
import type { CatalogItem, BarberEmployee } from '../../types/pos';
import {
  BARBER_AVAILABILITY_LABELS,
  BARBER_AVAILABILITY_BADGE_CLASSES,
} from '../../types/pos';
import { formatCurrency } from '../../lib/formatters';
import { Scissors, UserCheck, X, Search, Check } from 'lucide-react';

interface BarberSelectModalProps {
  service: CatalogItem;
  onConfirm: (barber: BarberEmployee) => void;
  onClose: () => void;
}

export function BarberSelectModal({
  service,
  onConfirm,
  onClose,
}: BarberSelectModalProps): React.JSX.Element {
  const { barbers } = usePos();
  const [selectedBarberId, setSelectedBarberId] = useState<string>(barbers[0]?.id || '');
  const [search, setSearch] = useState<string>('');

  const filteredBarbers = barbers.filter((b) =>
    b.full_name.toLowerCase().includes(search.toLowerCase()) ||
    b.employee_code.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = () => {
    const chosen = barbers.find((b) => b.id === selectedBarberId);
    if (chosen) {
      onConfirm(chosen);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">{service.name}</h3>
              <p className="text-xs text-amber-400 font-mono">
                {formatCurrency(service.selling_price)} • {service.duration_minutes || 30} menit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader info */}
        <div className="px-5 py-3 bg-amber-50/80 border-b border-amber-200/60 text-xs text-amber-900 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>Pilih barber/kapster yang melayani untuk alokasi komisi kerja otomatis.</span>
        </div>

        {/* Barber Search */}
        <div className="px-5 pt-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama barber..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Barber List */}
        <div className="p-5 overflow-y-auto space-y-2 flex-1">
          {filteredBarbers.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Tidak ada staf barber yang cocok.
            </div>
          ) : (
            filteredBarbers.map((barber) => {
              const isSelected = barber.id === selectedBarberId;
              return (
                <button
                  key={barber.id}
                  onClick={() => setSelectedBarberId(barber.id)}
                  className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/60 shadow-xs ring-1 ring-amber-500'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {barber.full_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">{barber.full_name}</h4>
                        {barber.availability_status && (
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ring-1 ${
                              BARBER_AVAILABILITY_BADGE_CLASSES[barber.availability_status] ||
                              'bg-slate-100 text-slate-600 border-slate-200 ring-slate-400/20'
                            }`}
                          >
                            {BARBER_AVAILABILITY_LABELS[barber.availability_status] ||
                              barber.availability_status}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {barber.employee_code} • {barber.position}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500 text-slate-950'
                        : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleSelect}
            disabled={!selectedBarberId}
            className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Tambahkan ke Nota</span>
          </button>
        </div>
      </div>
    </div>
  );
}
