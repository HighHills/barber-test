'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePos } from '../../context/pos-context';
import type { SettingsSectionId } from '../../types/settings';
import { BusinessSettingsPanel } from './business-settings-panel';
import { OutletSettingsPanel } from './outlet-settings-panel';
import { StaffSettingsPanel } from './staff-settings-panel';
import { EmployeeSchedulePanel } from './employee-schedule-panel';
import { EmployeeLeavePanel } from './employee-leave-panel';
import { SubaccountsSettingsPanel } from './subaccounts-settings-panel';
import { RolesPermissionsPanel } from './roles-permissions-panel';
import {
  Building2,
  Store,
  Users,
  CalendarDays,
  Calendar,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  Settings,
  CheckCircle2,
  AlertCircle,
  X,
  Menu,
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
  const { currentOutlet } = usePos();

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

  const handleSelectSection = (newSection: SettingsSectionId) => {
    if (newSection === activeSection) return;

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3.5 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700/80 transition"
              title="Kembali ke Layar POS Kasir"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">Layar POS</span>
            </Link>

            <div className="h-5 w-px bg-slate-800 mx-1 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-white leading-tight">
                  Pusat Pengaturan Bisnis
                </h1>
                <p className="text-[11px] text-amber-400 font-medium">
                  Portal Konfigurasi Owner & Administrator
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {currentOutlet && (
              <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/60 px-2.5 py-1 rounded-lg text-xs">
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-slate-300 font-medium">{currentOutlet.name}</span>
                <span className="text-[10px] font-mono text-amber-400/80 bg-slate-900 px-1.5 py-0.5 rounded">
                  {currentOutlet.code}
                </span>
              </div>
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

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
              className="p-1 hover:bg-white/10 rounded transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col md:flex-row gap-6 p-4 sm:p-6">
        {/* Left Sidebar (Desktop & Mobile Drawer) */}
        <aside
          className={`${
            mobileMenuOpen ? 'block' : 'hidden'
          } md:block w-full md:w-64 shrink-0 space-y-6 bg-slate-900/80 md:bg-transparent p-4 md:p-0 rounded-2xl md:rounded-none border md:border-0 border-slate-800`}
        >
          {sidebarGroups.map((group) => (
            <div key={group.groupName} className="space-y-1.5">
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase px-3">
                {group.groupName}
              </div>

              <div className="space-y-1">
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
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                        isActive
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                      <span>{item.label}</span>
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
