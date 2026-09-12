'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePos } from '../../context/pos-context';
import type { Outlet } from '../../types/pos';
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
  Settings,
  ArrowLeft,
  Menu,
  X,
} from 'lucide-react';

export interface PosHeaderProps {
  variant?: 'pos' | 'app';
  onOpenSessionClick?: () => void;
  onCloseSessionClick?: () => void;
  onBeforeOutletChange?: (nextOutlet: Outlet) => boolean | Promise<boolean>;
  onBeforeNavigate?: (href: string) => boolean | Promise<boolean>;
}

export function PosHeader({
  variant,
  onOpenSessionClick,
  onCloseSessionClick,
  onBeforeOutletChange,
  onBeforeNavigate,
}: PosHeaderProps): React.JSX.Element {
  const {
    currentOutlet,
    availableOutlets,
    setCurrentOutlet,
    profile,
    activeSession,
    refreshData,
    signOut,
    roleCode,
    isCashier,
    isOwner,
    simulatedRole,
    simulateRole,
  } = usePos();

  const canAccessSettings = roleCode === 'OWNER' || roleCode === 'ADMIN';

  const isPos = variant ? variant === 'pos' : Boolean(onOpenSessionClick || onCloseSessionClick);

  const pathname = usePathname();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  // Close mobile navigation on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileNavOpen) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileNavOpen]);

  const handleOutletSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetId = e.target.value;
    const target = availableOutlets.find((o) => o.id === targetId);
    if (!target) return;
    if (onBeforeOutletChange) {
      const allowed = await onBeforeOutletChange(target);
      if (!allowed) return;
    }
    setCurrentOutlet(target);
  };

  const handleNavClick = async (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname === href) {
      setMobileNavOpen(false);
      return;
    }
    if (onBeforeNavigate) {
      const allowed = await onBeforeNavigate(href);
      if (!allowed) {
        e.preventDefault();
        return;
      }
    }
    setMobileNavOpen(false);
  };

  const getNavLinkClass = (href: string, extraStyle?: string) => {
    const isActive = pathname === href;
    if (isActive) {
      return `flex items-center gap-1.5 text-xs bg-amber-500/20 text-amber-300 px-2.5 py-1.5 rounded-lg border border-amber-500/50 font-semibold transition-colors shadow-xs ${
        extraStyle || ''
      }`;
    }
    return `flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors ${
      extraStyle || ''
    }`;
  };

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

  const navItems = [
    {
      href: '/queue',
      label: 'Antrean',
      icon: Scissors,
      title: 'Sistem Antrean Kursi & Janji Temu',
      visible: true,
      group: 'POS' as const,
    },
    {
      href: '/book',
      label: 'Portal Booking',
      icon: Calendar,
      title: 'Buka Portal Reservasi Mandiri Pelanggan (Tab Baru)',
      visible: true,
      external: true,
      badge: 'Tab Baru',
      group: 'POS' as const,
    },
    {
      href: '/history',
      label: 'Riwayat Nota',
      icon: History,
      title: 'Riwayat Transaksi Penjualan',
      visible: true,
      group: 'POS' as const,
    },
    {
      href: '/inventory',
      label: 'Inventori',
      icon: Package,
      title: 'Manajemen Persediaan & Stok Cabang',
      visible: true,
      group: 'OPERASIONAL' as const,
    },
    {
      href: '/purchases',
      label: 'Pembelian',
      icon: Truck,
      title: 'Manajemen Pembelian Stok & Hutang Supplier',
      visible: !isCashier,
      group: 'OPERASIONAL' as const,
    },
    {
      href: '/expenses',
      label: 'Biaya',
      icon: Receipt,
      title: 'Biaya Operasional & Kas Kecil (Petty Cash)',
      visible: true,
      group: 'OPERASIONAL' as const,
    },
    {
      href: '/commissions',
      label: 'Komisi',
      icon: Coins,
      title: 'Komisi & Performa Kapster Cabang',
      visible: true,
      group: 'OPERASIONAL' as const,
    },
    {
      href: '/customers',
      label: 'Pelanggan',
      icon: Users,
      title: 'CRM Pelanggan & Loyalitas',
      visible: true,
      group: 'OPERASIONAL' as const,
    },
    {
      href: '/accounting',
      label: 'Keuangan',
      icon: BarChart3,
      title: 'Laporan Keuangan & Akuntansi (Khusus Owner)',
      visible: !isCashier,
      group: 'MANAJEMEN' as const,
    },
    {
      href: '/analytics',
      label: 'Analitik',
      icon: TrendingUp,
      title: 'Analitik Bisnis & Dashboard Owner (Khusus Owner)',
      visible: !isCashier,
      group: 'MANAJEMEN' as const,
    },
    {
      href: '/subaccounts',
      label: 'Sub-Akun',
      icon: Users,
      title: 'Kelola & Buat Sub-Akun Kasir Cabang (Khusus Owner)',
      visible: isOwner,
      group: 'MANAJEMEN' as const,
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: Settings,
      title: 'Pengaturan Bisnis & Sistem (Khusus Owner / Admin)',
      visible: canAccessSettings,
      group: 'MANAJEMEN' as const,
    },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 px-4 py-3 sticky top-0 z-30 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left Section: Logo & Outlet Selector */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            onClick={(e) => handleNavClick(e, '/')}
            className="flex items-center gap-2 group cursor-pointer"
            title="Ke Layar Kasir POS"
          >
            <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-sm group-hover:bg-amber-400 transition-colors">
              💈
            </span>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold tracking-tight text-white leading-tight">
                Barbershop POS
              </h1>
              <p className="text-[11px] text-amber-400 font-medium">Sistem Kasir Terintegrasi</p>
            </div>
          </Link>

          {pathname !== '/' && (
            <Link
              href="/"
              onClick={(e) => handleNavClick(e, '/')}
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
              title="Kembali ke Layar Kasir POS"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline font-medium">Kasir POS</span>
            </Link>
          )}

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
                onChange={handleOutletSelect}
                aria-label="Pilih cabang operasional"
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

        {/* Center Section: Cash Session Status & Simulation Mode (POS Only) */}
        {isPos && (
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
                {onCloseSessionClick && (
                  <button
                    onClick={onCloseSessionClick}
                    className="ml-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600 transition-colors flex items-center gap-1"
                    title="Tutup sesi kasir shift ini"
                  >
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>Tutup Kasir</span>
                  </button>
                )}
              </div>
            ) : (
              onOpenSessionClick && (
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
              )
            )}
          </div>
        )}

        {/* Right Section: Time, Cashier Profile, Nav Links & Sign Out */}
        <div className="flex items-center gap-2">
          {/* Clock */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-300 bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono font-medium">{currentTime || '00:00:00'}</span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Navigasi Utama Aplikasi">
            {navItems
              .filter((item) => item.visible)
              .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                if (item.external) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 px-2.5 py-1.5 rounded-lg border border-amber-500/30 transition-colors"
                      title={item.title}
                    >
                      <Icon className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden xl:inline font-medium">{item.label}</span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => handleNavClick(e, item.href)}
                    className={getNavLinkClass(item.href)}
                    title={item.title}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        isActive ? 'text-amber-300' : 'text-amber-400'
                      }`}
                    />
                    <span className="hidden sm:inline font-medium">{item.label}</span>
                  </Link>
                );
              })}
          </nav>

          {/* Mobile Main Navigation Button (< md) */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors"
            aria-label="Buka menu navigasi aplikasi"
            aria-expanded={mobileNavOpen}
          >
            <Menu className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-xs">Menu</span>
          </button>

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

      {/* Mobile Application Navigation Drawer (< md) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end animate-in fade-in duration-150">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            className="relative w-full max-w-xs bg-slate-900 border-l border-slate-800 h-full p-4 flex flex-col shadow-2xl overflow-y-auto z-10"
            role="dialog"
            aria-modal="true"
            aria-label="Menu Navigasi Aplikasi"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-sm">
                  💈
                </span>
                <div>
                  <h2 className="text-sm font-bold text-white leading-tight">Barbershop OS</h2>
                  <p className="text-[10px] text-amber-400 font-medium">Menu Navigasi Aplikasi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Tutup menu navigasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Outlet Context Badge */}
            <div className="mt-3 py-2 px-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div className="truncate">
                  <div className="text-[10px] text-slate-400">Cabang Aktif</div>
                  <div className="text-slate-100 font-semibold truncate">
                    {currentOutlet?.name || 'Cabang Belum Dipilih'}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-700 text-amber-300">
                {currentOutlet?.code || '-'}
              </span>
            </div>

            {/* Navigation Groups */}
            <div className="flex-1 mt-4 space-y-4 overflow-y-auto pr-0.5">
              {/* Group 1: Kasir & Layanan */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-2 py-0.5">
                  Layanan Kasir
                </div>
                <div className="space-y-1">
                  <Link
                    href="/"
                    onClick={(e) => handleNavClick(e, '/')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <ArrowLeft className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Kasir POS</span>
                  </Link>

                  <Link
                    href="/queue"
                    onClick={(e) => handleNavClick(e, '/queue')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/queue'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Scissors className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Antrean Kursi</span>
                  </Link>

                  <Link
                    href="/book"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition"
                  >
                    <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="flex-1 flex items-center justify-between">
                      <span>Portal Booking</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                        Tab Baru
                      </span>
                    </div>
                  </Link>

                  <Link
                    href="/history"
                    onClick={(e) => handleNavClick(e, '/history')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/history'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <History className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Riwayat Transaksi</span>
                  </Link>
                </div>
              </div>

              {/* Group 2: Operasional & Keuangan Cabang */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-2 py-0.5">
                  Operasional & CRM
                </div>
                <div className="space-y-1">
                  <Link
                    href="/inventory"
                    onClick={(e) => handleNavClick(e, '/inventory')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/inventory'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Package className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Inventori & Stok</span>
                  </Link>

                  {!isCashier && (
                    <Link
                      href="/purchases"
                      onClick={(e) => handleNavClick(e, '/purchases')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        pathname === '/purchases'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Truck className="w-4 h-4 text-blue-400 shrink-0" />
                      <span>Pembelian Stok</span>
                    </Link>
                  )}

                  <Link
                    href="/expenses"
                    onClick={(e) => handleNavClick(e, '/expenses')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/expenses'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Receipt className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Biaya Operasional</span>
                  </Link>

                  <Link
                    href="/commissions"
                    onClick={(e) => handleNavClick(e, '/commissions')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/commissions'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Komisi Kapster</span>
                  </Link>

                  <Link
                    href="/customers"
                    onClick={(e) => handleNavClick(e, '/customers')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname === '/customers'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Users className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>CRM Pelanggan</span>
                  </Link>
                </div>
              </div>

              {/* Group 3: Manajemen & Konfigurasi */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-2 py-0.5">
                  Manajemen & Konfigurasi
                </div>
                <div className="space-y-1">
                  {!isCashier && (
                    <Link
                      href="/accounting"
                      onClick={(e) => handleNavClick(e, '/accounting')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        pathname === '/accounting'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Laporan Keuangan</span>
                    </Link>
                  )}

                  {!isCashier && (
                    <Link
                      href="/analytics"
                      onClick={(e) => handleNavClick(e, '/analytics')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        pathname === '/analytics'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Analitik Bisnis</span>
                    </Link>
                  )}

                  {isOwner && (
                    <Link
                      href="/subaccounts"
                      onClick={(e) => handleNavClick(e, '/subaccounts')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        pathname === '/subaccounts'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Users className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Sub-Akun Kasir</span>
                    </Link>
                  )}

                  {canAccessSettings && (
                    <Link
                      href="/settings"
                      onClick={(e) => handleNavClick(e, '/settings')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        pathname === '/settings'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Settings className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Settings & Sistem</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-amber-400">
                  {profile?.display_name?.slice(0, 2).toUpperCase() || 'KS'}
                </div>
                <div className="truncate text-xs">
                  <div className="font-semibold text-slate-100 truncate">
                    {profile?.display_name || 'Kasir'}
                  </div>
                  <div className="text-[10px] text-amber-400 font-medium">
                    {isCashier ? 'Kasir Cabang' : 'Owner / Admin'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await handleRefresh();
                    setMobileNavOpen(false);
                  }}
                  disabled={isRefreshing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-medium border border-red-800/40 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
