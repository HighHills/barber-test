'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePos } from '../../context/pos-context';

type CardSettings = {
  name: string;
  logo: string;
  background: string;
  lifetime: boolean;
  months: number;
};

export function MemberCardSettingsPanel({ onDirtyChange, onNotification }: {
  onDirtyChange?: (dirty: boolean) => void;
  onNotification?: (notification: { type: 'SUCCESS' | 'ERROR'; message: string }) => void;
}): React.JSX.Element {
  const { supabase } = usePos();
  const [saved, setSaved] = useState<CardSettings | null>(null);
  const [form, setForm] = useState<CardSettings | null>(null);
  const [businessLogo, setBusinessLogo] = useState('');
  const [busy, setBusy] = useState<'logo' | 'background' | 'save' | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('business_settings')
      .select('business_name,logo_url,member_card_name,member_card_logo_url,member_card_background_url,member_card_lifetime,member_card_validity_months')
      .limit(1).single();
    if (loadError) { setError(loadError.message); return; }
    const settings = {
      name: data.member_card_name || data.business_name,
      logo: data.member_card_logo_url || '',
      background: data.member_card_background_url || '',
      lifetime: data.member_card_lifetime || false,
      months: data.member_card_validity_months || 12,
    };
    setBusinessLogo(data.logo_url || '');
    setSaved(settings);
    setForm(settings);
  }, [supabase]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { onDirtyChange?.(Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved))); }, [form, saved, onDirtyChange]);
  const set = (change: Partial<CardSettings>) => setForm((value) => value && { ...value, ...change });
  const upload = async (file: File, field: 'logo' | 'background') => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Pilih PNG, JPG, atau WebP dengan ukuran maksimal 2 MB.'); return;
    }
    setBusy(field); setError('');
    try {
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      // Unique paths preserve images embedded in cards issued before a redesign.
      const path = `${crypto.randomUUID()}.${extension}`;
      const bucket = supabase.storage.from('member-card-assets');
      const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      set({ [field]: bucket.getPublicUrl(path).data.publicUrl });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Gagal mengunggah gambar.');
    } finally { setBusy(null); }
  };
  const save = async () => {
    if (!form) return;
    if (!form.name.trim() || form.name.trim().length > 100 || !Number.isInteger(form.months) || form.months < 1 || form.months > 1200 ||
      [form.logo, form.background].some((url) => url && (!/^https:\/\/\S+$/i.test(url) || url.length > 2048))) {
      setError('Isi nama dan masa berlaku yang valid.'); return;
    }
    setBusy('save'); setError('');
    try {
      const { error: saveError } = await supabase.rpc('save_member_card_settings', {
        p_name: form.name.trim(), p_logo_url: form.logo.trim() || null,
        p_background_url: form.background.trim() || null,
        p_lifetime: form.lifetime, p_validity_months: form.months,
      });
      if (saveError) throw saveError;
      const next = { ...form, name: form.name.trim() };
      setSaved(next); setForm(next);
      onNotification?.({ type: 'SUCCESS', message: 'Pengaturan kartu member tersimpan. Hanya kartu baru yang memakai pengaturan ini.' });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Gagal menyimpan pengaturan kartu.';
      setError(message); onNotification?.({ type: 'ERROR', message });
    } finally { setBusy(null); }
  };
  if (!form) return <div className="rounded-2xl bg-slate-900 p-6 text-slate-300">{error || 'Memuat pengaturan kartu...'}</div>;
  return <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-slate-100 sm:p-5">
    <div><h2 className="text-lg font-bold">Kartu Member Digital</h2><p className="text-xs text-slate-400">Atur desain dan masa berlaku kartu baru. Kartu yang sudah diterbitkan tetap sama.</p></div>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <label className="block text-xs font-semibold text-slate-300">Nama barber / brand<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} /></label>
          <div className="space-y-2"><label className="flex items-center gap-2 text-xs font-semibold text-slate-300"><input type="checkbox" checked={form.lifetime} onChange={(e) => set({ lifetime: e.target.checked })} /> Seumur hidup</label>
            {!form.lifetime && <label className="block text-xs font-semibold text-slate-300">Masa aktif (bulan)<input type="number" min={1} max={1200} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={form.months} onChange={(e) => set({ months: Number(e.target.value) })} /></label>}
          </div>
        </div>
        <div><h3 className="text-sm font-semibold">Gambar Kartu</h3><p className="text-xs text-slate-400">PNG, JPG, atau WebP, maksimal 2 MB. Gambar diunggah ke Supabase Storage.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([{ field: 'logo', label: 'Logo', shape: 'object-contain' }, { field: 'background', label: 'Background', shape: 'object-cover' }] as const).map(({ field, label, shape }) => <div key={field} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-500">{form[field] || (field === 'logo' && businessLogo) ? <img src={form[field] || businessLogo} alt={`Pratinjau ${label.toLowerCase()}`} className={`h-full w-full ${shape}`} /> : 'Kosong'}</div>
            <div className="min-w-0"><p className="text-sm font-semibold">{label}</p><p className="text-[11px] text-slate-400">{form[field] ? form[field].includes('/storage/v1/object/public/member-card-assets/') ? 'Di Supabase Storage' : 'Gambar lama' : field === 'logo' && businessLogo ? 'Logo bisnis' : 'Belum ada gambar'}</p><label className="mt-1 inline-flex cursor-pointer rounded-md text-xs font-semibold text-amber-400 focus-within:ring-2 focus-within:ring-amber-400">{busy === field ? 'Mengunggah...' : form[field] ? 'Ganti gambar' : 'Pilih gambar'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(busy)} className="sr-only" aria-label={`Unggah ${label.toLowerCase()} kartu member`} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file, field); }} /></label>
              {form[field] && <button type="button" disabled={Boolean(busy)} onClick={() => set({ [field]: '' })} className="ml-3 text-xs text-slate-400 hover:text-white disabled:opacity-50" aria-label={field === 'logo' ? 'Kembali ke logo bisnis' : 'Lepas background dari desain kartu baru'}>{field === 'logo' ? 'Pakai logo bisnis' : 'Lepas'}</button>}
            </div>
          </div>)}
        </div>
      </div>
      <div className="self-start"><h3 className="mb-2 text-sm font-semibold">Pratinjau Kartu</h3><div className="flex aspect-[1.7] min-h-48 w-full max-w-md flex-col justify-end overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-lg" style={/^https:\/\//i.test(form.background) ? { backgroundImage: `linear-gradient(90deg, rgba(15,23,42,.85), rgba(15,23,42,.5)), url(${JSON.stringify(form.background)})`, backgroundSize: 'cover' } : undefined}>
        {/^https:\/\//i.test(form.logo || businessLogo) && <img src={form.logo || businessLogo} alt="Logo kartu" className="mb-auto h-10 max-w-28 object-contain" />}
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">{form.name}</p><p className="mt-2 text-xl font-bold">Nama Pelanggan</p><p className="font-mono text-xs text-slate-200">CUST-XXXXXXXXXXXX</p><p className="mt-3 text-xs text-slate-200">{form.lifetime ? 'Berlaku seumur hidup' : `Berlaku ${form.months} bulan sejak diterbitkan`}</p>
      </div></div>
    </div>
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4"><p className="text-xs text-slate-400">Unggah gambar, lalu simpan untuk memakainya pada kartu baru.</p><button type="button" disabled={Boolean(busy)} onClick={() => void save()} className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{busy === 'save' ? 'Menyimpan...' : 'Simpan Pengaturan'}</button></div>
  </div>;
}
