'use client';

import React from 'react';
import Link from 'next/link';
import { usePos } from '../../context/pos-context';
import { ShieldAlert, ArrowLeft, RotateCcw, Lock } from 'lucide-react';

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
  pageTitle?: string;
}

export function RoleGuard({
  allowedRoles,
  children,
  pageTitle = 'Halaman Ini',
}: RoleGuardProps): React.JSX.Element {
  const { roleCode, simulatedRole, simulateRole, currentOutlet, isLoading, profile } = usePos();

  // Only show full-screen blocking loader on cold start before profile is loaded.
  // Never unmount or flash children on background refreshes or window refocus!
  if (isLoading && !profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
          <p className="text-sm font-medium text-slate-400">Memverifikasi hak akses akun...</p>
        </div>
      </div>
    );
  }

  // Check if role is allowed
  const isAllowed = allowedRoles.includes(roleCode);

  if (!isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12 text-white">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-slate-800/95 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400 uppercase tracking-wider">
                  Akses Ditolak
                </span>
                <span className="text-xs text-slate-400">Role Aktif: <strong>{roleCode}</strong></span>
              </div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-white">
                Akses Terbatas: Khusus Owner & Admin
              </h2>
            </div>
          </div>

          <div className="space-y-3 text-sm leading-relaxed text-slate-300">
            <p>
              Mohon maaf, <strong>{pageTitle}</strong> tidak dapat diakses oleh sub-akun Kasir.
            </p>
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <p className="font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> Kebijakan Keamanan Kasir:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-slate-300">
                <li>Kasir hanya berwenang pada <strong>POS Transaksi</strong>, <strong>Stok Cabang</strong>, <strong>Antrean</strong>, dan <strong>Riwayat</strong>.</li>
                <li>Laporan Keuangan & Akuntansi (Jurnal, Buku Besar, Neraca) dan Analitik Eksekutif disembunyikan demi kerahasiaan bisnis.</li>
                {currentOutlet && (
                  <li>Kasir terkunci pada cabang: <strong>{currentOutlet.name} ({currentOutlet.code})</strong>.</li>
                )}
              </ul>
            </div>

            {simulatedRole && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <RotateCcw className="w-4 h-4" /> Sedang Dalam Mode Simulasi Kasir
                </p>
                <p className="text-slate-300">
                  Anda sedang menguji sistem sebagai Kasir. Untuk kembali membuka modul ini dengan hak akses Owner, klik tombol di bawah.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {simulatedRole ? (
              <button
                onClick={() => simulateRole(null)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 shadow-lg shadow-amber-500/20"
              >
                <RotateCcw className="h-4 w-4" />
                Kembalikan Akses Owner
              </button>
            ) : null}

            <Link
              href="/"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-slate-700 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke Kasir POS
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
