'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';

export default function MobileActivationPage(): React.JSX.Element {
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [website, setWebsite] = useState('');

  async function refreshCode() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/mobile-activation', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Gagal membuat kode aktivasi.');
      setPairing(body);
    } catch (cause) {
      setPairing(null);
      setError(cause instanceof Error ? cause.message : 'Gagal membuat kode aktivasi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setWebsite(window.location.origin);
    void refreshCode();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-lg space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <Link href="/settings" className="text-sm text-amber-400 hover:underline">← Kembali ke Pengaturan</Link>
        <div>
          <h1 className="text-xl font-bold">Aktivasi APK</h1>
          <p className="mt-1 text-sm text-slate-400">Masukkan alamat web dan kode ini di APK pelanggan. Kode hanya berlaku sementara; login tetap memakai akun pelanggan.</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
          <p className="text-xs uppercase text-slate-400">Alamat web pelanggan</p>
          <p className="mt-1 break-all font-mono text-sm">{website}</p>
        </div>
        {pairing && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-xs uppercase text-amber-300">Kode aktivasi</p>
            <p className="mt-2 select-all font-mono text-3xl font-bold tracking-widest" aria-label="Kode aktivasi APK">{pairing.code}</p>
            <p className="mt-2 text-xs text-slate-400">Berlaku hingga {new Date(pairing.expiresAt).toLocaleString('id-ID')}</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="button" onClick={() => void refreshCode()} disabled={loading} className="rounded-xl bg-amber-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
          {loading ? 'Membuat kode...' : 'Buat kode baru'}
        </button>
      </div>
    </main>
  );
}
