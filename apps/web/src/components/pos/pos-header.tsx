'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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

interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  visible: boolean;
  external?: boolean;
  badge?: string;
}

interface NavGroupConfig {
  name: string;
  items: NavItemConfig[];
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

  const router = useRouter();
  const pathname = usePathname();

  const canAccessSettings = roleCode === 'OWNER' || roleCode === 'ADMIN';
  const isPos = variant ? variant === 'pos' : Boolean(onOpenSessionClick || onCloseSessionClick);

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

  // Live operational clock
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

  const handleOutletSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectElement = e.target;
    const previousValue = currentOutlet?.id || '';
    const targetId = selectElement.value;
    const target = availableOutlets.find((o) => o.id === targetId);
    if (!target) {
      selectElement.value = previousValue;
      return;
    }
    if (onBeforeOutletChange) {
      const allowed = await onBeforeOutletChange(target);
      if (!allowed) {
        selectElement.value = previousValue;
        return;
      }
    }
    setCurrentOutlet(target);
  };

  const handleNavClick = async (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    // 1. Same-page click: prevent navigation, close mobile menu, no confirmation required
    if (pathname === href) {
      e.preventDefault();
      setMobileNavOpen(false);
      return;
    }

    // 2. If no navigation guard is provided, allow default Next.js Link navigation
    if (!onBeforeNavigate) {
      setMobileNavOpen(false);
      return;
    }

    // 3. Navigation guard is active: IMMEDIATELY prevent default navigation synchronously
    e.preventDefault();

    // 4. Await decision (supports boolean and Promise<boolean>)
    const allowed = await onBeforeNavigate(href);

    // 5. If Cancel: stay on current page, do not navigate
    if (!allowed) {
      return;
    }

    // 6. If Allow: close mobile menu and navigate programmatically
    setMobileNavOpen(false);
    router.push(href);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  };

  // Structured navigation groups
  const navGroups: NavGroupConfig[] = [
    {
      name: 'POS',
      items: [
        {
          href: '/queue',
          label: 'Antrean',
          icon: Scissors,
          title: 'Sistem Antrean Kursi & Janji Temu',
          visible: true,
        },
        {
          href: '/book',
          label: 'Portal Booking',
          icon: Calendar,
          title: 'Buka Portal Reservasi Mandiri Pelanggan (Tab Baru)',
          visible: true,
          external: true,
          badge: 'Tab Baru',
        },
        {
          href: '/history',
          label: 'Riwayat Nota',
          icon: History,
          title: 'Riwayat Transaksi Penjualan',
          visible: true,
        },
      ],
    },
    {
      name: 'Operasional',
      items: [
        {
          href: '/inventory',
          label: 'Inventori',
          icon: Package,
          title: 'Manajemen Persediaan & Stok Cabang',
          visible: true,
        },
        {
          href: '/purchases',
          label: 'Pembelian',
          icon: Truck,
          title: 'Manajemen Pembelian Stok & Hutang Supplier',
          visible: !isCashier,
        },
        {
          href: '/expenses',
          label: 'Biaya',
          icon: Receipt,
          title: 'Biaya Operasional & Kas Kecil (Petty Cash)',
          visible: true,
        },
        {
          href: '/commissions',
          label: 'Komisi',
          icon: Coins,
          title: 'Komisi & Performa Kapster Cabang',
          visible: true,
        },
        {
          href: '/customers',
          label: 'Pelanggan',
          icon: Users,
          title: 'CRM Pelanggan & Loyalitas',
          visible: true,
        },
      ],
    },
    {
      name: 'Manajemen',
      items: [
        {
          href: '/accounting',
          label: 'Keuangan',
          icon: BarChart3,
          title: 'Laporan Keuangan & Akuntansi (Khusus Owner)',
          visible: !isCashier,
        },
        {
          href: '/analytics',
          label: 'Analitik',
          icon: TrendingUp,
          title: 'Analitik Bisnis & Dashboard Owner (Khusus Owner)',
          visible: !isCashier,
        },
        {
          href: '/subaccounts',
          label: 'Sub-Akun',
          icon: Users,
          title: 'Kelola & Buat Sub-Akun Kasir Cabang (Khusus Owner)',
          visible: isOwner,
        },
        {
          href: '/settings',
          label: 'Settings',
          icon: Settings,
          title: 'Pengaturan Bisnis & Sistem (Khusus Owner / Admin)',
          visible: canAccessSettings,
        },
      ],
    },
  ];

  return (
    <header className="sticky top-0 z-30 shadow-md">
      {/* ========================================================================= */}
      {/* TIER 1: Global Application Shell (Brand, Context, State & Utilities)      */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 text-white border-b border-slate-800 px-3 sm:px-4 py-2 sm:py-2.5">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left Area: Brand Lockup & Operating Outlet */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Brand Logo & Name */}
            <Link
              href="/"
              onClick={(e) => handleNavClick(e, '/')}
              className="flex items-center gap-2.5 group cursor-pointer shrink-0"
              title="Ke Layar Kasir POS"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 shadow-xs group-hover:bg-amber-400 transition-colors shrink-0">
                <Scissors className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              </div>
              <div className="hidden sm:block text-left">
                <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
                  Barbershop POS
                </h1>
                <p className="text-[10px] text-amber-400 font-semibold tracking-wide uppercase leading-tight">
                  Operating System
                </p>
              </div>
            </Link>

            {/* Quick Return to POS (when outside root) */}
            {pathname !== '/' && (
              <Link
                href="/"
                onClick={(e) => handleNavClick(e, '/')}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-2.5 py-1.5 rounded-lg border border-slate-700/80 transition-colors shrink-0"
                title="Kembali ke Layar Kasir POS"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden md:inline">Kasir POS</span>
              </Link>
            )}

            <div className="h-5 w-px bg-slate-800 hidden sm:block shrink-0" aria-hidden="true" />

            {/* Operating Outlet Selector / Cashier Locked Badge */}
            {isCashier ? (
              <div
                className="flex items-center gap-1.5 bg-slate-800/80 border border-amber-500/30 px-2.5 py-1.5 rounded-lg text-xs shrink-0"
                title="Cabang terkunci khusus penugasan akun kasir ini"
              >
                <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="font-semibold text-white truncate max-w-[110px] sm:max-w-[140px]">
                  {currentOutlet?.name || 'Cabang Kasir'}
                </span>
                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-300 font-bold ml-0.5 uppercase tracking-wide">
                  Terkunci
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 hover:border-slate-600 px-2.5 py-1.5 rounded-lg text-xs transition-colors shrink-0">
                <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <select
                  value={currentOutlet?.id || ''}
                  onChange={handleOutletSelect}
                  aria-label="Pilih cabang operasional"
                  className="bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer pr-1 text-xs"
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

          {/* Center Area: Cash Session Status & Simulation Pill (Desktop / Tablet) */}
          <div className="hidden lg:flex items-center gap-2">
            {simulatedRole && (
              <div className="flex items-center gap-1.5 bg-amber-500 text-slate-950 px-2.5 py-1 rounded-lg text-xs font-bold shadow-xs animate-pulse shrink-0">
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Simulasi Kasir ({currentOutlet?.code})</span>
                <button
                  onClick={() => simulateRole(null)}
                  className="ml-1 rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 hover:bg-slate-900 transition cursor-pointer"
                  title="Keluar dari mode simulasi kasir"
                >
                  Keluar
                </button>
              </div>
            )}

            {isPos && (
              activeSession ? (
                <div className="flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs text-emerald-300 shrink-0">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-semibold text-emerald-200">Laci Kasir BUKA</span>
                  {onCloseSessionClick && (
                    <button
                      onClick={onCloseSessionClick}
                      className="ml-1 text-[11px] bg-slate-800/90 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600/80 transition-colors flex items-center gap-1 cursor-pointer font-medium"
                      title="Tutup sesi kasir shift ini"
                    >
                      <Lock className="w-3 h-3 text-amber-400" />
                      <span>Tutup Kasir</span>
                    </button>
                  )}
                </div>
              ) : (
                onOpenSessionClick && (
                  <div className="flex items-center gap-2 bg-amber-950/50 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs text-amber-300 shrink-0">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0"></span>
                    <span className="font-semibold text-amber-200">Laci Kasir TUTUP</span>
                    <button
                      onClick={onOpenSessionClick}
                      className="ml-1 text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                      title="Buka sesi kasir dengan modal awal"
                    >
                      <Unlock className="w-3 h-3 text-slate-950" />
                      <span>Buka Kasir</span>
                    </button>
                  </div>
                )
              )
            )}
          </div>

          {/* Right Area: Time, Utilities, Account Profile & Mobile Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Operational Clock */}
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/50 px-2.5 py-1.5 rounded-lg border border-slate-700/50 shrink-0">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-mono font-medium">{currentTime || '00:00:00'}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
              title="Muat Ulang Data POS"
              aria-label="Muat ulang data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Cashier / Account Profile Chip */}
            <div className="flex items-center gap-2 pl-0.5 shrink-0">
              <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0 shadow-xs">
                {profile?.display_name?.slice(0, 2).toUpperCase() || 'KS'}
              </div>
              <div className="hidden sm:block text-left text-xs leading-tight">
                <div className="font-semibold text-slate-100 truncate max-w-[100px] lg:max-w-[120px]">
                  {profile?.display_name || 'Kasir'}
                </div>
                <div className="text-[10px] text-amber-400/90 font-medium">
                  {isCashier ? 'Kasir Cabang' : 'Owner / Admin'}
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={signOut}
              className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-slate-800 rounded-lg border border-slate-700/60 transition-colors shrink-0 cursor-pointer"
              title="Keluar / Ganti Akun"
              aria-label="Keluar akun"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>

            {/* Mobile Navigation Trigger Button (< md) */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition-colors shrink-0 cursor-pointer"
              aria-label="Buka menu navigasi aplikasi"
              aria-expanded={mobileNavOpen}
            >
              <Menu className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-xs">Menu</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TIER 2: Primary Navigation Strip (Desktop: md and up)                     */}
      {/* ========================================================================= */}
      <nav
        className="hidden md:flex items-center bg-slate-950/70 border-b border-slate-800/80 px-4 py-1.5 backdrop-blur-xs overflow-x-auto scrollbar-none"
        aria-label="Navigasi Utama Aplikasi"
      >
        <div className="flex items-center gap-1.5 w-full">
          {navGroups.map((group, groupIdx) => {
            const visibleItems = group.items.filter((item) => item.visible);
            if (visibleItems.length === 0) return null;

            return (
              <React.Fragment key={group.name}>
                {groupIdx > 0 && (
                  <div
                    className="h-4 w-px bg-slate-800 mx-1.5 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);

                    if (item.external) {
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 px-2.5 py-1 rounded-md transition-colors"
                          title={item.title}
                        >
                          <Icon className="w-3.5 h-3.5 text-amber-400/80" />
                          <span className="font-medium">{item.label}</span>
                          {item.badge && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={(e) => handleNavClick(e, item.href)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-all ${
                          isActive
                            ? 'text-amber-300 font-semibold bg-amber-500/15 border border-amber-500/30 shadow-xs'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 font-medium'
                        }`}
                        title={item.title}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 transition-colors ${
                            isActive ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      {/* ========================================================================= */}
      {/* MOBILE APPLICATION NAVIGATION DRAWER (< md)                               */}
      {/* ========================================================================= */}
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
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 shadow-xs shrink-0">
                  <Scissors className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                </div>
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

            {/* Simulation Banner in Mobile Drawer */}
            {simulatedRole && (
              <div className="mt-2 py-1.5 px-2.5 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Simulasi Kasir ({currentOutlet?.code})</span>
                </div>
                <button
                  onClick={() => simulateRole(null)}
                  className="rounded bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400"
                >
                  Keluar
                </button>
              </div>
            )}

            {/* Session State in Mobile Drawer */}
            {isPos && (
              <div className="mt-2">
                {activeSession ? (
                  <div className="flex items-center justify-between bg-emerald-950/60 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="font-semibold text-emerald-200">Laci BUKA</span>
                    </div>
                    {onCloseSessionClick && (
                      <button
                        onClick={() => {
                          setMobileNavOpen(false);
                          onCloseSessionClick();
                        }}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-600 transition-colors flex items-center gap-1"
                      >
                        <Lock className="w-3 h-3 text-amber-400" />
                        <span>Tutup Kasir</span>
                      </button>
                    )}
                  </div>
                ) : (
                  onOpenSessionClick && (
                    <div className="flex items-center justify-between bg-amber-950/50 border border-amber-500/30 px-3 py-2 rounded-xl text-xs text-amber-300">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                        <span className="font-semibold text-amber-200">Laci TUTUP</span>
                      </div>
                      <button
                        onClick={() => {
                          setMobileNavOpen(false);
                          onOpenSessionClick();
                        }}
                        className="text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2 py-0.5 rounded shadow-xs transition-colors flex items-center gap-1"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Buka Kasir</span>
                      </button>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Navigation Groups in Mobile Drawer */}
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
                      pathname.startsWith('/queue')
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
                      pathname.startsWith('/history')
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <History className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Riwayat Transaksi</span>
                  </Link>
                </div>
              </div>

              {/* Group 2: Operasional & CRM */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-2 py-0.5">
                  Operasional & CRM
                </div>
                <div className="space-y-1">
                  <Link
                    href="/inventory"
                    onClick={(e) => handleNavClick(e, '/inventory')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname.startsWith('/inventory')
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
                        pathname.startsWith('/purchases')
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Pembelian Stok</span>
                    </Link>
                  )}

                  <Link
                    href="/expenses"
                    onClick={(e) => handleNavClick(e, '/expenses')}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                      pathname.startsWith('/expenses')
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
                      pathname.startsWith('/commissions')
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
                      pathname.startsWith('/customers')
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <Users className="w-4 h-4 text-amber-400 shrink-0" />
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
                        pathname.startsWith('/accounting')
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Laporan Keuangan</span>
                    </Link>
                  )}

                  {!isCashier && (
                    <Link
                      href="/analytics"
                      onClick={(e) => handleNavClick(e, '/analytics')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition ${
                        pathname.startsWith('/analytics')
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
                        pathname.startsWith('/subaccounts')
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
                        pathname.startsWith('/settings')
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
            <div className="pt-4 border-t border-slate-800 space-y-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
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
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 text-xs font-medium border border-red-800/40 transition cursor-pointer"
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
