'use client';

import React, { useState, useEffect } from 'react';
import type { SettingsSectionId } from '../../types/settings';
import { PosHeader } from '../pos/pos-header';
import { BusinessSettingsPanel } from './business-settings-panel';
import { OutletSettingsPanel } from './outlet-settings-panel';
import { StaffSettingsPanel } from './staff-settings-panel';
import { EmployeeSchedulePanel } from './employee-schedule-panel';
import { EmployeeLeavePanel } from './employee-leave-panel';
import { SubaccountsSettingsPanel } from './subaccounts-settings-panel';
import { RolesPermissionsPanel } from './roles-permissions-panel';
import { ServiceCategoriesPanel } from './service-categories-panel';
import { ServicesPanel } from './services-panel';
import { ProductCategoriesPanel } from './product-categories-panel';
import { ProductsPanel } from './products-panel';
import { PaymentMethodsPanel } from './payment-methods-panel';
import type { Outlet } from '../../types/pos';
import {
  Building2,
  Store,
  Users,
  CalendarDays,
  Calendar,
  KeyRound,
  ShieldCheck,
  Settings,
  CheckCircle2,
  AlertCircle,
  X,
  Scissors,
  Package,
  CreditCard,
  Layers,
  FolderTree,
} from 'lucide-react';

interface SidebarItem {
  id: SettingsSectionId;
  label: string;
  icon: React.ElementType;
  disabled?: boolean;
}

interface SidebarGroup {
  groupName: string;
  items: SidebarItem[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    groupName: 'BISNIS',
    items: [
      { id: 'business', label: 'Informasi Bisnis', icon: Building2 },
      { id: 'outlets', label: 'Outlet & Cabang', icon: Store },
    ],
  },
  {
    groupName: 'POS & ETALASE',
    items: [
      { id: 'service-categories', label: 'Kategori Layanan', icon: Layers },
      { id: 'services', label: 'Layanan', icon: Scissors },
      { id: 'product-categories', label: 'Kategori Produk', icon: FolderTree },
      { id: 'products', label: 'Produk & Retail', icon: Package },
      { id: 'payment-methods', label: 'Metode Pembayaran', icon: CreditCard },
    ],
  },
  {
    groupName: 'OPERASIONAL',
    items: [
      { id: 'staff', label: 'Staff / Barber', icon: Users },
      { id: 'schedules', label: 'Jadwal Kerja', icon: CalendarDays },
      { id: 'leaves', label: 'Cuti / Leave', icon: Calendar },
    ],
  },
  {
    groupName: 'AKUN & KEAMANAN',
    items: [
      { id: 'subaccounts', label: 'Sub-Akun', icon: KeyRound },
      { id: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
    ],
  },
];

export function SettingsShell(): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('business');
  const [isSectionDirty, setIsSectionDirty] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const [notification, setNotification] = useState<{
    type: 'SUCCESS' | 'ERROR';
    message: string;
  } | null>(null);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Browser tab close / reload protection when settings are dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSectionDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSectionDirty]);

  const handleSelectSection = (newSection: SettingsSectionId) => {
    if (newSection === activeSection) {
      setMobileMenuOpen(false);
      return;
    }

    if (isSectionDirty) {
      const confirmLeave = window.confirm(
        'Ada perubahan pengaturan yang belum disimpan. Yakin ingin berpindah halaman dan membuang perubahan?'
      );
      if (!confirmLeave) return;
    }

    setActiveSection(newSection);
    setIsSectionDirty(false);
    setMobileMenuOpen(false);
  };

  const handleBeforeOutletChange = (_targetOutlet: Outlet): boolean => {
    if (isSectionDirty) {
      const confirmSwitch = window.confirm(
        'Ada perubahan pengaturan yang belum disimpan. Yakin ingin berpindah cabang dan membuang perubahan?'
      );
      if (!confirmSwitch) return false;
      setIsSectionDirty(false);
    }
    return true;
  };

  const handleBeforeNavigate = (_href: string): boolean => {
    if (isSectionDirty) {
      const confirmLeave = window.confirm(
        'Ada perubahan pengaturan yang belum disimpan. Yakin ingin meninggalkan halaman pengaturan dan membuang perubahan?'
      );
      if (!confirmLeave) return false;
      setIsSectionDirty(false);
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Unified Application Header (matching POS & OS shell, with POS state isolation and dirty guards) */}
      <PosHeader
        variant="app"
        onBeforeOutletChange={handleBeforeOutletChange}
        onBeforeNavigate={handleBeforeNavigate}
      />

      {/* 2. Operational Context Sub-Header */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Settings
              </h1>
              <p className="text-xs text-slate-400">
                Kelola konfigurasi bisnis dan sistem operasional.
              </p>
            </div>
          </div>

          {/* Mobile Category Navigation Button (distinct from Header Menu) */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle menu kategori pengaturan"
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Layers className="w-4 h-4 text-amber-400" />
            )}
            <span>Kategori Pengaturan</span>
          </button>
        </div>
      </section>

      {/* Global Notification Banner */}
      {notification && (
        <div
          className={`px-4 py-2.5 text-xs font-medium border-b flex items-center justify-between animate-in fade-in duration-200 ${
            notification.type === 'SUCCESS'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
              : 'bg-red-950/80 text-red-300 border-red-500/30'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              {notification.type === 'SUCCESS' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 hover:bg-white/10 rounded transition text-slate-400 hover:text-white"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row gap-6 p-4 sm:p-6">
        {/* Left Sidebar (Desktop & Mobile Reflow) */}
        <aside
          className={`${
            mobileMenuOpen ? 'block' : 'hidden'
          } md:block w-full md:w-60 shrink-0 space-y-5 bg-slate-900/90 md:bg-transparent p-4 md:p-0 rounded-2xl md:rounded-none border md:border-0 border-slate-800`}
        >
          {sidebarGroups.map((group) => (
            <div key={group.groupName} className="space-y-1">
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase px-3 py-1">
                {group.groupName}
              </div>

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;

                  if (item.disabled) {
                    return (
                      <div
                        key={item.id}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 bg-slate-950/40 cursor-not-allowed opacity-60"
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className="w-4 h-4" />
                          <span>{item.label}</span>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          Segera
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSection(item.id)}
                      className={`w-full group flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition text-left relative focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-400 ${
                        isActive
                          ? 'bg-slate-800 text-amber-300 font-semibold border border-slate-700/80 shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60 border border-transparent'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-400 rounded-r" />
                      )}
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-200'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Right Content Panel */}
        <main className="flex-1 min-w-0">
          {activeSection === 'business' && (
            <BusinessSettingsPanel
              onDirtyChange={setIsSectionDirty}
              onNotification={setNotification}
            />
          )}

          {activeSection === 'outlets' && (
            <OutletSettingsPanel onNotification={setNotification} />
          )}

          {activeSection === 'service-categories' && (
            <ServiceCategoriesPanel onNotification={setNotification} />
          )}

          {activeSection === 'services' && (
            <ServicesPanel onNotification={setNotification} />
          )}

          {activeSection === 'product-categories' && (
            <ProductCategoriesPanel onNotification={setNotification} />
          )}

          {activeSection === 'products' && (
            <ProductsPanel onNotification={setNotification} />
          )}

          {activeSection === 'payment-methods' && (
            <PaymentMethodsPanel onNotification={setNotification} />
          )}

          {activeSection === 'staff' && (
            <StaffSettingsPanel onNotification={setNotification} />
          )}

          {activeSection === 'schedules' && (
            <EmployeeSchedulePanel onNotification={setNotification} />
          )}

          {activeSection === 'leaves' && (
            <EmployeeLeavePanel onNotification={setNotification} />
          )}

          {activeSection === 'subaccounts' && (
            <SubaccountsSettingsPanel onNotification={setNotification} />
          )}

          {activeSection === 'roles' && (
            <RolesPermissionsPanel onNotification={setNotification} />
          )}
        </main>
      </div>
    </div>
  );
}
