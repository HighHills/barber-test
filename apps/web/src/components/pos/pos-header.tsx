'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePos } from '../../context/pos-context';
import {
  Store,
  Clock,
  Lock,
  Unlock,
  History,
  Package,
  Scissors,
  Coins,
  BarChart3,
  Users,
  TrendingUp,
  LogOut,
  RefreshCw,
  PlayCircle,
  Truck,
  Receipt,
  Calendar,
} from 'lucide-react';

interface PosHeaderProps {
  onOpenSessionClick: () => void;
  onCloseSessionClick: () => void;
}

export function PosHeader({
  onOpenSessionClick,
  onCloseSessionClick,
}: PosHeaderProps): React.JSX.Element {
  const {
    currentOutlet,
    availableOutlets,
    setCurrentOutlet,
    profile,
    activeSession,
    refreshData,
    signOut,
    isCashier,
    isOwner,
    simulatedRole,
    simulateRole,
  } = usePos();

  const [currentTime, setCurrentTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-3 sticky top-0 z-30 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Section: Logo & Outlet Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-sm">
              💈
            </span>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                Barbershop POS
              </h1>
              <p className="text-[11px] text-amber-400 font-medium">Sistem Kasir Terintegrasi</p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-700 mx-1 hidden md:block" />

          {/* Outlet Selector / Locked Badge for Cashier */}
          {isCashier ? (
            <div
              className="flex items-center gap-1.5 bg-slate-800/90 border border-amber-500/40 px-2.5 py-1.5 rounded-lg text-xs"
              title="Cabang terkunci khusus penugasan akun kasir ini"
            >
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-white truncate max-w-[140px]">
                {currentOutlet?.name || 'Cabang Kasir'}
              </span>
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300 font-bold ml-1">
                Terkunci
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <select
                value={currentOutlet?.id || ''}
                onChange={(e) => {
                  const target = availableOutlets.find((o) => o.id === e.target.value);
                  if (target) setCurrentOutlet(target);
                }}
                className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer pr-1"
              >
                {availableOutlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id} className="bg-slate-900 text-white">
                    {outlet.name} ({outlet.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Center Section: Cash Session Status, Simulation Mode & Actions */}
        <div className="flex items-center gap-2">
          {simulatedRole && (
            <div className="flex items-center gap-1.5 bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm animate-pulse">
              <PlayCircle className="w-3.5 h-3.5" />
              <span>Simulasi Kasir ({currentOutlet?.code})</span>
              <button
                onClick={() => simulateRole(null)}
                className="ml-1 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 hover:bg-slate-900 transition"
                title="Keluar dari mode simulasi kasir"
              >
                Kembali
              </button>
            </div>
          )}

          {activeSession ? (
            <div className="flex items-center gap-2 bg-emerald-950/70 border border-emerald-500/30 px-3 py-1.5 rounded-lg text-xs text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="font-semibold">Laci Kasir BUKA</span>
              <button
                onClick={onCloseSessionClick}
                className="ml-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600 transition-colors flex items-center gap-1"
                title="Tutup sesi kasir shift ini"
              >
                <Lock className="w-3 h-3 text-amber-400" />
                <span>Tutup Kasir</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-950/60 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span className="font-semibold">Laci Kasir TUTUP</span>
              <button
                onClick={onOpenSessionClick}
                className="ml-1 text-[11px] bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-2 py-0.5 rounded shadow-sm transition-colors flex items-center gap-1"
                title="Buka sesi kasir dengan modal awal"
              >
                <Unlock className="w-3 h-3" />
                <span>Buka Kasir</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Section: Time, Cashier Profile, Nav Links & Sign Out */}
        <div className="flex items-center gap-2">
          {/* Clock */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono font-medium">{currentTime || '00:00:00'}</span>
          </div>

          {/* Queue & Booking Link */}
          <Link
            href="/queue"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="Sistem Antrean Kursi & Janji Temu"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Antrean</span>
          </Link>

          {/* Public Customer Self-Booking Portal */}
          <Link
            href="/book"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 px-2.5 py-1.5 rounded-lg border border-amber-500/30 transition-colors"
            title="Buka Portal Reservasi Mandiri Pelanggan (Tab Baru)"
          >
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline font-medium">Portal Booking</span>
          </Link>

          {/* History Link */}
          <Link
            href="/history"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="Riwayat Transaksi Penjualan"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Riwayat Nota</span>
          </Link>

          {/* Inventory Link */}
          <Link
            href="/inventory"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="Manajemen Persediaan & Stok Cabang"
          >
            <Package className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Inventori</span>
          </Link>

          {/* Purchasing & AP Link (Restricted for Cashier) */}
          {!isCashier && (
            <Link
              href="/purchases"
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Manajemen Pembelian Stok & Hutang Supplier"
            >
              <Truck className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline font-medium">Pembelian</span>
            </Link>
          )}

          {/* Expenses & Petty Cash Link */}
          <Link
            href="/expenses"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="Biaya Operasional & Kas Kecil (Petty Cash)"
          >
            <Receipt className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Biaya</span>
          </Link>

          {/* Commissions Link */}
          <Link
            href="/commissions"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="Komisi & Performa Kapster Cabang"
          >
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline font-medium">Komisi</span>
          </Link>

          {/* CRM Customers Link */}
          <Link
            href="/customers"
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            title="CRM Pelanggan & Loyalitas"
          >
            <Users className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline font-medium">Pelanggan</span>
          </Link>

          {/* OWNER ONLY: Accounting Link */}
          {!isCashier && (
            <Link
              href="/accounting"
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Laporan Keuangan & Akuntansi (Khusus Owner)"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline font-medium">Keuangan</span>
            </Link>
          )}

          {/* OWNER ONLY: Analytics BI Link */}
          {!isCashier && (
            <Link
              href="/analytics"
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Analitik Bisnis & Dashboard Owner (Khusus Owner)"
            >
              <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline font-medium">Analitik</span>
            </Link>
          )}

          {/* OWNER ONLY: Kelola Sub-Akun Kasir Link */}
          {isOwner && (
            <Link
              href="/subaccounts"
              className="flex items-center gap-1.5 text-xs bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 px-2.5 py-1.5 rounded-lg border border-amber-500/30 transition-colors"
              title="Kelola & Buat Sub-Akun Kasir Cabang (Khusus Owner)"
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline font-semibold">Sub-Akun</span>
            </Link>
          )}

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1.5 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors"
            title="Muat Ulang Data POS"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Cashier Badge */}
          <div className="flex items-center gap-2 pl-1">
            <div className="w-7 h-7 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-amber-400">
              {profile?.display_name?.slice(0, 2).toUpperCase() || 'KS'}
            </div>
            <div className="hidden xl:block text-left text-xs leading-tight">
              <div className="font-semibold text-slate-100 truncate max-w-[110px]">
                {profile?.display_name || 'Kasir'}
              </div>
              <div className="text-[10px] text-amber-400 font-semibold">
                {isCashier ? 'Kasir Cabang' : 'Owner / Admin'}
              </div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={signOut}
            className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors"
            title="Keluar / Ganti Akun"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
